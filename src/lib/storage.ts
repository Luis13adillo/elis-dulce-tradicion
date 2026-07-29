import { supabase, STORAGE_BUCKET } from './supabase';
import { validateAndCompressImage } from './imageCompression';

export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Uploads a reference image to Supabase Storage
 * @param file - The image file to upload
 * @param orderId - Optional order ID for filename generation
 * @returns Upload result with public URL
 */
export async function uploadReferenceImage(
  file: File,
  orderId?: string | number
): Promise<UploadResult> {
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase is not configured. Please check your environment variables.',
    };
  }

  try {
    // Validate and compress image
    const validation = await validateAndCompressImage(file);
    if (!validation.isValid || !validation.compressedFile) {
      return {
        success: false,
        error: validation.error || 'Image validation failed',
      };
    }

    const compressedFile = validation.compressedFile;

    // Generate unique filename. The random suffix matters: parallel uploads
    // (order-issue photos) share the same Date.now() millisecond, and
    // upsert:false turns a name collision into a hard failure.
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    // Sanitize the extension — it comes from the user's filename and must
    // stay within the server-side path whitelist ([A-Za-z0-9._-]).
    const fileExtension =
      (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const filename = orderId
      ? `orders/${orderId}_${timestamp}_${rand}.${fileExtension}`
      : `orders/temp_${timestamp}_${rand}.${fileExtension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, compressedFile, {
        cacheControl: '3600',
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      console.error('Supabase upload error:', error);
      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to upload image';
      if (error.message?.includes('Bucket not found') || error.message?.includes('not found')) {
        errorMessage = `Storage bucket "${STORAGE_BUCKET}" not found. Please create it in Supabase Dashboard > Storage.`;
      } else if (error.message?.includes('not allowed') || error.message?.includes('policy')) {
        errorMessage = 'Storage permissions not configured. Please enable public access for the bucket.';
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    // The bucket is PRIVATE (migration 20260728T211000). There is no public
    // URL to hand back — callers store `path` and display it later through
    // getSignedReferenceImageUrl / useReferenceImageUrl.
    return {
      success: true,
      path: data.path,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Deletes a reference image from Supabase Storage
 * @param imagePath - The storage path of the image to delete
 * @returns Success status
 */
export async function deleteReferenceImage(imagePath: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase is not configured',
    };
  }

  try {
    // Extract filename from path (remove bucket prefix if present)
    const path = imagePath.startsWith(`${STORAGE_BUCKET}/`)
      ? imagePath.replace(`${STORAGE_BUCKET}/`, '')
      : imagePath;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete image',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Resolve a stored `reference_image_path` to a displayable URL.
 *
 * This is the SINGLE source of truth for turning whatever is stored on the
 * order into something an <img src> can render. The stored value may be:
 *   - a bucket-relative storage path (e.g. "orders/temp_123.jpg") — the
 *     canonical format new uploads use; resolved against the CURRENT
 *     VITE_SUPABASE_URL so it never hardcodes a project ref,
 *   - a legacy absolute public URL (starts with "http"), returned as-is,
 *   - an absolute path (starts with "/"), returned as-is.
 *
 * Returns null for empty/missing values. Every consumer (kitchen cards, print
 * modal, reference viewer) MUST use this instead of building URLs by hand —
 * the old hand-built URLs baked in a stale project ref and broke after the
 * prod Supabase cutover.
 */
export function resolveReferenceImageUrl(value?: string | null): string | null {
  if (!value) return null;
  // Local object URLs / app-relative previews are already displayable.
  if (value.startsWith('/')) return value;
  // Absolute URLs that are NOT our storage host (rare, historical) pass through.
  if (value.startsWith('http') && extractStoragePath(value) === null) return value;
  // Anything stored in our bucket now requires a signed URL — the bucket was
  // made private on 2026-07-28 because anonymous callers could list and
  // download every customer's reference photo. Use getSignedReferenceImageUrl
  // (or the useReferenceImageUrl hook) instead.
  return null;
}

/**
 * Mint a short-lived signed URL for a reference image.
 *
 * The `reference-images` bucket is private (migration 20260728T211000), so
 * this is the ONLY way to render a stored photo. Signing requires SELECT on
 * storage.objects, which the RLS policy grants to staff (owner/baker) — so
 * this resolves for Front Desk / Owner Dashboard users and returns null for
 * everyone else, which callers render as "no image".
 *
 * Accepts the same shapes `reference_image_path` has historically held:
 *   - a bucket-relative path ("orders/temp_123.jpg") — the canonical format
 *   - a legacy absolute public URL — the path is extracted and re-signed,
 *     because the old /object/public/ route no longer resolves
 *   - an app-relative path ("/preview.png") — returned as-is
 */
export async function getSignedReferenceImageUrl(
  value?: string | null,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith('/')) return value;

  let path = value;
  if (value.startsWith('http')) {
    const extracted = extractStoragePath(value);
    // Absolute URL pointing somewhere other than our bucket: pass through.
    if (extracted === null) return value;
    path = extracted;
  }

  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      // Most common cause: the viewer is not staff, so the storage RLS policy
      // denies SELECT. Not an error worth shouting about.
      return null;
    }
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Extracts the storage path from a full URL
 * @param url - Full Supabase Storage URL
 * @returns Storage path or null
 */
export function extractStoragePath(url: string): string | null {
  try {
    // Supabase Storage URLs come in three shapes:
    //   .../storage/v1/object/public/{bucket}/{path}         (legacy public)
    //   .../storage/v1/object/sign/{bucket}/{path}?token=... (signed)
    //   .../storage/v1/object/authenticated/{bucket}/{path}
    const match = url.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+)$/,
    );
    if (!match) return null;
    // Drop any query string (signed URLs carry ?token=...)
    return match[1].split('?')[0];
  } catch {
    return null;
  }
}

