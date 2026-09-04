# Sequence-First Journey Map Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chronological 1-to-N stop sequence the clear focal point while retaining the real geographic basemap as supporting context.

**Architecture:** Keep `JourneyOverview` and its existing data contract. Add a pure display-position helper that preserves each true projected coordinate as an anchor while deterministically separating colliding marker buttons. Render the route and markers inside the map, but render selected-stop details in normal page flow below it.

**Tech Stack:** React 19 client component, TypeScript, existing CSS design tokens, current OpenStreetMap raster tiles, Node test runner.

**Spec:** User request in the active conversation dated 2026-09-04.

## Global Constraints

- Change only the journey overview/map component, its pure map helper, relevant styles, tests, and this plan.
- Keep the basemap, automatic fitting, fallbacks, accessibility, existing data, and unrelated flows unchanged.
- Do not add routing, directions, geocoding, animation, paid services, or dependencies.
- Do not commit or push.

---

### Task 1: Deterministically separate nearby markers

**Files:**
- Modify: `lib/journey-map.ts`
- Modify: `lib/trip.test.ts`

**Interfaces:**
- Consumes: fitted points from `createJourneyMapScene(points, size, padding)`.
- Produces: `spreadJourneyMapPoints(points, size, minimumDistance)` returning each point with `anchorX`, `anchorY`, and `displaced` while keeping the original input untouched.

- [ ] **Step 1: Add a failing close-stop test**

```ts
const spread = spreadJourneyMapPoints(sameLocationStops, { width: 390, height: 370 });
assert.equal(new Set(spread.map((point) => `${point.x},${point.y}`)).size, sameLocationStops.length);
assert.ok(spread.every((point) => point.x >= 24 && point.x <= 366));
```

- [ ] **Step 2: Run `npm run test` and confirm the new export is missing**

- [ ] **Step 3: Implement deterministic candidate placement**

Keep an undisplaced marker at its fitted coordinate when it does not collide. For a collision, test bounded positions on fixed rings around that exact coordinate, select the first position at least `minimumDistance` from earlier markers, and retain the exact coordinate as `anchorX`/`anchorY` for a visible leader line.

- [ ] **Step 4: Run `npm run test` and confirm close markers are distinct, bounded, ordered, and input data is unchanged**

### Task 2: Move detail content out of the map and restore sequence hierarchy

**Files:**
- Modify: `components/journey-overview.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `spreadJourneyMapPoints(scene.points, mapSize)`.
- Produces: map marker buttons whose display positions may differ from their truthful anchor positions, plus a normal-flow `.map-stop-detail` beneath the map.

- [ ] **Step 1: Separate initial active state from explicit map selection**

Use `selectedDetailStopId` with no initial value so the overview loads without details. Marker or strip interaction sets it; the existing `activeStopId` may still visually emphasise a stop without opening details automatically.

- [ ] **Step 2: Draw the chronological sequence through display positions**

Render a high-contrast deep-green dashed line over a quiet tile treatment. For displaced markers, render a fine leader from `anchorX,anchorY` to `x,y` and a small dot at the true anchor.

- [ ] **Step 3: Render details after the map**

Move representative photo, stop number, location, day/date, photo count, and `View stop` into `.map-stop-detail`. Do not render any popup inside `.geographic-map`.

- [ ] **Step 4: Synchronise the map and sequence strip**

Marker selection scrolls its `route-stop-card-*` button into view. Sequence-card selection updates the active state and focuses the corresponding `map-marker-*` button without scrolling the page unexpectedly. `View stop` keeps the existing timeline jump.

- [ ] **Step 5: Apply the established visual system**

Set the map to about `510px` desktop and `370px` mobile. Keep the existing warm surface, forest ink, water-toned metadata, subtle shadow, 44px controls, and horizontally scrollable strip. Use compact route cards with visible connective dashes.

### Task 3: Validate final behavior

**Files:**
- Test only; no production-file changes expected.

**Interfaces:**
- Consumes: final component, styles, and map helper.
- Produces: a review report; no commits or deployment.

- [ ] **Step 1: Run `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`**

- [ ] **Step 2: Verify the Japan multi-stop fixture, Goa single-stop fixture, and a same-coordinate collision fixture**

- [ ] **Step 3: Inspect about 390px, 768px, and 1440px widths for overflow, marker access, route clarity, external detail placement, and keyboard focus**

- [ ] **Step 4: Report exact changed files, checks, and any visual-validation limitation, then stop for manual review**
