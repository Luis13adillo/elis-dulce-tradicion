// =====================================================================
// Shared authorization guard for sensitive Edge Functions
// =====================================================================
// Audit 2026-07-28 proved that every deployed Edge Function had
// verify_jwt = false AND no application-level authorization. An
// unauthenticated request to send-ready-notification was accepted and
// only rejected for a missing order body — meaning anyone on the internet
// could send branded "your order is ready" / "your payment failed, retry
// here" email from the bakery's verified sending domain to any address.
//
// WHY NOT JUST TURN verify_jwt BACK ON: the anon key is public — it ships
// inside the site's JavaScript bundle. verify_jwt = true is satisfied by
// that anon key, so it stops nobody. Authorization has to be done here.
//
// TWO ACCEPTED CALLER IDENTITIES
//   1. Internal / machine callers — the Stripe webhook, order-cancel and
//      scheduled-order-transitions invoke these functions with
//      `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
//   2. Staff — the Front Desk and Owner Dashboard invoke them from the
//      browser, which attaches the signed-in user's JWT. We resolve that
//      JWT and require user_profiles.role in (owner, baker).
//
// Anonymous customers are rejected. No current customer-facing screen
// invokes any of the guarded functions (verified by grepping every
// functions.invoke call in src/ on 2026-07-28).
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

/** Length-independent constant-time string compare. */
function timingSafeEqual(a: string, b: string): boolean {
    const enc = new TextEncoder();
    const ab = enc.encode(a);
    const bb = enc.encode(b);
    // Compare a fixed number of bytes so length alone does not leak via timing.
    const len = Math.max(ab.length, bb.length);
    let diff = ab.length ^ bb.length;
    for (let i = 0; i < len; i++) {
        diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
    }
    return diff === 0;
}

function bearerToken(req: Request): string | null {
    const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!header) return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

/**
 * True when the caller presented the service-role key — i.e. another Edge
 * Function or pg_cron, not a browser.
 */
export function isServiceRoleCaller(req: Request): boolean {
    const token = bearerToken(req);
    if (!token || !SUPABASE_SERVICE_ROLE_KEY) return false;
    return timingSafeEqual(token, SUPABASE_SERVICE_ROLE_KEY);
}

export interface AuthorizedCaller {
    kind: "service" | "staff";
    userId: string | null;
    role: string | null;
}

/**
 * Guard for sensitive functions (sending mail, staff actions).
 *
 * Returns EITHER a `Response` that the handler must return immediately
 * (401/403), OR an `AuthorizedCaller` describing who is calling.
 *
 * Fails closed: if the service-role key is not configured, or the JWT
 * cannot be resolved, or the profile lookup errors, access is denied.
 */
export async function requireStaffOrService(
    req: Request,
): Promise<Response | AuthorizedCaller> {
    if (isServiceRoleCaller(req)) {
        return { kind: "service", userId: null, role: "service_role" };
    }

    const token = bearerToken(req);
    if (!token) {
        return json({ error: "Unauthorized" }, 401);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("authz: SUPABASE_URL / SERVICE_ROLE_KEY not configured — failing closed");
        return json({ error: "Unauthorized" }, 401);
    }

    // Resolve the bearer token to a user. The anon key is NOT a user token,
    // so this rejects the "attacker read the key out of the bundle" case.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
        return json({ error: "Unauthorized" }, 401);
    }

    const { data: profile, error: profErr } = await admin
        .from("user_profiles")
        .select("role")
        .eq("user_id", userData.user.id)
        .maybeSingle();

    if (profErr) {
        console.error("authz: profile lookup failed — failing closed:", profErr.message);
        return json({ error: "Forbidden" }, 403);
    }

    const role = profile?.role ?? null;
    if (role !== "owner" && role !== "baker") {
        return json({ error: "Forbidden" }, 403);
    }

    return { kind: "staff", userId: userData.user.id, role };
}

/** Convenience: true when the guard returned a denial Response. */
export function isDenied(
    result: Response | AuthorizedCaller,
): result is Response {
    return result instanceof Response;
}
