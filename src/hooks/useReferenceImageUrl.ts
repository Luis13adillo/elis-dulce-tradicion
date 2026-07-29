import { useEffect, useState } from 'react';
import { getSignedReferenceImageUrl } from '@/lib/storage';

/**
 * Resolve a stored `reference_image_path` to something an <img src> can render.
 *
 * The `reference-images` bucket became PRIVATE on 2026-07-28 (migration
 * 20260728T211000) because an anonymous caller could list and download every
 * customer's uploaded photo. Displaying one now requires a short-lived signed
 * URL, which is asynchronous — hence a hook rather than the old synchronous
 * `resolveReferenceImageUrl`.
 *
 * Returns `null` while resolving and whenever the viewer is not permitted to
 * see the image (storage RLS grants read to owner/baker only). Every call site
 * already handles a null URL by rendering a placeholder, so non-staff viewers
 * degrade gracefully instead of showing a broken image.
 */
export function useReferenceImageUrl(value?: string | null): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (!value) {
            setUrl(null);
            return;
        }

        getSignedReferenceImageUrl(value)
            .then((resolved) => {
                if (!cancelled) setUrl(resolved);
            })
            .catch(() => {
                if (!cancelled) setUrl(null);
            });

        return () => {
            cancelled = true;
        };
    }, [value]);

    return url;
}
