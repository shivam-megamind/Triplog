# Geographic Journey Map Implementation Plan

**Goal:** Replace the abstract stop grid with a real, calm geographic overview using only the coordinates already attached to reconstructed stops.

**Architecture:** Keep `JourneyOverview` as the only UI entry point. A small pure helper will project latitude/longitude onto OpenStreetMap's Web Mercator tile grid, choose a zoom that fits all plotted stops, and return only the visible tiles and marker positions. The client component will render those tiles with visible attribution, its own numbered marker buttons, and the existing chronological stop list. It will never request directions, infer routes, or write journey data.

**Tech Stack:** React client component, TypeScript, existing CSS, native image tiles from the no-key OpenStreetMap tile service, Node's existing test runner.

---

### Task 1: Lock down map fitting behavior

**Files:**
- Create: `lib/journey-map.ts`
- Modify: `lib/trip.test.ts`

1. Add tests using existing Japan-area coordinates for a multi-stop journey and the existing Goa coordinate for a single-stop journey.
2. Confirm every Japan marker fits inside the padded frame and produces a chronological line.
3. Confirm Goa centres at a close single-stop zoom and has no line.
4. Confirm creating a map scene does not mutate input stop data.

### Task 2: Replace the abstract map canvas

**Files:**
- Modify: `components/journey-overview.tsx`
- Modify: `app/globals.css`

1. Derive one marker per reconstructed stop that already has coordinates.
2. Render visible OpenStreetMap raster tiles with a linked attribution label.
3. Draw a subtle dashed line between stops strictly in chronological order and keep the exact-route disclaimer visible.
4. Show an accessible selected-stop detail card with stop number, location, day/date, photo count, and representative photo when available.
5. Link marker selection to the existing active stop card and stop-card interaction back to the marker detail state.
6. Preserve all non-GPS stops in the chronological list, and show a clear no-map or tile-failure fallback without hiding that list.

### Task 3: Validate the isolated change

**Files:**
- Test only; no production-file changes expected

1. Run `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
2. Exercise Japan's multi-stop and Goa's single-stop cases.
3. Inspect the journey map at about 390px, 768px, and 1440px, including keyboard focus and horizontal overflow.
4. Report every changed file, pass/fail result, and remaining V1 limitations. Do not commit or push.
