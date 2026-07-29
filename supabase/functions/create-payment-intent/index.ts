// create-payment-intent — thin entrypoint. All logic lives in handler.ts so
// unit tests can invoke the real handler with a mocked network.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handler } from "./handler.ts";

Deno.serve(handler);
