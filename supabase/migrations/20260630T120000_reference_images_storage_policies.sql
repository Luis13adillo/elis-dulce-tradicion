-- Reference-images bucket: storage RLS policies + bucket guards
--
-- ROOT CAUSE (found 2026-06-30): the production project (bebmkekmzcrgeraeakmp)
-- has RLS ENABLED on storage.objects but ZERO policies, so every upload by
-- anon (guest customers) AND authenticated users is denied at the row level.
-- The order wizard then silently saved an empty reference_image_path, so NO
-- order placed since the prod Supabase cutover (~2026-04-28) has a reference
-- photo. The original backend/db/supabase-storage-setup.sql was only ever run
-- against the OLD project (rnszrscxwkdwvvlsihqc) and never on prod.
--
-- Most cake customers check out as GUESTS, so the public flow must allow anon
-- INSERT — scoped tightly to the reference-images bucket and the `orders/`
-- path prefix the uploader uses (src/lib/storage.ts). Reads are public (the
-- bucket is public). Deletes/updates are limited to authenticated users
-- (dashboard cleanup runs logged-in; the order-cancel Edge Function uses the
-- service role, which bypasses RLS anyway).

begin;

-- Bucket guards (defense-in-depth: cap size + restrict types server-side so a
-- bad client can't store a 50 MB file or a HEIC the browser can't render).
update storage.buckets
set public = true,
    file_size_limit = 5242880,                                  -- 5 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'reference-images';

-- Clean slate so re-applying this migration is safe (idempotent).
drop policy if exists "reference_images_public_read"  on storage.objects;
drop policy if exists "reference_images_anon_insert"  on storage.objects;
drop policy if exists "reference_images_auth_delete"  on storage.objects;
drop policy if exists "reference_images_auth_update"  on storage.objects;

-- Public read — anyone can render the reference photo.
create policy "reference_images_public_read"
on storage.objects for select
to anon, authenticated
using ( bucket_id = 'reference-images' );

-- Guest + logged-in upload, scoped to the orders/ prefix the uploader uses.
create policy "reference_images_anon_insert"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'reference-images'
  and (storage.foldername(name))[1] = 'orders'
);

-- Only logged-in users (staff on the dashboard) may delete/update — used by
-- the cancel-order image cleanup path.
create policy "reference_images_auth_delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'reference-images' );

create policy "reference_images_auth_update"
on storage.objects for update
to authenticated
using ( bucket_id = 'reference-images' )
with check ( bucket_id = 'reference-images' );

commit;
