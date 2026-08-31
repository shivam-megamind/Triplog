# Build plan

## Milestone 1 — Complete Build Week journey

Status: in progress

Goal: one signed-in traveller can turn up to 500 photos from a completed trip into a saved, private first-draft travel book, add their own words, and share the whole finished journey through one revocable link.

The public landing page at `/` is complete and frozen. Product work stays under `/book` and `/share/[token]`.

### Implementation sequence

- [ ] Expand the Convex schema and pure reconstruction rules for photo metadata, processing state, day groups, similar-photo moments, and revocable shares.
- [ ] Replace blank Day 1 entry with focused onboarding, thumbnail review, controlled batch upload, and real processing steps.
- [ ] Reveal a photo-led reconstructed timeline with uncertainty labels, grouped-photo expansion, corrections, and contextual traveller-authored prompts.
- [ ] Build the private editorial book preview and signed-in, read-only whole-journey sharing with revoke support.
- [ ] Validate small real uploads, missing metadata, grouped bursts, persistence, private access, revoked links, mobile/desktop layout, keyboard use, reduced motion, console, tests, lint, types, and production build.

### Acceptance criteria

- The landing-page CTA opens the existing authenticated product without changing the landing page itself.
- A new traveller sees “A trip is already waiting in your camera roll,” selects or drops supported photos, reviews thumbnails, removes mistakes, and sees an exact count before upload.
- Up to 500 photos upload to Convex storage in controlled batches. Unsupported files are explained and never claimed as saved.
- Triplog stores capture time, local date, GPS when present, orientation, dimensions, file type, file size, exact hash, and a lightweight visual hash when the browser can produce one.
- Photos are ordered by local capture time, with selected order preserved for missing dates. Days and deterministic moments are reconstructed from real metadata.
- Exact duplicates and short similar/burst sequences stay saved, appear as one expandable moment, and clearly say how many photos were grouped.
- Missing GPS never produces an invented place. Nominatim receives at most one representative coordinate per day, results remain cached, and OpenStreetMap attribution remains visible.
- The traveller can correct day details and save memories, recommendations, warnings, and unseen details in their own words.
- The private preview has a cover, date range, day chapters, large representative photographs, confirmed places, and traveller-authored text.
- Sharing creates a new hard-to-guess whole-journey link. A recipient must sign in, receives read-only data only, and loses access after the owner revokes the link.
- Saved work survives a new browser session. Private and draft data are rejected in Convex rather than merely hidden in the interface.

### Four layers

- Interface: onboarding uploader, selection tray, real processing state, reconstructed timeline, moment editor, private book, and signed-in shared reader.
- Business logic: file validation, controlled batching, metadata extraction, deterministic duplicate/burst grouping, day reconstruction, share eligibility, and revoke rules.
- Database: trip processing fields, rich photo metadata, day records, moment records, storage references, share links, and access records.
- Integrations: Convex Auth, Convex database and file storage, cached OpenStreetMap Nominatim reverse geocoding, and later Vercel hosting. No image-AI service is added.

### Validation commands

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npx convex dev --once`
- `npm run build`
- `npm run dev`

### Recovery

- Selection happens before storage writes; removing a thumbnail changes only the local selection.
- A failed batch keeps earlier confirmed uploads and identifies that processing did not complete.
- Reconstruction never deletes stored originals. Rebuilding moments preserves matching traveller-authored text where possible.
- Revoking a link invalidates it in Convex and never deletes the owner’s trip.
- Existing Milestone 1 records use optional new fields and remain readable during the local migration.
- Landing-page source and image hashes are checked before and after implementation.

### Approvals and blockers

- Approved: Next.js, React, TypeScript, ESLint, Convex, Convex Auth, `jose`, and the existing `exifr` metadata reader.
- Approved: up to 500 photos, deterministic lightweight moment grouping, whole-journey sharing, signed-in recipients, and the supplied copy/design direction.
- No new dependency, external image-AI service, public deployment, Vercel change, or GitHub push is authorised.

## Later milestones

User testing and evidence-led iteration remain later work. Granular privacy, collaboration, imports, maps, voice, generated writing, payments, printed/PDF books, notifications, and social or video exports are not part of this build.

## Decision log

- 2026-08-31: Use Next.js and Convex, deployable to Vercel (user decision).
- 2026-08-31: Build the retrospective, completed-trip loop first (user decision).
- 2026-08-31: Keep trips private until the owner explicitly publishes (product rule).
- 2026-08-31: Use installed email-and-password auth for V1 because installed Convex Auth 0.0.95 has no passkey provider. No verification email or password reset in this slice; revisit before public launch.
- 2026-08-31: Product name corrected from Keepsake to Triplog (user decision).
- 2026-08-31: Reconstruction is required in Milestone 1: EXIF ordering and day grouping, with manual entry only for missing metadata (user correction).
- 2026-08-31: Use OpenStreetMap Nominatim with one representative coordinate per day group, permanent coordinate caching, visible attribution, and no photo transfer (user decision).
- 2026-08-31: Repair legacy photo records by reading saved files back in the signed-in browser, restoring EXIF metadata, and rebuilding days without a manual refresh.
- 2026-08-31: Support multiple trips per account with editable names and an explicit trip switcher (user correction).
- 2026-09-01: Add the approved four-part landing page at `/`, keep the working product at `/book`, and use only the CTA “Turn a trip into a book,” repeated twice (user decision).
- 2026-09-01: Freeze the completed landing page and expand Milestone 1 into the complete post-trip reconstruction, moment, book, and signed-in whole-journey sharing flow (user decision).
