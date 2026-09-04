# Publish cover fallback implementation plan

**Goal:** Let a fresh journey publish when recipient preview has a valid included photo but no saved cover, while preserving explicit covers and the existing share-link flow.

**Approach:** Keep the change inside the existing publish path. Select the saved cover when present. Only when no cover is saved, choose the first included journey photo in the same chronological order used by the journey UI. Write that photo ID into the trip's existing publish update so the cover and publication become durable together.

**Dependencies:** No new packages, services, schema fields, or data migration.

---

## Task 1: Add focused cover-selection regression tests

**Files:**
- Modify: `lib/trip.test.ts`
- Modify: `lib/trip.ts`

Add tests for a single included fallback, deterministic selection from several photos, preservation of an explicit cover, and rejection when no included photo is usable. Keep the selector pure so these cases run in the existing fast test suite.

## Task 2: Apply the fallback in `trips:publish`

**Files:**
- Modify: `convex/trips.ts`

Load all photos for the journey, resolve the cover with the tested selector, keep the existing error when no usable cover exists, and include `coverPhotoId` in the same trip patch that records the new share token and published state. Do not change the existing-link return path or share-link creation rules.

## Task 3: Record the product decision

**Files:**
- Modify: `SCOPE.md`
- Modify: `PLAN.md`
- Modify: `TEACH.md`

Document that an explicit cover wins and that publishing safely persists the first included photo only when a saved cover is absent.

## Task 4: Validate

Run `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Do not deploy, commit, or push.
