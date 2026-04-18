import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile } from '@/types/auth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase environment variables are not set. Authentication and image uploads will not work.');
}

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
  : null;

export const STORAGE_BUCKET = 'reference-images';

/**
 * Helper to check if Supabase is configured
 */
export const isSupabaseConfigured = () => !!supabase;

/**
 * Wipe all persisted Supabase auth state from localStorage.
 *
 * Used by (a) the one-shot SW/session cleanup in src/lib/pwa.ts when the
 * cleanup-version flag is bumped, and (b) AuthContext when a profile fetch
 * fails — both cases need to evict a potentially-broken session so the
 * user can sign in fresh instead of being trapped on a loading spinner.
 */
export function clearStoredSupabaseSession(): void {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage may be unavailable (private mode, quota) — not fatal
  }
}

/**
 * Get user profile from Supabase.
 *
 * IMPORTANT: this deliberately uses a raw `fetch()` against the PostgREST
 * endpoint instead of `supabase.from('user_profiles').select(...)`. The JS
 * client's query path wraps every request in `navigator.locks`-serialized
 * token-freshness checks (internal auth lock in @supabase/supabase-js),
 * and in React 18 StrictMode that lock can be left held when the
 * AuthProvider effect is double-mounted / torn down mid-session-restore.
 * Every subsequent `from(...).select(...)` then hangs waiting on the lock,
 * producing exactly the 5s timeout we were hitting on both session-restore
 * and signIn flows — while the same query from a Node script (no
 * StrictMode, no lock contention) returned in ~350ms. The raw fetch
 * bypasses the lock entirely. We still get the JWT from
 * `supabase.auth.getSession()` which is synchronous against localStorage.
 *
 * Returns null on: missing session, HTTP error, row missing, abort/timeout.
 * Callers treat null as "session is broken, sign the user out" — see
 * AuthContext.loadUserProfile.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) return null;

  const TIMEOUT_MS = 5_000;
  const startedAt = Date.now();

  // Pull the current JWT. getSession() reads from the in-memory client
  // state (populated from localStorage on init), so this is effectively
  // synchronous and does not touch the network.
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    console.warn('[auth] getUserProfile: no access_token on session — returning null');
    return null;
  }

  const url = new URL(`${supabaseUrl}/rest/v1/user_profiles`);
  url.searchParams.set(
    'select',
    'id,user_id,role,full_name,phone,preferred_language,created_at,updated_at'
  );
  url.searchParams.set('user_id', `eq.${userId}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        // `vnd.pgrst.object+json` gives us .single()-equivalent behavior:
        // PostgREST returns a single object and 406 if 0 or 2+ rows match.
        Accept: 'application/vnd.pgrst.object+json',
      },
      signal: controller.signal,
      // Defense against a stale service worker / HTTP cache ever returning
      // a cached error for this URL.
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.error(
        `[auth] getUserProfile: HTTP ${resp.status} ${resp.statusText} ` +
        `after ${Date.now() - startedAt}ms`
      );
      return null;
    }

    return (await resp.json()) as UserProfile;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn(
        `[auth] getUserProfile aborted after ${TIMEOUT_MS}ms for user ${userId} ` +
        `(elapsed=${Date.now() - startedAt}ms). The raw user_profiles fetch ` +
        `never resolved — check Network tab for a pending request to ` +
        `${supabaseUrl}/rest/v1/user_profiles.`
      );
    } else {
      console.error('[auth] getUserProfile fetch error:', err);
    }
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, 'full_name' | 'phone'>>
): Promise<UserProfile | null> {
  if (!supabase) return null;

  // Optimized: Only select updated columns
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('user_id', userId)
    .select('id, user_id, role, full_name, phone, preferred_language, created_at, updated_at')
    .single();

  if (error) {
    console.error('Error updating user profile:', error);
    return null;
  }

  return data;
}

