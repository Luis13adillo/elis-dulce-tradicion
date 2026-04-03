---
phase: 10-post-launch-polish
plan: "05"
subsystem: ui
tags: [seo, json-ld, schema-org, react-helmet-async, sitemap, structured-data]

# Dependency graph
requires:
  - phase: 09-security-hardening-and-code-quality
    provides: Order.tsx refactor and clean build baseline
provides:
  - LocalBusiness/Bakery JSON-LD schema on homepage (Google rich results)
  - FoodEstablishment hasMenu JSON-LD on Menu page (product rich cards)
  - Updated sitemap.xml with all 11 public pages and 2026-04-03 lastmod dates
  - react-helmet-async HelmetProvider wrapping entire app
affects: []

# Tech tracking
tech-stack:
  added: [react-helmet-async@2.x]
  patterns:
    - "JSON-LD structured data injected via Helmet component in page-level components"
    - "Schema objects defined as module-level const above component (not inline)"
    - "HelmetProvider as outermost wrapper in App.tsx above all other providers"

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/pages/Index.tsx
    - src/pages/Menu.tsx
    - public/sitemap.xml

key-decisions:
  - "Schema const defined at module level (not inside component) — avoids object recreation on every render"
  - "FoodEstablishment with hasMenu chosen over BakeryProduct for Menu page — better represents restaurant-style menu structure per schema.org guidelines"
  - "Static menu schema with 3 price tiers — DB-driven schema would require SSR or deferred hydration; static is sufficient for SEO"
  - "sitemap.xml uses /track (not /order-tracking) for order status URL per plan spec"
  - "Legal pages included in sitemap with priority 0.2 and changefreq yearly"

patterns-established:
  - "Helmet usage: import Helmet from react-helmet-async in page component; place <Helmet> as first child in return JSX"
  - "JSON-LD: define schema as typed const above component; pass via JSON.stringify inside script tag"

requirements-completed: [SEO-01]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 10 Plan 05: SEO Structured Data Summary

**react-helmet-async installed with LocalBusiness/Bakery JSON-LD on homepage and FoodEstablishment hasMenu JSON-LD on Menu page, enabling Google rich results for local search and product discovery**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T14:42:49Z
- **Completed:** 2026-04-03T14:46:28Z
- **Tasks:** 2
- **Files modified:** 5 (package.json, App.tsx, Index.tsx, Menu.tsx, sitemap.xml)

## Accomplishments
- Installed react-helmet-async and wrapped entire app in HelmetProvider (App.tsx)
- Added LocalBusiness/Bakery JSON-LD schema to homepage (Index.tsx) with full address, phone, geo coordinates, price range, and opening hours — enables Google local business panel
- Added FoodEstablishment hasMenu JSON-LD to Menu page (Menu.tsx) with 3 cake size tiers (Small $35, Medium $55, Large $75) — enables Google rich product cards
- Updated sitemap.xml from 7 stale 2025-11-19 pages to 11 pages all dated 2026-04-03, adding /contact, /track, /privacy, /terms, /refund-policy

## Task Commits

Each task was committed atomically:

1. **Task 1: Install react-helmet-async and add HelmetProvider to App.tsx** - `8ab32e2` (chore)
2. **Task 2: Add JSON-LD schemas to Index.tsx and Menu.tsx + update sitemap.xml** - `8a1ec92` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/App.tsx` - Added HelmetProvider import and outermost wrapper
- `src/pages/Index.tsx` - Added Helmet import and LocalBusiness/Bakery JSON-LD schema (address, phone, geo, hours)
- `src/pages/Menu.tsx` - Added Helmet import and FoodEstablishment hasMenu JSON-LD with 3 cake price tiers
- `public/sitemap.xml` - Rewrote with 11 public pages, all lastmod 2026-04-03, added contact/track/legal pages

## Decisions Made
- Schema const defined at module level (not inside component) to avoid object recreation on every render
- FoodEstablishment with hasMenu chosen over BakeryProduct for Menu page — better represents restaurant-style menu structure per schema.org guidelines
- Static menu schema with 3 price tiers — DB-driven schema would require SSR or deferred hydration; static is sufficient for SEO
- sitemap.xml uses /track (not /order-tracking) for order status URL per plan spec
- Legal pages included in sitemap with priority 0.2 and changefreq yearly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. To validate structured data, use Google's Rich Results Test at https://search.google.com/test/rich-results with the live URL after deployment.

## Next Phase Readiness
- All Phase 10 plans completed (SEO structured data is the last plan in Phase 10)
- Site is production-ready: react-helmet-async in place for any future meta tag management
- Submit updated sitemap to Google Search Console after deploying to elisbakery.com

## Self-Check: PASSED

- src/App.tsx: FOUND
- src/pages/Index.tsx: FOUND
- src/pages/Menu.tsx: FOUND
- public/sitemap.xml: FOUND
- 10-05-SUMMARY.md: FOUND
- Commit 8ab32e2: FOUND
- Commit 8a1ec92: FOUND

---
*Phase: 10-post-launch-polish*
*Completed: 2026-04-03*
