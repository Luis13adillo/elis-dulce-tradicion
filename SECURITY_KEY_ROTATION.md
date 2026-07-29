# Required key rotation — service-role key exposed in git

**Status: OPEN. Rotation has NOT been performed. It requires a human with
Supabase dashboard access.**

Raised by the production security audit on 2026-07-28.

## What happened

Four tracked files in `scripts/` contained a hardcoded Supabase
**service-role key** as a string literal, and had done since commit
`363683d`. A service-role key bypasses Row Level Security completely — it can
read, modify and delete every row in every table.

| File | Credential that was committed |
|---|---|
| `scripts/create_paid_orders_node.ts` | service-role key |
| `scripts/debug_visibility.ts` | service-role key |
| `scripts/seed_dashboard_tests.ts` | service-role key |
| `scripts/seed_test_1.ts` | service-role key |
| `scripts/check_db_columns.ts` | anon key (public by design — no action needed) |
| `scripts/create_paid_orders_deno.ts` | anon key (public by design — no action needed) |

All six files now read their credentials from environment variables instead.
**That fixes the source tree, not the key.**

## Which project is affected

The exposed key belongs to the **OLD** Supabase project
`rnszrscxwkdwvvlsihqc` — the testing project. It is **not** the production
project (`bebmkekmzcrgeraeakmp`), and no production credential was found in
the repository.

That lowers the severity but does not remove it:

- `rnszrscxwkdwvvlsihqc` was the **production** database before the
  2026-04-28 cutover, so it may still hold real historical customer orders,
  names, emails, phone numbers and delivery addresses.
- The key remains valid until it is explicitly rotated. Removing the literal
  from the working tree does **not** invalidate it.
- The key is still present in git history, so anyone with a clone of this
  repository — at any commit — still has it.

## What must be done (human action required)

1. **Rotate the service-role key** on project `rnszrscxwkdwvvlsihqc`:
   Supabase Dashboard → Project Settings → API → *Service role* → Reset /
   generate a new key. This immediately invalidates the exposed key.
2. **Confirm the blast radius before rotating** — check whether anything
   still depends on that key (old scripts, a stale `.env`, a CI secret). The
   scripts in this repo no longer hardcode it, so they will simply need the
   env var set.
3. **Decide what to do about that project.** If it genuinely holds only test
   data and is no longer used, deleting it is cleaner than rotating a key for
   a database nobody needs. If it still holds pre-cutover customer records,
   treat it as production data: rotate, then review its access logs.
4. **Assume history is public.** Rewriting git history (`git filter-repo`)
   would remove the literal from past commits, but the repository has already
   been cloned and migrated between accounts, so rewriting is a tidy-up, not
   a containment measure. Rotation is the containment measure. Do step 1
   regardless of whether you rewrite history.

## Verifying the source tree stays clean

```bash
# Should print nothing.
git grep -nE '"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.'
```

Note that a Supabase **anon** key matches the same pattern and is safe to
publish — it is designed to ship in the browser bundle. What matters is the
`role` claim inside the token: `anon` is fine, `service_role` is not.

## Related

The same audit found and fixed several other issues in this batch; see the
migrations `20260728T210000_lockdown_privileged_function_grants.sql` and
`20260728T211000_private_reference_images.sql`.
