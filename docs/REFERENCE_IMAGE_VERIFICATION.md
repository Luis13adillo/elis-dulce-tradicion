# Reference Image Upload / Display — Verification Checklist

Covers the full flow: customer upload → wizard preview → Supabase Storage →
`pending_orders` → Stripe payment → `orders` → bakery dashboard / kitchen /
print. Run this after any change to the reference-image path, and once after the
production storage-policy migration is applied.

## Automated tests
- `src/__tests__/referenceImage.test.ts` — `resolveReferenceImageUrl`
  (URL passthrough, path resolution, null) + `isHeicFile` + `isValidImageType`.
- Run: `npm run test` (or `npx vitest run src/__tests__/referenceImage.test.ts`).

## Pre-req: storage policy must be live
The migration `supabase/migrations/20260630T120000_reference_images_storage_policies.sql`
MUST be applied to the production project (`bebmkekmzcrgeraeakmp`). Without it,
every upload is denied by RLS and `reference_image_path` saves empty.

Quick prod check (read-only):
```sql
select count(*) from pg_policy where polrelid='storage.objects'::regclass;  -- expect >= 4
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='reference-images';
```

## Manual matrix (run on the `/order` wizard, Details step)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | **JPG** | Upload a `.jpg` | Spinner → green "Uploaded successfully"; full image shown letterboxed (object-contain), not cropped |
| 2 | **PNG** | Upload a `.png` | Same as #1 |
| 3 | **WebP** | Upload a `.webp` | Same as #1 |
| 4 | **iPhone HEIC** | Pick a `.heic` from an iPhone (or rename a file to `.heic`) | Clear toast: "iPhone HEIC photos aren't supported… Most Compatible". No spinner, no broken upload |
| 5 | **Oversize** | Upload a >5 MB image | Toast "File too large. Max 5MB." |
| 6 | **Slow upload** | Throttle network (DevTools → Slow 3G), upload, immediately tap **Next** | Next is blocked with "Wait for the photo to finish uploading"; advances only after success badge |
| 7 | **Upload failure** | Block the storage request (DevTools → block `*/storage/*`), upload | Red "Upload failed — Tap to retry" overlay; preview stays; **Next** blocked with "The photo did not upload…"; tapping the overlay re-opens the picker |
| 8 | **Submit-before-upload** | Select image, rush through to Checkout while still uploading | Submit blocked with the same guard; no order created with empty image |
| 9 | **Remove** | Upload, then press the ✕ | Preview clears; Next proceeds (image is optional) |
| 10 | **Payment success survives image** | Complete a real (test-mode) order with an image | `pending_orders.reference_image_path` set to `orders/temp_*.jpg`; after webhook promote, `orders.reference_image_path` has the same value |
| 11 | **Dashboard / kitchen display** | Open Front Desk + Owner dashboard for that order | Thumbnail renders; opening the order shows the FULL image (object-contain) in the print/detail modal and the kitchen ticket card |
| 12 | **Reference viewer** | Click "View Reference" | Lightbox opens full image with zoom/rotate/download |

## What "correct storage" looks like
- New orders store a **bucket-relative path** (e.g. `orders/temp_1719000000000.jpg`),
  NOT a full URL. Every consumer resolves it through
  `resolveReferenceImageUrl()` in `src/lib/storage.ts`.
- Legacy rows that stored a full `http…` URL still render (passed through
  unchanged). Three legacy rows point at the retired project
  `rnszrscxwkdwvvlsihqc` and will 404 — historical only, not worth backfilling.

## Known follow-ups (not in this change)
- Orphaned `orders/temp_*` objects from abandoned wizards are not garbage-collected
  (the `prune_expired_pending_orders` cron prunes DB rows, not storage). Low volume.
- The customer confirmation email does not embed the reference photo (it's the
  customer's own image); the bakery sees it on the dashboard/kitchen/print.
