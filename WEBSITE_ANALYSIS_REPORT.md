# Eli's Bakery Cafe — Full Website Analysis Report

**Date:** February 12, 2026
**Site:** [elisbakery.com](https://www.elisbakery.com)
**Stack:** React 18 + Vite + TypeScript + Supabase + Tailwind CSS + shadcn/ui + Stripe + i18n

---

## Executive Summary

The website is visually polished with a strong brand identity — the dark/gold color scheme, bilingual support (ES/EN), and the overall aesthetic work well for a family-owned Mexican bakery. The tech stack is modern and well-structured with lazy loading, code splitting, PWA support, error boundaries, and Sentry monitoring.

However, I found **2 critical issues, 8 high-severity issues, and 8 medium-severity issues** that should be addressed before you consider the site production-ready. The most impactful problems are: exposed credentials in environment files, a massive empty section visible on the homepage (especially on mobile), and placeholder social sharing images pointing to lovable.dev.

---

## CRITICAL Issues (Fix Immediately)

### 1. Environment Files with Live Credentials

**Files:** `.env`, `.env.local`, `backend/.env`

Your `.env.local` contains **live production keys** including a Stripe live key (`pk_live_...`), a Vercel OIDC token, and your Supabase anon key. The `backend/.env` contains your PostgreSQL `DATABASE_URL` with the password, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_API_KEY`.

Even though these are in `.gitignore`, if they were ever committed to git history, anyone with repo access can retrieve them. **You should rotate (revoke and regenerate) all of these keys immediately**, then scrub them from git history using `git filter-branch` or BFG Repo Cleaner.

### 2. Massive Empty/Black Section on Homepage

**Component:** `TestimonialCarousel` (in `src/components/testimonials/TestimonialCarousel.tsx`)

When scrolling the homepage, there is an enormous blank black section between the Pan Dulce product cards and the Visit Us / Google Maps area. This is especially severe on **mobile**, where it spans 3–4 full screen heights of pure emptiness. This makes the site look broken.

**Root cause:** The `TestimonialCarousel` has `min-h-[500px]` enforced, and the testimonial cards use fixed `h-[420px] w-[350px]` dimensions with negative margins for an overlapping layout. On mobile, the cards stack vertically with `gap-12`, and the combination of external avatar dependencies (`ui-avatars.com`) and animation/hover states causes the section to fail silently and render as empty space.

**Fix:** Either redesign the testimonial section with responsive, content-driven heights (remove `min-h-[500px]` and fixed card dimensions), or add proper fallback content so the section collapses gracefully if content doesn't load.

---

## HIGH Severity Issues

### 3. Social Sharing Images Point to Lovable.dev

**File:** `index.html` (lines 31, 35)

Your Open Graph and Twitter Card images still point to a Lovable.dev placeholder URL:
```
https://lovable.dev/opengraph-image-p98pqg.png
```

Anyone sharing your site on Facebook, Twitter/X, WhatsApp, iMessage, or LinkedIn will see a generic Lovable image instead of your bakery branding. **Create a proper OG image** (1200×630px recommended) showing your logo/bakery and host it on your own domain.

### 4. PWA Manifest References Missing Files

**File:** `public/manifest.json`

The manifest includes `screenshots` entries for `screenshot-wide.png` and `screenshot-narrow.png`, but **these files don't exist** in the `public/` directory. This causes PWA install prompts to fail validation on Android devices. Either add the screenshots or remove those entries from the manifest.

### 5. Large Unoptimized Images

**Directory:** `public/`

Your `favicon.png` is **1.4 MB** — a favicon should be under 50 KB. You also have `favicon.jpg` (390 KB) as an unnecessary duplicate. Menu images in `public/menu/` range from 674–840 KB each with no WebP variants. This means first-time visitors are downloading 2–3+ MB of unnecessary image data, hurting your Largest Contentful Paint (LCP) score and mobile experience.

**Fix:** Convert images to WebP, create responsive `srcset` variants, and compress the favicon down to proper size.

### 6. Duplicate Legal Page Routes

**File:** `src/App.tsx`

You have two sets of legal routes pointing to different components:
- `/privacy` → `pages/Privacy.tsx`
- `/terms` → `pages/Terms.tsx`
- `/legal/privacy` → `pages/Legal/PrivacyPolicy.tsx`
- `/legal/terms` → `pages/Legal/TermsOfService.tsx`

This creates duplicate content (bad for SEO) and potentially conflicting legal text. **Consolidate into one set of routes** — likely the `/legal/*` versions since they're more structured — and redirect the old paths.

### 7. Missing Image Alt Text

**File:** `src/components/print/InvoiceTemplate.tsx` (and likely others)

Logo images are rendered without `alt` attributes. This is an accessibility failure — screen readers can't describe these images — and it hurts your SEO. Add descriptive `alt` text to all `<img>` tags across the codebase.

### 8. CORS Open in Development Mode

**File:** `backend/middleware/cors.js`

When `NODE_ENV === 'development'`, CORS allows **all origins** with no restrictions. If your backend is ever accidentally deployed without `NODE_ENV=production` set, any website could make API requests to your backend. Additionally, `FRONTEND_URL` isn't set in `backend/.env`, so even in production the CORS whitelist may not work correctly.

**Fix:** Always set `FRONTEND_URL=https://elisbakery.com` in your backend environment, and consider removing the blanket development CORS bypass.

### 9. No `robots.txt` Optimization & Stale Sitemap

**File:** `public/sitemap.xml`

Your sitemap has a hardcoded `<lastmod>` date of `2025-11-19`. This should be updated to reflect actual content changes. Additionally, ensure your `robots.txt` properly references the sitemap and doesn't accidentally block important pages.

### 10. Missing `<title>` Tags on Sub-Pages

The page title stays as "Eli's Bakery Cafe | Pastelería y Panadería Tradicional" across all routes. Each page (Menu, Gallery, FAQ, Order, About) should have its own unique `<title>` and meta description for proper SEO. Consider using `react-helmet-async` or a similar solution.

---

## MEDIUM Severity Issues

### 11. TypeScript `any` Types Throughout Codebase

**Files:** `src/types/order.ts`, `src/types/index.ts`, `src/types/orderState.ts`, `src/contexts/AuthContext.tsx`, `src/components/order/CancelOrderModal.tsx`, and others

There are 20+ instances of `any` type usage, which defeats the purpose of TypeScript. Key offenders include `items?: any[]` in order types and `order: any` in components with ESLint disable comments. Replace these with proper typed interfaces.

### 12. Console Logging Left in Production Code

**Files:** `src/lib/performance.ts`, `src/lib/googleMaps.ts`, `src/lib/pwa.ts`

Multiple `console.log` statements are left in library files that run in production. These expose internal application state to anyone who opens DevTools. Wrap these in development-only checks or remove them entirely.

### 13. No `React.memo` on Expensive List Components

The order list/table components in the dashboard re-render on every parent state change, even though they render potentially 100+ items with search, filters, and pagination. Wrap these in `React.memo` and memoize expensive calculations with `useMemo`.

### 14. Dashboard Bundle Size Too Large

The dashboard chunk is one of the largest in the build. Since only admins access this, break it into sub-chunks (orders, inventory, analytics) so the initial load isn't as heavy even for admin routes.

### 15. `dangerouslySetInnerHTML` in Chart Component

**File:** `src/components/ui/chart.tsx`

The chart component uses `dangerouslySetInnerHTML` to inject CSS theme styles. While currently safe (the data is hardcoded), this is an anti-pattern that could become a vulnerability if the data source changes. Use CSS modules or styled-components instead.

### 16. Supabase Silent Failure in Production

**File:** `src/lib/supabase.ts`

When Supabase environment variables aren't set, the code just logs a warning and continues with an empty string URL. In production, this means authentication, storage, and database features silently fail. Add a hard error in production mode.

### 17. Missing Backend `FRONTEND_URL` Configuration

**File:** `backend/.env`

The CORS middleware references `process.env.FRONTEND_URL` but this variable isn't defined in the backend environment file. This means CORS falls back to the request origin, reducing security.

### 18. No Error Boundaries on Protected Routes

**File:** `src/App.tsx`

The protected admin routes (FrontDesk, OwnerDashboard) re-wrap in `<Suspense>` but don't have their own `<ErrorBoundary>`. If these pages throw an error, the entire app crashes instead of showing a graceful error state for just that route.

---

## What's Working Well

Your codebase has a lot of solid engineering already in place. Here's what stands out positively:

- **Lazy loading & code splitting** — All pages use `React.lazy()` with proper `Suspense` boundaries and manual Rollup chunks for vendor libraries. This is well-done.
- **Bilingual support (i18n)** — The ES/EN toggle works smoothly and the language context is clean.
- **PWA configuration** — Service worker, offline indicator, and runtime caching for Supabase/API/images are properly set up (aside from the missing screenshots).
- **Authentication & role-based routing** — Protected routes with `requiredRole` for baker vs. owner access is properly implemented.
- **Error monitoring** — Sentry integration with production-only enabling and an `ErrorBoundary` at the app root.
- **Security headers** — Helmet.js, rate limiting, and input validation in the backend.
- **Design quality** — The dark/gold aesthetic is cohesive and the typography choices (Playfair Display + Nunito) work well for the brand.
- **The order flow UX** — The step-by-step cake ordering with date picker, time slots, and estimated total is intuitive.

---

## Recommended Priority Order

**Immediately (this week):**
1. Rotate all exposed API keys and credentials
2. Fix the empty homepage section (TestimonialCarousel)
3. Replace the Lovable.dev OG images with your own

**Short-term (next 1–2 weeks):**
4. Optimize images (compress, convert to WebP)
5. Consolidate duplicate legal routes
6. Fix PWA manifest (remove or add screenshots)
7. Add unique page titles and meta descriptions per route
8. Set `FRONTEND_URL` in backend environment

**Medium-term (next month):**
9. Add alt text to all images
10. Replace `any` types with proper TypeScript interfaces
11. Remove production console logging
12. Add `React.memo` to list components
13. Add per-route error boundaries

---

*Report generated by full codebase review + live site inspection on February 12, 2026.*
