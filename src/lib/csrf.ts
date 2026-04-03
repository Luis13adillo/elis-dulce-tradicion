/**
 * CSRF token store for defense-in-depth protection.
 *
 * The Express backend uses csrf-csrf (double-submit cookie pattern).
 * This module fetches the token once on app load and stores it in memory.
 * All state-changing requests to the Express backend must include this token
 * as the X-CSRF-Token header.
 *
 * Note: CSRF is not strictly required here because auth uses Bearer JWT
 * (not cookies). This is defense-in-depth as specified in phase 9 context.
 */

let csrfToken: string | null = null;
let fetchPromise: Promise<string> | null = null;

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getCsrfToken(): Promise<string> {
  // Return cached token if available
  if (csrfToken) return csrfToken;

  // Deduplicate concurrent calls — only one fetch in flight at a time
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch(`${API_BASE_URL}/api/v1/csrf-token`, {
    credentials: 'include', // Required for the csrf-csrf cookie
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`CSRF token fetch failed: ${res.status}`);
      const data = await res.json();
      csrfToken = data.token as string;
      fetchPromise = null;
      return csrfToken;
    })
    .catch((err) => {
      fetchPromise = null;
      // In development with no backend running, degrade gracefully
      console.warn('CSRF token fetch failed, using empty token:', err.message);
      return '';
    });

  return fetchPromise;
}

/**
 * Clear the cached token so the next call fetches a fresh one.
 * Call this after a CSRF validation failure before retrying.
 */
export function clearCsrfToken(): void {
  csrfToken = null;
  fetchPromise = null;
}
