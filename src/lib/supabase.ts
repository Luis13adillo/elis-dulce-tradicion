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
 * Get user profile from Supabase
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null;

  // Race with a 5s timeout to prevent the auth loading spinner from
  // hanging forever if Supabase is slow or temporarily unreachable.
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => { console.warn('getUserProfile timed out'); resolve(null); }, 5_000)
  );
  const queryPromise = supabase
    .from('user_profiles')
    .select('id, user_id, role, full_name, phone, preferred_language, created_at, updated_at')
    .eq('user_id', userId)
    .single()
    .then(({ data, error }) => {
      if (error) { console.error('Error fetching user profile:', error); return null; }
      return data as UserProfile;
    });

  return Promise.race([queryPromise, timeoutPromise]);
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

