/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase, getUserProfile, clearStoredSupabaseSession } from '@/lib/supabase';
import { AuthUser, UserRole, UserProfile } from '@/types/auth';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Mirrors isLoading so the watchdog below can read the *current* value
  // inside its setTimeout callback (which would otherwise see the stale
  // closure value from mount time).
  const isLoadingRef = useRef(true);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Load user session on mount
  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // Guard against setState after unmount (e.g. fast nav during auth resolve).
    // Also short-circuits onAuthStateChange if getSession already handled this render.
    let cancelled = false;
    const mountedAt = performance.now();

    // 20s hard watchdog: if isLoading is still true at T+20s from mount,
    // the @supabase/supabase-js client is almost certainly stuck on its
    // `navigator.locks`-serialized internal auth lock (see
    // src/lib/supabase.ts lines 52-66 — pre-existing bug, surfaces in
    // React 18 StrictMode dev double-invoke). Clearing localStorage
    // alone does NOT release the JS-runtime lock, so subsequent
    // signInWithPassword also hangs. The only reliable escape is a
    // full page reload, which resets the singleton client. Guarded by
    // sessionStorage against a reload loop: if we've already reloaded
    // once this session and the hang reproduced, give up and flip
    // isLoading=false so the user reaches the login form instead of
    // spinning forever.
    const WATCHDOG_RELOAD_FLAG = 'auth-watchdog-reloaded';
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      if (!isLoadingRef.current) return;

      const alreadyReloaded = sessionStorage.getItem(WATCHDOG_RELOAD_FLAG);
      if (alreadyReloaded) {
        console.warn(
          '[boot] auth watchdog fired AGAIN after reload — giving up, showing login form'
        );
        sessionStorage.removeItem(WATCHDOG_RELOAD_FLAG);
        try {
          clearStoredSupabaseSession();
        } catch {
          // best-effort
        }
        setUser(null);
        setSession(null);
        setIsLoading(false);
        return;
      }

      console.warn(
        '[boot] auth watchdog fired — reloading to reset hung supabase client'
      );
      try {
        sessionStorage.setItem(WATCHDOG_RELOAD_FLAG, '1');
        clearStoredSupabaseSession();
      } catch {
        // best-effort
      }
      window.location.reload();
    }, 20_000);

    // Session-restore paths (initial getSession + onAuthStateChange SIGNED_IN)
    // funnel through this wrapper so a null-profile result never leaves the
    // user state half-initialized. Without this, a hanging user_profiles
    // query would land on user={profile:null} → ProtectedRoute stays on
    // FullScreenLoader forever, which is exactly the white-screen bug we
    // are fixing. See .claude/plans/hidden-frolicking-manatee.md.
    let brokenSessionToastShown = false;
    const loadProfileOrRecover = async (authUser: User) => {
      const profile = await loadUserProfile(authUser, () => cancelled);
      if (cancelled) return;
      if (profile) return;

      // Profile fetch failed: timeout, error, or row missing. Sign out and
      // clear persisted auth so the user can sign in fresh instead of being
      // trapped on a permanent loader.
      console.warn('[auth] session restore got null profile — clearing session');
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — we're about to clear local state anyway
      }
      clearStoredSupabaseSession();
      if (cancelled) return;
      setUser(null);
      setSession(null);
      setIsLoading(false);
      if (!brokenSessionToastShown) {
        brokenSessionToastShown = true;
        toast.error("We couldn't load your profile. Please sign in again.");
      }
    };

    // Get initial session (reads from localStorage, essentially instant)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const elapsedMs = Math.round(performance.now() - mountedAt);
      console.info('[boot] session-restore done', {
        hasSession: !!session,
        elapsedMs,
      });
      // The boot made it past the hung-lock window — clear the watchdog
      // reload flag so future hangs trigger a fresh reload attempt instead
      // of being suppressed by a leftover flag from a previous session.
      try {
        sessionStorage.removeItem('auth-watchdog-reloaded');
      } catch {
        // best-effort
      }
      if (session) {
        setSession(session);
        if (session.user) {
          loadProfileOrRecover(session.user);
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes. Only re-fetch the profile on actual sign-in /
    // sign-out events. TOKEN_REFRESHED and USER_UPDATED fire frequently and
    // do NOT change the user_profiles row, so re-running the 5s-bounded
    // getUserProfile fetch on every refresh is wasted work that piles up
    // in-flight requests when Supabase is slow.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      setSession(session);

      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Only reload profile on a fresh sign-in. Refresh / update events keep
      // the existing profile in state.
      if (event === 'SIGNED_IN') {
        await loadProfileOrRecover(session.user);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (
    authUser: User,
    isCancelled?: () => boolean
  ): Promise<UserProfile | null> => {
    if (!supabase) {
      if (!isCancelled?.()) setIsLoading(false);
      return null;
    }

    try {
      const profile = await getUserProfile(authUser.id);
      if (isCancelled?.()) return profile ?? null;
      if (profile) {
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          profile,
        });
        return profile;
      }
      // Null result (timeout, error, or missing row): deliberately do NOT
      // set a `user` object with `profile: null` here. That previously
      // trapped ProtectedRoute on a permanent FullScreenLoader. The caller
      // (loadProfileOrRecover in session-restore, or signIn) is responsible
      // for recovering — typically by signing out and sending the user to
      // /login so they can sign in fresh.
      return null;
    } catch (error) {
      console.error('[auth] Error loading user profile:', error);
      return null;
    } finally {
      // Always release the loading flag. Guarding this on `!isCancelled()`
      // could leave isLoading stuck at `true` if the cancelled flag flips
      // between the awaited fetch and this finally block. If the provider
      // has truly unmounted, the React tree is gone anyway and this setState
      // is a harmless no-op.
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      return { success: false, error: 'Supabase is not configured' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Load profile and capture the result
        // We need to return the role here so Login.tsx can redirect immediately
        // without waiting for the context state update
        const profile = await loadUserProfile(data.user);

        if (!profile) {
          // Profile fetch failed (timeout / error / missing row). Don't leave
          // the user in a half-signed-in state — sign them back out and
          // surface the error so Login.tsx shows an inline message rather
          // than navigating to a dashboard that would just hang on a loader.
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore
          }
          clearStoredSupabaseSession();
          setUser(null);
          setSession(null);
          return {
            success: false,
            error: "We couldn't load your profile. Please try again.",
          };
        }

        toast.success('Signed in successfully');
        return { success: true, role: profile.role };
      }

      return { success: false, error: 'Sign in failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return { success: false, error: message };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => {
    if (!supabase) {
      return { success: false, error: 'Supabase is not configured' };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone || null,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Profile will be created automatically by the trigger
        // But we can update it with phone if provided
        if (phone && data.user.id) {
          await supabase
            .from('user_profiles')
            .update({ phone, full_name: fullName })
            .eq('id', data.user.id)
            .select('id, role, full_name, phone'); // Only select needed columns
        }

        toast.success('Account created successfully! Please check your email to verify your account.');
        return { success: true };
      }

      return { success: false, error: 'Sign up failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      return { success: false, error: message };
    }
  };

  const signOut = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      }
    }

    setUser(null);
    setSession(null);
    toast.info('Signed out successfully');
  };

  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!user?.profile) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.profile.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        signIn,
        signUp,
        signOut,
        isAuthenticated: !!user,
        isLoading,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
