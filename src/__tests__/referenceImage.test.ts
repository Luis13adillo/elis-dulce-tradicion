import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client so the storage helpers are deterministic.
// vi.hoisted defines the spies before the (also hoisted) vi.mock factory runs.
// createSignedUrl mirrors the real SDK shape: { data: { signedUrl }, error }.
const { from, createSignedUrl } = vi.hoisted(() => {
  const createSignedUrl = vi.fn((p: string) => Promise.resolve({
    data: { signedUrl: `https://test.supabase.co/storage/v1/object/sign/reference-images/${p}?token=abc` },
    error: null,
  }));
  const from = vi.fn(() => ({ createSignedUrl }));
  return { from, createSignedUrl };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from } },
  STORAGE_BUCKET: 'reference-images',
}));

import {
  resolveReferenceImageUrl,
  getSignedReferenceImageUrl,
  extractStoragePath,
} from '@/lib/storage';
import { isHeicFile, isValidImageType } from '@/lib/imageCompression';

const makeFile = (name: string, type: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

// The reference-images bucket became PRIVATE on 2026-07-28 (migration
// 20260728T211000) after the audit proved anonymous callers could list and
// download every customer photo. resolveReferenceImageUrl must therefore no
// longer hand back a public URL for a bucket path — callers must sign.
describe('resolveReferenceImageUrl — private-bucket behaviour', () => {
  beforeEach(() => {
    from.mockClear();
    createSignedUrl.mockClear();
  });

  it('returns null for null / undefined / empty', () => {
    expect(resolveReferenceImageUrl(null)).toBeNull();
    expect(resolveReferenceImageUrl(undefined)).toBeNull();
    expect(resolveReferenceImageUrl('')).toBeNull();
  });

  it('returns null for a bucket-relative path — a signed URL is required', () => {
    expect(resolveReferenceImageUrl('orders/temp_123.jpg')).toBeNull();
  });

  it('returns null for a legacy public storage URL — that route no longer resolves', () => {
    const url = 'https://old-project.supabase.co/storage/v1/object/public/reference-images/orders/x.jpg';
    expect(resolveReferenceImageUrl(url)).toBeNull();
  });

  it('passes through an absolute /path unchanged (local preview)', () => {
    expect(resolveReferenceImageUrl('/local/preview.png')).toBe('/local/preview.png');
  });

  it('passes through a non-storage absolute URL unchanged', () => {
    const url = 'https://example.com/photo.jpg';
    expect(resolveReferenceImageUrl(url)).toBe(url);
  });
});

describe('getSignedReferenceImageUrl — signing', () => {
  beforeEach(() => {
    from.mockClear();
    createSignedUrl.mockClear();
  });

  it('signs a bucket-relative path', async () => {
    const out = await getSignedReferenceImageUrl('orders/temp_123.jpg');
    expect(from).toHaveBeenCalledWith('reference-images');
    expect(createSignedUrl).toHaveBeenCalledWith('orders/temp_123.jpg', 3600);
    expect(out).toContain('/object/sign/reference-images/orders/temp_123.jpg');
  });

  it('re-signs a legacy absolute public URL by extracting its object path', async () => {
    const legacy =
      'https://old-project.supabase.co/storage/v1/object/public/reference-images/orders/x.jpg';
    const out = await getSignedReferenceImageUrl(legacy);
    expect(createSignedUrl).toHaveBeenCalledWith('orders/x.jpg', 3600);
    expect(out).toContain('token=');
  });

  it('returns null when signing is denied (non-staff viewer)', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    expect(await getSignedReferenceImageUrl('orders/secret.jpg')).toBeNull();
  });

  it('returns null for empty input and does not call storage', async () => {
    expect(await getSignedReferenceImageUrl(null)).toBeNull();
    expect(await getSignedReferenceImageUrl('')).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('extractStoragePath — recognises all three storage URL shapes', () => {
  it('extracts from a public URL', () => {
    expect(
      extractStoragePath('https://p.supabase.co/storage/v1/object/public/reference-images/orders/a.jpg')
    ).toBe('orders/a.jpg');
  });

  it('extracts from a signed URL and drops the token query', () => {
    expect(
      extractStoragePath('https://p.supabase.co/storage/v1/object/sign/reference-images/orders/b.jpg?token=xyz')
    ).toBe('orders/b.jpg');
  });

  it('extracts from an authenticated URL', () => {
    expect(
      extractStoragePath('https://p.supabase.co/storage/v1/object/authenticated/reference-images/orders/c.jpg')
    ).toBe('orders/c.jpg');
  });

  it('returns null for a non-storage URL', () => {
    expect(extractStoragePath('https://example.com/photo.jpg')).toBeNull();
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
