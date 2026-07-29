-- =====================================================================
-- SECURITY LOCKDOWN: make customer reference photos private
-- =====================================================================
-- Audit 2026-07-28 proved, against live production, that an anonymous
-- caller could LIST and download every customer reference photo in the
-- `reference-images` bucket. Live evidence: an anonymous POST to
-- /storage/v1/object/list/reference-images returned real object names.
-- These are customer-supplied photos, frequently of family events and
-- children's parties.
--
-- Two separate problems in 20260630T120000_reference_images_storage_policies:
--   1. `reference_images_public_read` granted SELECT on storage.objects to
--      `anon` bucket-wide. SELECT on storage.objects is what authorizes the
--      LIST endpoint, so this exposed the whole namespace, not just objects
--      whose (timestamp-based, guessable) names you already knew.
--   2. `reference_images_auth_delete` / `_auth_update` were scoped to
--      bucket membership only, with no ownership predicate — so ANY signed-in
--      customer could delete or overwrite every other customer's photo,
--      including for orders already in the oven.
--
-- AFTER THIS MIGRATION
--   - bucket is private; there is no public object URL at all.
--   - anonymous customers can still UPLOAD during checkout (unchanged) —
--     this is required for the ordering flow and is already constrained to
--     the `orders/` prefix, a 5 MB cap and a MIME allowlist.
--   - reads/deletes/overwrites require staff (owner/baker).
--   - staff surfaces display photos via short-lived signed URLs.
--   - service_role (Edge Functions, e.g. review-order-image sending the
--     photo to the AI reviewer) bypasses RLS and is unaffected.
--
-- SAFETY: policy + bucket-flag changes only. No objects are moved or
-- deleted. Rollback at the bottom of this file.
--
-- DEPENDS ON: 20260728T210000_lockdown_privileged_function_grants.sql
--             (defines public.is_staff_or_service()).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Flip the bucket to private
-- ---------------------------------------------------------------------
-- Kills the unauthenticated /storage/v1/object/public/... route entirely.
-- File size limit and MIME allowlist from 20260630T120000 are preserved.
UPDATE storage.buckets
   SET public = false
 WHERE id = 'reference-images';

-- ---------------------------------------------------------------------
-- 2. Replace the over-broad policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "reference_images_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "reference_images_auth_delete"  ON storage.objects;
DROP POLICY IF EXISTS "reference_images_auth_update"  ON storage.objects;

-- Read: staff only. Signed URLs are minted through this policy, so the
-- Front Desk and Owner Dashboard keep full access to every photo.
CREATE POLICY "reference_images_staff_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'reference-images'
    AND public.is_staff_or_service()
);

-- Delete: staff only (was: any authenticated user, bucket-wide).
CREATE POLICY "reference_images_staff_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'reference-images'
    AND public.is_staff_or_service()
);

-- Update/overwrite: staff only (was: any authenticated user, bucket-wide).
CREATE POLICY "reference_images_staff_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'reference-images'
    AND public.is_staff_or_service()
)
WITH CHECK (
    bucket_id = 'reference-images'
    AND public.is_staff_or_service()
);

-- ---------------------------------------------------------------------
-- 3. Upload policy is deliberately UNCHANGED
-- ---------------------------------------------------------------------
-- `reference_images_anon_insert` (anon + authenticated, INSERT, restricted
-- to the `orders/` prefix) stays exactly as it was. Customers check out as
-- guests, so anonymous upload is load-bearing for the ordering flow.
-- Re-asserted here only if a previous run dropped it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'storage'
           AND tablename  = 'objects'
           AND policyname = 'reference_images_anon_insert'
    ) THEN
        CREATE POLICY "reference_images_anon_insert"
        ON storage.objects FOR INSERT
        TO anon, authenticated
        WITH CHECK (
            bucket_id = 'reference-images'
            AND (storage.foldername(name))[1] = 'orders'
        );
    END IF;
END $$;

COMMIT;

-- =====================================================================
-- ROLLBACK (restores the previous, PUBLIC state)
-- =====================================================================
-- BEGIN;
--   UPDATE storage.buckets SET public = true WHERE id = 'reference-images';
--   DROP POLICY IF EXISTS "reference_images_staff_read"   ON storage.objects;
--   DROP POLICY IF EXISTS "reference_images_staff_delete" ON storage.objects;
--   DROP POLICY IF EXISTS "reference_images_staff_update" ON storage.objects;
--   CREATE POLICY "reference_images_public_read" ON storage.objects FOR SELECT
--     TO anon, authenticated USING (bucket_id = 'reference-images');
--   CREATE POLICY "reference_images_auth_delete" ON storage.objects FOR DELETE
--     TO authenticated USING (bucket_id = 'reference-images');
--   CREATE POLICY "reference_images_auth_update" ON storage.objects FOR UPDATE
--     TO authenticated USING (bucket_id = 'reference-images')
--     WITH CHECK (bucket_id = 'reference-images');
-- COMMIT;
-- =====================================================================
