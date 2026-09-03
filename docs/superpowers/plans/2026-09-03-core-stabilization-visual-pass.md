# Core Stabilization and Visual Design Pass Implementation Plan

> **For agentic workers:** Execute this plan inline, one verified task at a time. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the confirmed authenticated journey bugs and turn the owner and recipient timelines into a modern, photo-led travel workspace without changing landing or authentication design.

**Architecture:** Keep Convex as the source of truth, make every edit an explicit server-confirmed transaction, and preserve the current single-page authenticated flow. Add small reusable route-overview and editing patterns instead of a map dependency; plot existing GPS-backed stops in a labelled approximate-sequence panel and connect its controls to timeline anchors.

**Tech Stack:** Next.js 16 App Router, React 19, Convex, CSS, Node test runner, Playwright.

**Spec:** `docs/Triplog_V1_Scoping_Doc.md`, `docs/Triplog_V1_Build_Plan.md`, and the user-approved Core Stabilization and Visual Design Pass.

## Global Constraints

- Preserve the landing page, signup/sign-in design, sign-out-to-landing behavior, all uploaded photographs, and saved journey data.
- Do not add a dependency.
- Do not invent traveller memories, opinions, warnings, recommendations, places, or exact routes.
- Public pages expose only explicitly published material.
- Do not begin unrelated repair-plan work.

---

### Task 1: Upload recovery and navigation

**Files:**
- Modify: `lib/trip.ts`
- Modify: `lib/trip.test.ts`
- Modify: `convex/trips.ts`
- Modify: `components/photo-onboarding.tsx`
- Modify: `components/trip-editor.tsx`

**Interfaces:**
- Produce: `isProcessingLeaseActive(status, updatedAt, now)` to distinguish an active reconstruction from an abandoned stale status.
- Preserve: `PhotoOnboarding.onComplete(tripId)` returns to the reactive journey route after successful reconstruction queueing.

- [ ] Add failing tests showing a stale `shaping` journey does not block another journey's upload, while a recently updated reconstruction does.
- [ ] Patch `beginUpload` to block only a live processing lease and mark a stale competing status recoverable without changing its content.
- [ ] Keep successful uploads and existing photos untouched; show the saved count before selection.
- [ ] Keep partial failures on the upload screen, name each failed file, and add a retry action that reuses only that in-memory file.
- [ ] Verify timeline → photos → timeline and processing → Your journeys paths with deterministic controls.

### Task 2: Explicit, durable editing

**Files:**
- Modify: `lib/trip.ts`
- Modify: `lib/trip.test.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/trips.ts`
- Rewrite: `components/journey-workspace.tsx`
- Modify: `components/journeys-home.tsx`

**Interfaces:**
- Produce: visible length constants and validation for titles, locations, destinations, and enrichment text.
- Change: `addMoment` accepts `requestId` and uses `manual:${requestId}` as its idempotent key.

- [ ] Add failing tests for unchanged saves, explicit length errors, and duplicate manual-memory requests.
- [ ] Remove silent text slicing; reject over-limit values with a clear server error and matching visible browser limits.
- [ ] Replace delayed note auto-save with read, edit, saving, success, and retry states that retain drafts on failure.
- [ ] Add immediate submission locks so rapid repeat clicks cannot duplicate mutations.
- [ ] Apply Save and Cancel to title/cover, stop location, notes, manual memories, and trip details.

### Task 3: Travel-product workspace

**Files:**
- Create: `components/journey-overview.tsx`
- Rewrite: `components/journey-timeline.tsx`
- Rewrite: `components/journey-workspace.tsx`
- Modify: `components/public-chapter.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produce: `JourneyOverview` with GPS stop plotting, numbered approximate sequence, empty GPS state, and stop-selection callback.
- Produce: `DayNavigation` with horizontal chips and active-day state.

- [ ] Build a compact sticky owner header with Your journeys, trip facts, Add photos, Preview and share, and an overflow menu for secondary actions.
- [ ] Plot only stored GPS evidence, label dotted connections as approximate, and scroll selected pins/day chips to timeline anchors.
- [ ] Make photos the dominant content through responsive grids and mobile horizontal snapping.
- [ ] Show saved enrichment as compact labelled sections and one quiet empty enrichment action per moment.
- [ ] Reuse the same visual base in the read-only shared journey and add a clear Your journeys action.

### Task 4: Regression and browser validation

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/core-stabilization.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produce: `npm run test:e2e` for the approved authenticated core flow.

- [ ] Cover back navigation, additional upload without duplication, save-to-read-to-edit, persistence after reload, and mobile control visibility.
- [ ] Cover failure/retry and double-click behavior at the helper or browser level where deterministic.
- [ ] Check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 390, 768, and 1440 pixels.
- [ ] Capture screenshots for the three target widths after the browser flow is stable.

### Task 5: Final evidence and handoff

**Files:**
- Modify: `SCOPE.md`
- Modify: `PLAN.md`
- Modify: `TEACH.md`
- Modify: `docs/Triplog_V1_Build_Plan.md`
- Modify: `docs/Triplog_V1_Repair_Plan.md`
- Modify: `docs/Triplog_Phase_1_Report.md`

- [ ] Run `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`, and Convex validation.
- [ ] Record exact pass/fail evidence, browser widths, screenshots, live-state root causes, files changed, and anything not verified.
- [ ] Confirm protected files remain unchanged with `git diff --` checks.
- [ ] End with a plain-language teach-back and the exact manual review sequence.
