# Build plan

## Milestone 1 — Smallest functional vertical slice

Status: in progress

### Acceptance criteria

- A person can create or sign into an account and start one completed trip.
- They can rename a trip, start another, and switch between saved trips.
- They can upload one to six photos and see clear upload failures.
- Photo EXIF dates order photos and create day groups automatically.
- One representative GPS coordinate per day group suggests a place through Nominatim; results are cached and attributed.
- Missing date or GPS metadata uses manual correction; existing metadata is prefilled and editable.
- They can confirm each day and add one authentic memory.
- They can save and revisit one finished chapter in a later browser session.
- The trip begins private. Publishing creates one read-only link; unpublishing disables it.
- Private records and drafts are checked against the signed-in owner on the server.
- The public query returns only a completed, explicitly published chapter.

### Layer changes

- Interface: Next.js editor, chapter preview, authentication, and public page.
- Business logic: EXIF parsing, chronological grouping, representative-coordinate selection, server ownership checks, upload cap, chapter validation, publish/unpublish rules.
- Database: Convex auth tables, trips, photos with capture metadata, reconstructed days, geocode cache, and indexes.
- Integration: Convex Auth, database and file storage; OpenStreetMap Nominatim reverse geocoding with one request per uncached day group.

### Validation commands

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run dev`
- `npx convex dev --local`

### Recovery

- Failed image uploads leave the saved trip unchanged and can be retried.
- Invalid chapter edits are rejected without overwriting saved data.
- Unpublish invalidates the public query while keeping the private trip.
- Local development data can be recreated; no deployment or destructive reset is part of this milestone.

### Approvals and blockers

- Approved: Next.js, React, TypeScript, ESLint, Convex, Convex Auth, and `jose` dependencies.
- Approved: core action and Milestone 1 scope from the product brief.
- Pending validation: local Convex configuration and browser flow.

### Approved landing-page addition

- Public route `/`: four-part, photography-led Triplog landing page with exactly one repeated action, “Turn a trip into a book.”
- Private product route `/book`: preserves the existing sign-in and trip-building flow.
- Acceptance: the promise, automatic reconstruction, traveller control, and private-by-default rule are clear above the fold; both actions open `/book`; the page works at 390px and desktop widths; keyboard focus and reduced-motion preferences are respected.
- Validation: use the existing lint, typecheck, test, and production-build commands, then inspect `/` and `/book` in the browser.
- Recovery: the landing page is isolated in `app/page.tsx` and `app/landing.module.css`; removing it and moving the `/book` page back to `/` restores the prior route structure without touching saved Convex data.

## Later milestones

Milestones 2–5 remain as defined in the product brief and are not started.

## Decision log

- 2026-08-31: Use Next.js and Convex, deployable to Vercel (user decision).
- 2026-08-31: Build the retrospective, completed-trip loop first (user decision).
- 2026-08-31: Keep trips private until the owner explicitly publishes (product rule).
- 2026-08-31: Use installed email-and-password auth for V1 because installed Convex Auth 0.0.95 has no passkey provider. No verification email or password reset in this slice; revisit before public launch.
- 2026-08-31: Limit Milestone 1 to six photos so the complete loop can be tested before reconstruction work.
- 2026-08-31: Product name corrected from Keepsake to Triplog (user decision).
- 2026-08-31: Reconstruction is required in Milestone 1: EXIF ordering and day grouping, with manual entry only for missing metadata (user correction).
- 2026-08-31: Use OpenStreetMap Nominatim with one representative coordinate per day group, permanent coordinate caching, visible attribution, and no photo transfer (user decision).
- 2026-08-31: Repair legacy photo records by reading saved files back in the signed-in browser, restoring EXIF metadata, and rebuilding days without a manual refresh.
- 2026-08-31: Support multiple trips per account with editable names and an explicit trip switcher (user correction).
- 2026-09-01: Add the approved four-part landing page at `/`, keep the working product at `/book`, and use only the CTA “Turn a trip into a book,” repeated twice (user decision).
