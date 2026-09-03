# Mobile Upload And Layout Implementation Plan

> **For agentic workers:** Execute this plan task by task and stop after the validation gate. Do not commit, push, deploy, or add dependencies.

**Goal:** Make multi-photo intake responsive and recoverable on iPhone-sized screens while leaving the desktop design unchanged.

**Architecture:** Keep Convex storage and the existing upload records. Add a small browser-side queue helper so photo preparation runs one at a time and storage requests run with a fixed limit, then expose that queue state in the existing upload screen. Add narrow-screen and safe-area CSS only below the existing mobile breakpoints.

**Tech Stack:** Next.js 16 App Router, React 19 client components, Convex mutations/storage, browser Canvas and ImageBitmap APIs, CSS media queries, Node test runner, Playwright.

**Spec:** User request in the 2026-09-03 mobile upload and layout review.

## Global Constraints

- Preserve the existing visual design and desktop layout.
- Accept image files only; never accept video.
- Do not silently discard a selected file.
- Trips stay private by default.
- Add no dependency.
- Validate with `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- Test viewport widths from 320px through 430px.

---

### Task 1: Bounded browser work

**Files:**
- Create: `lib/photo-upload.ts`
- Modify: `lib/photo-metadata.ts`
- Test: `lib/trip.test.ts`

**Interfaces:**
- Produces: `photoFormat(file)`, `photoFileError(file)`, and `createTaskLimiter(limit)`.
- `photoFormat` accepts JPEG, PNG, WebP, HEIC, and HEIF image identifiers, including extension fallback only when the browser supplies no useful MIME type.
- `photoFileError` rejects videos, unknown formats, and files above 50 MB with a filename-specific reason.
- `createTaskLimiter` never runs more than `limit` async jobs at once.

- [x] Add failing tests for supported image formats, video rejection, unknown/empty MIME handling, file-size rejection, and the maximum number of simultaneous jobs.
- [x] Run `npm run test` and confirm the new expectations fail.
- [x] Add the minimal helper implementation.
- [x] Change the three Canvas encodes in `createPhotoVariants` from simultaneous to sequential so a phone holds fewer large canvases at once.
- [x] Run `npm run test` and confirm it passes.

### Task 2: Immediate and honest upload feedback

**Files:**
- Modify: `components/photo-onboarding.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: the Task 1 validators and task limiter.
- Produces: an immediate selected-file receipt, preparation/upload progress, per-file states, complete rejection details, and per-file Retry.

- [x] Yield one browser paint after the picker returns so the raw selected count and “Preparing photo list” state appear before preview work.
- [x] Show every rejected filename and reason instead of truncating the list.
- [x] Reserve accepted files as today, prepare only one photo at a time, process at most two photos in the outer queue, and upload at most two blobs at once across the batch.
- [x] Show `Preparing N photos` before the first prepared item and `Uploading X of N` as items finish; include a real progress element.
- [x] Keep failed cards visible with their filename, reason, and individual Retry action.
- [x] Include HEIC and HEIF in the image-only picker; if the current browser cannot decode one, fail that file visibly with export guidance.

### Task 3: iPhone-width containment and safe areas

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `viewport-fit=cover` plus safe-area-aware headers and bottom padding.

- [x] Export the Next.js `viewport` object with `viewportFit: "cover"`.
- [x] Add safe-area inset padding to the journey-library and upload headers without changing desktop measurements when inset values are zero.
- [x] Make the journey tabs a non-shrinking horizontal strip with scroll padding and hidden overflow chrome.
- [x] At 430px and below, constrain headings, cards, action rows, and upload content to the viewport; at 360px and below, reduce only mobile padding/type where needed.

### Task 4: Documentation and validation gate

**Files:**
- Modify: `SCOPE.md`
- Modify: `PLAN.md`
- Modify: `TEACH.md`
- Modify: `scripts/test-core-browser.mjs` only if a reusable viewport assertion can be added without changing the existing journey flow.

- [x] Record the conditional HEIC/HEIF behavior, bounded upload scheduling, retry behavior, and safe-area decision.
- [x] Run `npm run test`.
- [x] Run `npm run lint`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run browser checks at 320, 360, 375, 390, 414, and 430 pixels, plus 1440 pixels for desktop regression; verify there is no page-level horizontal overflow and save screenshots.
- [x] Stop for review and report every check or error. Do not commit, push, or deploy.
