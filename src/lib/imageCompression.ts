import imageCompression from 'browser-image-compression';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
}

/**
 * Detects iPhone HEIC / HEIF photos.
 *
 * iOS sometimes auto-transcodes these to JPEG when picked via <input type=file>,
 * but not always (depends on iOS version, source app, and "Most Compatible" vs
 * "High Efficiency" camera setting). When it doesn't, the browser can't decode
 * the file, compression fails, and the upload silently breaks. We detect HEIC by
 * MIME type AND by extension (iOS frequently reports an empty MIME for HEIC) so
 * we can show a clear, actionable message instead of a generic failure.
 */
export function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/**
 * Validates if the file is a valid image type
 */
export function isValidImageType(file: File): boolean {
  return ALLOWED_TYPES.includes(file.type.toLowerCase());
}

/**
 * Validates if the file size is within limits
 */
export function isValidFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE;
}

/**
 * Compresses an image file client-side before upload
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Compressed file
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const defaultOptions: CompressionOptions = {
    maxSizeMB: 1, // Target 1MB after compression
    maxWidthOrHeight: 1920, // Max dimension
    useWebWorker: true,
    ...options,
  };

  try {
    const compressedFile = await imageCompression(file, defaultOptions);
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    // Return original file if compression fails
    return file;
  }
}

/**
 * Validates and compresses an image file
 * @param file - The image file to validate and compress
 * @returns Object with validation result and compressed file
 */
export async function validateAndCompressImage(file: File): Promise<{
  isValid: boolean;
  error?: string;
  compressedFile?: File;
}> {
  // Validate file type
  if (!isValidImageType(file)) {
    return {
      isValid: false,
      error: 'Invalid file type. Please upload a JPG, PNG, or WebP image.',
    };
  }

  // Validate file size
  if (!isValidFileSize(file)) {
    return {
      isValid: false,
      error: 'File size exceeds 5MB. Please choose a smaller image.',
    };
  }

  // Compress image
  try {
    const compressedFile = await compressImage(file);
    return {
      isValid: true,
      compressedFile,
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Failed to process image. Please try again.',
    };
  }
}

