import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client so resolveReferenceImageUrl is deterministic.
// vi.hoisted defines the spies before the (also hoisted) vi.mock factory runs.
// getPublicUrl mirrors the real SDK shape: { data: { publicUrl } }.
const { from, getPublicUrl } = vi.hoisted(() => {
  const getPublicUrl = vi.fn((p: string) => ({
    data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/reference-images/${p}` },
  }));
  const from = vi.fn(() => ({ getPublicUrl }));
  return { from, getPublicUrl };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from } },
  STORAGE_BUCKET: 'reference-images',
}));

import { resolveReferenceImageUrl } from '@/lib/storage';
import { isHeicFile, isValidImageType } from '@/lib/imageCompression';

const makeFile = (name: string, type: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('resolveReferenceImageUrl — normalized reference image handling', () => {
  beforeEach(() => {
    from.mockClear();
    getPublicUrl.mockClear();
  });

  it('returns null for null / undefined / empty', () => {
    expect(resolveReferenceImageUrl(null)).toBeNull();
    expect(resolveReferenceImageUrl(undefined)).toBeNull();
    expect(resolveReferenceImageUrl('')).toBeNull();
  });

  it('passes through an absolute http(s) URL unchanged (legacy rows)', () => {
    const url = 'https://old-project.supabase.co/storage/v1/object/public/reference-images/orders/x.jpg';
    expect(resolveReferenceImageUrl(url)).toBe(url);
    expect(from).not.toHaveBeenCalled();
  });

  it('passes through an absolute /path unchanged', () => {
    expect(resolveReferenceImageUrl('/local/preview.png')).toBe('/local/preview.png');
  });

  it('resolves a bucket-relative storage path via the current project URL', () => {
    const out = resolveReferenceImageUrl('orders/temp_123.jpg');
    expect(from).toHaveBeenCalledWith('reference-images');
    expect(getPublicUrl).toHaveBeenCalledWith('orders/temp_123.jpg');
    expect(out).toBe(
      'https://test.supabase.co/storage/v1/object/public/reference-images/orders/temp_123.jpg'
    );
  });
});

describe('isHeicFile — iPhone HEIC/HEIF detection', () => {
  it('detects HEIC/HEIF by MIME type', () => {
    expect(isHeicFile(makeFile('IMG_1.heic', 'image/heic'))).toBe(true);
    expect(isHeicFile(makeFile('IMG_2.heif', 'image/heif'))).toBe(true);
  });

  it('detects HEIC/HEIF by extension even when iOS reports an empty MIME', () => {
    expect(isHeicFile(makeFile('IMG_3.HEIC', ''))).toBe(true);
    expect(isHeicFile(makeFile('IMG_4.heif', ''))).toBe(true);
  });

  it('does not flag standard web image types', () => {
    expect(isHeicFile(makeFile('a.jpg', 'image/jpeg'))).toBe(false);
    expect(isHeicFile(makeFile('b.png', 'image/png'))).toBe(false);
    expect(isHeicFile(makeFile('c.webp', 'image/webp'))).toBe(false);
  });
});

describe('isValidImageType — accepted upload formats', () => {
  it('accepts JPG, PNG, WebP', () => {
    expect(isValidImageType(makeFile('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isValidImageType(makeFile('a.png', 'image/png'))).toBe(true);
    expect(isValidImageType(makeFile('a.webp', 'image/webp'))).toBe(true);
  });

  it('rejects HEIC and other unsupported types', () => {
    expect(isValidImageType(makeFile('a.heic', 'image/heic'))).toBe(false);
    expect(isValidImageType(makeFile('a.gif', 'image/gif'))).toBe(false);
  });
});
