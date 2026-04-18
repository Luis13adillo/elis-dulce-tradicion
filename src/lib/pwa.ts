/**
 * PWA utilities for service worker and push notifications
 */

// NOTE: We do NOT statically import 'virtual:pwa-register' here. That virtual
// module is only injected by VitePWA, which we run in production builds only
// (see vite.config.ts). A static import would crash the dev server with
// "Failed to resolve import 'virtual:pwa-register'". The module is loaded
// dynamically inside `initServiceWorker()` below, gated on `import.meta.env.PROD`.

import { clearStoredSupabaseSession } from '@/lib/supabase';

// Bump this whenever we change SW behavior in a way that requires every
// existing user to drop their old SW + caches on next load. Stored in
// localStorage so the cleanup runs at most once per device per version.
const SW_CLEANUP_VERSION_KEY = 'sw-cleanup-version';
// v6: force one-time cleanup for devices stuck on a hanging getUserProfile
// fetch caused by a stale refresh token. See src/contexts/AuthContext.tsx
// and .claude/plans/hidden-frolicking-manatee.md for context.
const SW_CLEANUP_VERSION = '6';

/**
 * One-shot: unregister any existing service worker, delete all Workbox
 * caches, and drop any stale Supabase auth sessions. Runs on app start,
 * gated by a localStorage version flag so it only fires once per device
 * per cleanup version.
 *
 * Why this is needed:
 * - Previous builds shipped a NetworkFirst rule for Supabase with
 *   `cacheableResponse: { statuses: [0, 200] }` and no networkTimeoutSeconds,
 *   which cached failed responses (status 0) for 24 hours. Once a user hit
 *   a transient network error, they were locked into a broken loading state.
 * - Unregistering a SW does NOT kill the currently-active SW controlling
 *   this tab — it only takes effect on the next navigation. So cleanup ran
 *   but the page was still being served by the old SW, and the user was
 *   still stuck. We now force a one-time reload IF we actually cleaned
 *   anything, guaranteeing the next load is free of the stale SW.
 * - If the Supabase anon key was rotated, a persisted JWT signed with the
 *   old secret silently stalls requests instead of erroring cleanly. We
 *   drop all `sb-*` localStorage keys so a stale session can't mask
 *   the new anon key.
 *
 * Reload-loop avoidance: we write the new cleanup version flag BEFORE the
 * reload, so on the next load the version matches and cleanup is a no-op.
 */
export async function unregisterStaleServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(SW_CLEANUP_VERSION_KEY) === SW_CLEANUP_VERSION) return;

    let cleanedSomething = false;

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length > 0) cleanedSomething = true;
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      if (keys.length > 0) cleanedSomething = true;
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }

    // Drop any persisted Supabase auth state. If the project's anon key was
    // rotated after this session was stored, the refresh token is invalid
    // against the new signing secret — requests silently stall instead of
    // erroring cleanly. User will need to sign in again once, which is cheap
    // compared to the hanging-loader failure mode.
    const hadSupabaseKeys = Object.keys(localStorage).some((k) => k.startsWith('sb-'));
    if (hadSupabaseKeys) cleanedSomething = true;
    clearStoredSupabaseSession();

    // MUST write the version flag BEFORE reloading, or we'd reload forever.
    localStorage.setItem(SW_CLEANUP_VERSION_KEY, SW_CLEANUP_VERSION);

    if (cleanedSomething) {
      // The current tab is still controlled by the old SW (unregister only
      // affects future navigations). Force one reload so the next load has
      // a clean fetch stack.
      window.location.reload();
    }
  } catch (err) {
    // Non-fatal — never block app startup on cleanup failure
    console.warn('SW cleanup failed:', err);
  }
}

/**
 * Initialize service worker with a user-consent update flow.
 *
 * VitePWA is configured with `registerType: 'prompt'` and without
 * skipWaiting/clientsClaim, so a new SW stays "waiting" until the user
 * accepts. When a new version is detected, we show a Sonner toast with a
 * Reload button; clicking it calls `updateSW(true)` which activates the
 * waiting worker and reloads the tab.
 *
 * This is the opposite of the previous behavior, which auto-reloaded the
 * tab the moment a new SW took control — that was causing the dashboard
 * to flash back to a Suspense loading state every time a new build shipped.
 *
 * In dev mode this is a no-op — VitePWA is not in the plugin list outside
 * production, so the `virtual:pwa-register` module does not exist.
 */
export async function initServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // Bind the spec to a variable so Vite's dep-scanner can't detect the
  // module name statically. The @vite-ignore comment alone was not enough —
  // Vite 5's scanner still tried to pre-bundle the virtual module in dev.
  // At runtime this only executes in production builds where VitePWA has
  // actually registered the virtual module.
  const spec = 'virtual:pwa-' + 'register';
  const mod = await import(/* @vite-ignore */ spec);

  // Dynamically import Sonner so this module stays safe to import from
  // non-React contexts (it's loaded inside the App.tsx effect which runs
  // post-hydration, but keep it async to avoid any circular deps).
  const { toast } = await import('sonner');

  const updateSW: (reloadPage?: boolean) => Promise<void> = mod.registerSW({
    immediate: false,
    onNeedRefresh() {
      toast('A new version is available', {
        description: 'Reload to get the latest updates.',
        duration: Infinity,
        action: {
          label: 'Reload',
          onClick: () => {
            void updateSW(true);
          },
        },
      });
    },
    onOfflineReady() {
      // App works offline — no user-facing notice needed for a bakery ops
      // dashboard, but leaving the hook for future use.
    },
  });
}

/**
 * Request push notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Show notification
 */
export function showNotification(title: string, options?: NotificationOptions) {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      ...options,
    });
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
      ),
    });

    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return null;
  }
}

/**
 * Convert VAPID key from URL base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if app is installed
 */
export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://');
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}
