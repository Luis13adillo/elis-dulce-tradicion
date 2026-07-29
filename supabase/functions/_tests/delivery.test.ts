// deno test --allow-env supabase/functions/_tests/delivery.test.ts
//
// Unit tests for the authoritative server-side delivery verdict
// (_shared/delivery.ts) with the geocoding/routing providers mocked at the
// fetch layer. Verifies the business rules end to end:
//   <= 5 driving miles  -> flat $5
//   >  5 driving miles  -> quote_required
//   any failure         -> quote_required (never free, never blocked)

import { assertEquals, assert } from "jsr:@std/assert@1";
import { withMockFetch, jsonResponse, callsTo } from "./mockFetch.ts";
import {
    BAKERY_ORIGIN,
    FLAT_RADIUS_MILES,
    FLAT_FEE_USD,
    computeDeliveryVerdict,
} from "../_shared/delivery.ts";

const METERS_PER_MILE = 1609.344;

function osmRoutes(miles: number) {
    return [
        {
            match: "nominatim.openstreetmap.org",
            reply: () => jsonResponse([{ lat: "40.12", lon: "-75.34" }]),
        },
        {
            match: "router.project-osrm.org",
            reply: () => jsonResponse({ code: "Ok", routes: [{ distance: miles * METERS_PER_MILE }] }),
        },
    ];
}

Deno.test("origin is the verified Norristown bakery, not Bensalem", () => {
    assertEquals(BAKERY_ORIGIN.lat, 40.1191346);
    assertEquals(BAKERY_ORIGIN.lng, -75.3476093);
    assert(BAKERY_ORIGIN.address.includes("Norristown"));
    assert(BAKERY_ORIGIN.address.includes("324 W Marshall St"));
    // The stale Bensalem coordinates must never come back.
    assert(Math.abs(BAKERY_ORIGIN.lat - 40.1063) > 0.001);
    assert(Math.abs(BAKERY_ORIGIN.lng - -74.9526) > 0.1);
});

Deno.test("business constants: 5-mile radius, $5 flat fee", () => {
    assertEquals(FLAT_RADIUS_MILES, 5.0);
    assertEquals(FLAT_FEE_USD, 5.0);
});

Deno.test("within 5 driving miles -> flat $5 (OSM path)", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    await withMockFetch(osmRoutes(4.2), async () => {
        const v = await computeDeliveryVerdict("600 W Marshall St, Norristown, PA 19401");
        assertEquals(v.status, "flat");
        assertEquals(v.fee, 5.0);
        assertEquals(v.distance_miles, 4.2);
        assertEquals(v.method, "osm");
        assertEquals(v.reason, null);
    });
});

Deno.test("exactly 5.00 miles is still flat (boundary is inclusive)", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    await withMockFetch(osmRoutes(5.0), async () => {
        const v = await computeDeliveryVerdict("some address");
        assertEquals(v.status, "flat");
        assertEquals(v.fee, 5.0);
        assertEquals(v.distance_miles, 5.0);
    });
});

Deno.test("5.01 miles -> quote_required, fee 0, reason beyond_flat_radius", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    await withMockFetch(osmRoutes(5.01), async () => {
        const v = await computeDeliveryVerdict("some address");
        assertEquals(v.status, "quote_required");
        assertEquals(v.fee, 0);
        assertEquals(v.distance_miles, 5.01);
        assertEquals(v.reason, "beyond_flat_radius");
    });
});

Deno.test("18 miles (Philadelphia) -> quote_required", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    await withMockFetch(osmRoutes(18.0), async () => {
        const v = await computeDeliveryVerdict("1 S Broad St, Philadelphia, PA 19107");
        assertEquals(v.status, "quote_required");
        assertEquals(v.fee, 0);
    });
});

Deno.test("geocoder finds nothing -> quote_required (distance_unverifiable)", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    const routes = [
        { match: "nominatim.openstreetmap.org", reply: () => jsonResponse([]) },
    ];
    await withMockFetch(routes, async (calls) => {
        const v = await computeDeliveryVerdict("zzz asdfjkl 00000 nowhere lane");
        assertEquals(v.status, "quote_required");
        assertEquals(v.fee, 0);
        assertEquals(v.distance_miles, null);
        assertEquals(v.reason, "distance_unverifiable");
        // It must never have reached the router without coordinates.
        assertEquals(callsTo(calls, "router.project-osrm.org").length, 0);
    });
});

Deno.test("router error -> quote_required (distance_unverifiable)", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    const routes = [
        { match: "nominatim.openstreetmap.org", reply: () => jsonResponse([{ lat: "40.0", lon: "-75.0" }]) },
        { match: "router.project-osrm.org", reply: () => jsonResponse({ code: "NoRoute" }) },
    ];
    await withMockFetch(routes, async () => {
        const v = await computeDeliveryVerdict("some address");
        assertEquals(v.status, "quote_required");
        assertEquals(v.reason, "distance_unverifiable");
    });
});

Deno.test("geocoder HTTP 500 -> quote_required, never throws", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    const routes = [
        { match: "nominatim.openstreetmap.org", reply: () => jsonResponse({ error: "boom" }, 500) },
    ];
    await withMockFetch(routes, async () => {
        const v = await computeDeliveryVerdict("some address");
        assertEquals(v.status, "quote_required");
        assertEquals(v.reason, "distance_unverifiable");
    });
});

Deno.test("empty / missing address -> quote_required with no network calls", async () => {
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
    await withMockFetch([], async (calls) => {
        for (const addr of ["", "   ", null, undefined]) {
            const v = await computeDeliveryVerdict(addr as string | null | undefined);
            assertEquals(v.status, "quote_required");
            assertEquals(v.fee, 0);
            assertEquals(v.reason, "no_address");
        }
        assertEquals(calls.length, 0);
    });
});

Deno.test("Google path used when GOOGLE_MAPS_API_KEY is set", async () => {
    Deno.env.set("GOOGLE_MAPS_API_KEY", "test-google-key");
    try {
        const routes = [
            {
                match: "maps.googleapis.com",
                reply: () => jsonResponse({
                    status: "OK",
                    rows: [{ elements: [{ status: "OK", distance: { value: 3 * METERS_PER_MILE } }] }],
                }),
            },
        ];
        await withMockFetch(routes, async (calls) => {
            const v = await computeDeliveryVerdict("600 W Marshall St, Norristown, PA 19401");
            assertEquals(v.status, "flat");
            assertEquals(v.fee, 5.0);
            assertEquals(v.method, "google");
            assertEquals(v.distance_miles, 3);
            // Never fell through to the keyless providers.
            assertEquals(callsTo(calls, "nominatim").length, 0);
            // The request carried the bakery origin and the API key.
            const g = callsTo(calls, "maps.googleapis.com")[0];
            assert(g.url.includes(encodeURIComponent(BAKERY_ORIGIN.address)));
            assert(g.url.includes("key=test-google-key"));
        });
    } finally {
        Deno.env.delete("GOOGLE_MAPS_API_KEY");
    }
});

Deno.test("Google ZERO_RESULTS -> quote_required", async () => {
    Deno.env.set("GOOGLE_MAPS_API_KEY", "test-google-key");
    try {
        const routes = [
            {
                match: "maps.googleapis.com",
                reply: () => jsonResponse({ status: "OK", rows: [{ elements: [{ status: "ZERO_RESULTS" }] }] }),
            },
        ];
        await withMockFetch(routes, async () => {
            const v = await computeDeliveryVerdict("unfindable address");
            assertEquals(v.status, "quote_required");
            assertEquals(v.reason, "distance_unverifiable");
        });
    } finally {
        Deno.env.delete("GOOGLE_MAPS_API_KEY");
    }
});
