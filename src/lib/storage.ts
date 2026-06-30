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

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = orderId
      ? `orders/${orderId}_${timestamp}.${fileExtension}`
      : `orders/temp_${timestamp}.${fileExtension}`;

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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
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
  if (value.startsWith('http') || value.startsWith('/')) return value;
  if (!supabase) return null;
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(value).data.publicUrl || null;
}

/**
 * Extracts the storage path from a full URL
 * @param url - Full Supabase Storage URL
 * @returns Storage path or null
 */
export function extractStoragePath(url: string): string | null {
  try {
    // Supabase Storage URLs typically look like:
    // https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
    const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

