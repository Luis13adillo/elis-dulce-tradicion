/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase, getUserProfile } from '@/lib/supabase';
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

  // Load user session on mount
  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // Get initial session (reads from localStorage, essentially instant)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        // Optimistically set some user info if possible to reduce shift
        if (session.user) {
          loadUserProfile(session.user);
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (authUser: User): Promise<UserProfile | null> => {
    if (!supabase) {
      setIsLoading(false);
      return null;
    }

    try {
      const profile = await getUserProfile(authUser.id);
      if (profile) {
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          profile,
        });
        return profile;
      } else {
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          profile: null,
        });
        return null;
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setUser({
        id: authUser.id,
        email: authUser.email || '',
        profile: null,
      });
      return null;
    } finally {
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

        // Use the returned profile to get the role directly
        const role = profile?.role;

        toast.success('Signed in successfully');
        return { success: true, role };
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
