// Test helper: swap globalThis.fetch for a router of canned responses and
// record every outbound call so tests can assert exactly what the code sent
// (URLs, methods, headers, bodies). No real network I/O ever happens — an
// unmatched request gets a loud 599 so a test can never silently pass while
// talking to the wrong endpoint.

export interface RecordedCall {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
}

export interface MockRoute {
    method?: string;
    /** Substring or regex matched against the full request URL. */
    match: string | RegExp;
    reply: (call: RecordedCall) => Response | Promise<Response>;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

/** Run `fn` with fetch mocked by `routes`; restores the real fetch after. */
export async function withMockFetch<T>(
    routes: MockRoute[],
    fn: (calls: RecordedCall[]) => Promise<T>,
): Promise<T> {
    const calls: RecordedCall[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const req = new Request(input, init);
        const body = req.method === "GET" || req.method === "HEAD" ? null : await req.clone().text();
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => { headers[k] = v; });
        const call: RecordedCall = { method: req.method, url: req.url, headers, body };
        calls.push(call);
        for (const r of routes) {
            if (r.method && r.method !== req.method) continue;
            const hit = typeof r.match === "string" ? req.url.includes(r.match) : r.match.test(req.url);
            if (hit) return await r.reply(call);
        }
        return jsonResponse({ error: `unmocked ${req.method} ${req.url}` }, 599);
    }) as typeof fetch;
    try {
        return await fn(calls);
    } finally {
        // Give un-awaited fire-and-forget requests (rate-limit cleanup) a tick
        // to resolve against the mock before it is torn down.
        await new Promise((r) => setTimeout(r, 30));
        globalThis.fetch = realFetch;
    }
}

/** Calls whose URL contains `fragment` (e.g. "api.stripe.com"). */
export function callsTo(calls: RecordedCall[], fragment: string): RecordedCall[] {
    return calls.filter((c) => c.url.includes(fragment));
}
