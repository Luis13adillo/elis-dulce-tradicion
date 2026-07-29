// =====================================================================
// Delivery distance + fee — the ONE authoritative server-side origin.
// =====================================================================
// Business rules (final, 2026-07-29):
//   * <= FLAT_RADIUS_MILES driving miles from the bakery -> flat $5 fee.
//   * > FLAT_RADIUS_MILES, or anything we cannot verify -> quote_required
//     (order accepted unpaid; staff enters the real fee before payment).
//   * Fail-safe direction is ALWAYS quote_required — never free delivery,
//     never a silent switch to pickup, never a blocked order.
//
// Coordinates verified 2026-07-29 against OpenStreetMap, which maps the
// bakery itself: node 7392869840 "Eli's Pasteleria Bakery Cafe",
// 324 West Marshall Street, Norristown. Do NOT copy coordinates from
// backend/routes/delivery.js or src/lib/googleMaps.ts — those carried the
// old Bensalem location (40.1063, -74.9526) for months.
//
// Routing providers, in order:
//   1. Google Geocoding + Distance Matrix — only when GOOGLE_MAPS_API_KEY
//      is set as a function secret (optional; most accurate).
//   2. Nominatim (geocoding) + OSRM demo server (driving distance) — no
//      key required. Public instances with fair-use limits; fine at
//      bakery order volume. Any failure or timeout -> quote_required.
// =====================================================================

export const BAKERY_ORIGIN = {
    address: "324 W Marshall St, Norristown, PA 19401",
    lat: 40.1191346,
    lng: -75.3476093,
} as const;

export const FLAT_RADIUS_MILES = 5.0;
export const FLAT_FEE_USD = 5.0;

const METERS_PER_MILE = 1609.344;
const FETCH_TIMEOUT_MS = 6000;
// Nominatim usage policy requires an identifying User-Agent.
const NOMINATIM_UA = "elis-dulce-tradicion-delivery/1.0 (orders@elisbakery.com)";

export interface DeliveryVerdict {
    /** 'flat' = verified <= 5 driving miles; everything else = quote_required */
    status: "flat" | "quote_required";
    fee: number;
    distance_miles: number | null;
    method: "google" | "osm" | null;
    reason: string | null;
}

function quoteRequired(reason: string, distance: number | null = null, method: DeliveryVerdict["method"] = null): DeliveryVerdict {
    return { status: "quote_required", fee: 0, distance_miles: distance, method, reason };
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    return res.json();
}

async function googleDrivingMiles(address: string, apiKey: string): Promise<number> {
    const url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        + `?origins=${encodeURIComponent(BAKERY_ORIGIN.address)}`
        + `&destinations=${encodeURIComponent(address)}`
        + `&units=imperial&mode=driving&key=${apiKey}`;
    // deno-lint-ignore no-explicit-any
    const data = await fetchJson(url) as any;
    const el = data?.rows?.[0]?.elements?.[0];
    if (data?.status !== "OK" || el?.status !== "OK" || typeof el?.distance?.value !== "number") {
        throw new Error(`distance matrix status=${data?.status}/${el?.status}`);
    }
    return el.distance.value / METERS_PER_MILE;
}

async function osmDrivingMiles(address: string): Promise<number> {
    // 1. Geocode the customer address (US-restricted).
    const geoUrl = "https://nominatim.openstreetmap.org/search"
        + `?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
    // deno-lint-ignore no-explicit-any
    const geo = await fetchJson(geoUrl, { "User-Agent": NOMINATIM_UA }) as any[];
    const hit = geo?.[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("address not found by geocoder");
    }
    // 2. Driving route from the bakery.
    const routeUrl = "https://router.project-osrm.org/route/v1/driving/"
        + `${BAKERY_ORIGIN.lng},${BAKERY_ORIGIN.lat};${lng},${lat}?overview=false`;
    // deno-lint-ignore no-explicit-any
    const route = await fetchJson(routeUrl) as any;
    const meters = route?.routes?.[0]?.distance;
    if (route?.code !== "Ok" || typeof meters !== "number") {
        throw new Error(`osrm code=${route?.code}`);
    }
    return meters / METERS_PER_MILE;
}

/**
 * Compute the authoritative delivery verdict for an address.
 * Never throws — every failure mode returns quote_required.
 */
export async function computeDeliveryVerdict(address: string | null | undefined): Promise<DeliveryVerdict> {
    const clean = (address ?? "").trim();
    if (!clean) return quoteRequired("no_address");

    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    let miles: number;
    let method: "google" | "osm";
    try {
        if (googleKey) {
            method = "google";
            miles = await googleDrivingMiles(clean, googleKey);
        } else {
            method = "osm";
            miles = await osmDrivingMiles(clean);
        }
    } catch (err) {
        console.warn(`delivery verdict: distance lookup failed (${(err as Error).message}) — quote_required`);
        return quoteRequired("distance_unverifiable");
    }

    const rounded = Math.round(miles * 100) / 100;
    if (rounded <= FLAT_RADIUS_MILES) {
        return { status: "flat", fee: FLAT_FEE_USD, distance_miles: rounded, method, reason: null };
    }
    return quoteRequired("beyond_flat_radius", rounded, method);
}
