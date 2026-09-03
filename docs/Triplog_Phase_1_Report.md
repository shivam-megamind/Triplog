# Triplog Core Repair Phase 1 Completion Report

**Date:** 3 September 2026  
**Scope:** Core Repair Phase 1 only  
**Status:** Implementation and automated validation complete; hands-on browser verification remains open  
**Phase 2:** Not started

## 1. Phase 1 objective

Phase 1 focused on the core action:

> A traveller uploads selected photos from a completed trip and receives a recognisable, chronological, editable journey organised by date and place.

The existing landing page, signup and authentication flow, and sign-out-to-landing behaviour were protected throughout this work.

## 2. What changed

### Reconstruction

- Reconstruction now creates a hierarchy of dates, multiple place-based stops within each date, and chronological moments within each stop.
- Available photo capture date, capture time, and GPS coordinates are used as evidence.
- GPS-backed photos are grouped into chronological stop runs. Separate locations on the same date can therefore become separate stops.
- Each GPS-backed stop is sent for reverse geocoding, which means converting coordinates into a readable place name.
- Photos with a reliable date but no usable GPS remain on the correct date under a clearly labelled **Location unknown** stop.
- Photos without a reliable date remain in the existing unplaced-photo review flow until the traveller chooses a date.
- The interface presents a sequence of photo-backed stops. It does not claim that this sequence is the exact road, rail, or walking route taken.
- The system does not invent a place when GPS or a user correction is unavailable.

### Corrections and preservation

- A traveller can change a suggested stop name through **Edit location**.
- A traveller can move a moment to any existing stop, including a stop on another existing date.
- A manually corrected stop name is stored as user-provided information and is retained during later reconstruction.
- A manually moved moment is stored as user-placed information and keeps its corrected date and stop during later reconstruction, provided that destination stop still exists.
- Removing a moment from the visible timeline marks only the moment as removed. It does not delete the original photos or their viewing copies.
- Existing representative-photo choices remain authoritative when the chosen photo still belongs to the reconstructed moment.

### Photo intake

- The former large-photo requirement was removed.
- V1 now assumes approximately 10–100 selected photos per journey.
- A 100-photo internal safety limit is enforced in the browser and again by Convex.
- If a new selection would take the journey above 100 photos, the complete selection is rejected before upload. The browser does not silently accept a partial selection.
- JPEG, PNG, and WebP remain supported.
- HEIC and HEIF are rejected with a clear instruction to export the photo as JPEG, PNG, or WebP.
- No HEIC conversion dependency or separate upload service was added.
- Successfully uploaded photos remain saved. Failed or unfinished photos can still be retried or reselected without restarting successful uploads.

### Core interface

- Authenticated core-product screens now use a simple mobile-first product interface instead of the coffee-table-book presentation.
- The main workspace opens directly to the reconstructed timeline.
- The hierarchy prioritises dates, place-based stops, chronological moments, selected photos, memories, recommendations, warnings, and evidence that may need correction.
- Large editorial headings, decorative book phrases, and permanent journaling forms beside every photo were removed from the active core experience.
- Optional memory, detail, recommendation, and warning fields are hidden until the traveller opens them.
- Uncertain and unplaced evidence is presented before the editable timeline in a compact review area.
- The journey home, setup, upload, editing, recipient-preview, and authenticated shared-journey screens use scoped core-product styling. The protected landing and authentication styling was not changed.

### Sharing compatibility

- Recipient preview and publish/unpublish controls remain available.
- The authenticated shared journey now uses the same date, stop, and moment timeline structure.
- Newly reconstructed journeys share their stop-based timeline.
- An already-published journey created before stop records existed receives a read-only fallback based on its existing days and moments. This prevents an old share link from displaying an empty journey while it is waiting to be rebuilt by its owner.
- Account-gating and read-only recipient behaviour were retained.

### Documentation

- The V1 scoping document now describes the chronological travel timeline, the 10–100-photo assumption, the internal 100-photo limit, complete-selection rejection, and HEIC/HEIF rejection.
- The numbered build milestones were updated to remove the former large-photo requirement and book-style interface direction.
- The repair plan records the approved Phase 1 boundary and leaves browser-only evidence open.
- The short project scope, plan, and teaching notes were brought into line with the revised decisions.
- Milestones reopened by the independent review are not marked complete without accepted evidence.

## 3. Files changed for Phase 1

### Reconstruction, limits, and tests

- `lib/reconstruction.ts` — date, stop, and moment reconstruction.
- `lib/trip.ts` — internal 100-photo limit.
- `lib/trip.test.ts` — revised limit and reconstruction tests.

### Convex backend

- `convex/schema.ts` — stop records and persistent moment-placement source.
- `convex/trips.ts` — stop reconstruction, geocoding, correction mutations, original-preserving removal, upload validation, hydrated timeline data, and shared-timeline compatibility.
- `convex/_generated/api.d.ts` — regenerated Convex TypeScript bindings.

### Core interface

- `components/journey-timeline.tsx` — new owner/recipient travel-timeline presentation.
- `components/journey-workspace.tsx` — timeline editing, location correction, moment movement, optional notes, evidence review, and sharing preview.
- `components/photo-onboarding.tsx` — complete-selection limit check and HEIC/HEIF explanation.
- `components/journeys-home.tsx` — practical core wording and scoped core-product styling hook.
- `components/journey-setup.tsx` — scoped core-product styling hook.
- `components/public-chapter.tsx` — authenticated shared timeline.
- `app/globals.css` — scoped mobile-first core and shared-timeline styles.

### Product documentation

- `docs/Triplog_V1_Scoping_Doc.md`
- `docs/Triplog_V1_Build_Plan.md`
- `docs/Triplog_V1_Repair_Plan.md`
- `SCOPE.md`
- `PLAN.md`
- `TEACH.md`

No package dependency was added, and `package.json` was unchanged.

## 4. Tests and checks performed

### Automated tests

Command:

```text
npm run test
```

Result after the reconstruction-navigation repair: **Passed — 19 tests, 0 failures.**

The Phase 1 tests cover:

- accepting the 100th photo and rejecting an addition above 100;
- multiple GPS-backed stops on one date;
- keeping nearby GPS photos in one stop;
- chronological ordering of moments within a stop;
- placing a dated photo without GPS under **Location unknown**;
- preserving selection order when dates are unavailable;
- existing moment grouping, duplicate grouping, publishing checks, coordinate caching, and title-suggestion behaviour.

The test command still prints the pre-existing Node module-type warning. The warning does not fail the suite and was deliberately not repaired because it is a separate NIT in the repair plan.

### Lint

Command:

```text
npm run lint
```

Result: **Passed with no lint errors.**

### Type checking

Command:

```text
npm run typecheck
```

Result: **Passed with no TypeScript errors.**

### Production build

Command:

```text
npm run build
```

Result: **Passed.** Next.js compiled the application, completed TypeScript checking, generated static pages, and produced the `/`, `/book`, `/manifest.webmanifest`, and `/share/[token]` routes.

The build printed non-fatal `Couldn't load fs` and `Couldn't load zlib` messages during page generation. The command exited successfully. These warnings were not investigated as part of Phase 1.

### Convex validation

Command:

```text
npx convex codegen
```

Result: **Passed.** Convex bundled and uploaded the schema and functions to the configured development deployment, generated TypeScript bindings, and completed its TypeScript check.

### Local route checks

The running local application returned HTTP 200 for:

- `http://localhost:3000/`
- `http://localhost:3000/book`
- `http://localhost:3000/manifest.webmanifest`

An HTTP response only proves that the route responds; it does not prove that the complete user interaction works.

### Protected-area checks

SHA-256 hashes were recorded before Phase 1 and compared after the final build. All remained identical:

- `app/page.tsx`
- `app/landing.module.css`
- `components/auth-form.tsx`
- `components/landing-auth-action.tsx`
- `components/signed-out-redirect.tsx`
- `app/book/page.tsx`

The existing sign-out handler still calls Convex sign-out and then replaces the browser location with `/`.

### Scope checks

- No obsolete large-photo requirement remains in active source or planning documents. The independent review report remains unchanged as a historical record of what it reviewed.
- `package.json` is unchanged.
- `git diff --check` found no whitespace errors. Git still reports the existing Windows line-ending warnings.

## 5. Assumptions made

1. Consecutive GPS-backed photos no more than approximately 600 metres apart belong to the same suggested stop. This is a conservative implementation rule, not a claim about where the traveller actually stopped.
2. Moving from one GPS area to another creates a new chronological stop. Returning to the first area later can create another stop because the timeline represents sequence, not a merged destination directory.
3. Consecutive dated photos without GPS can share one **Location unknown** stop. They are not assigned to a nearby named location without supporting evidence.
4. A stop's reverse-geocoding coordinate is the average of the usable GPS coordinates in that stop. Only coordinates are sent for place-name lookup; photos are not sent.
5. The embedded capture date remains the source for automatic date placement. A photo without a reliable embedded date remains unplaced until the traveller supplies one.
6. Phase 1 permits movement only between dates and stops that already exist. Creating, splitting, merging, and manually reordering stops remain outside this phase.
7. A user-corrected moment placement can be retained only while its destination stop still exists. Automatically recreating a deleted stop would risk inventing structure.
8. The internal 100-photo safety boundary may be named in an error explaining why a selection was rejected, but it is not promoted as a product feature.
9. Existing shared journeys without stop records should remain readable through their earlier day-and-moment information until the owner rebuilds them.

## 6. Not verified

No browser was connected to the session during final validation. The following items therefore remain open and are not claimed as complete:

- visual inspection of the new timeline on a real phone-sized browser and desktop browser;
- the complete real-photo upload flow through the native file picker;
- extraction of date, time, and GPS from the user's actual camera files;
- live reverse geocoding of those real GPS coordinates;
- visible grouping of two real locations on one date;
- the **Location unknown** result using a real dated photo with GPS removed;
- location and moment-placement corrections after leaving, reopening, and running reconstruction again;
- original-photo availability after removing a visible moment;
- a complete owner and second-account recipient sharing test;
- the compatibility fallback using an existing published pre-Phase-1 journey;
- browser rejection of an over-limit selection and a real HEIC/HEIF file;
- a prepared normal-size 10–100-photo performance and responsiveness check.

The remaining BLOCKER, SHOULD-FIX, and NIT work in `docs/Triplog_V1_Repair_Plan.md` was intentionally not implemented. In particular, the reviewed security issue involving reusable Convex photo URLs after sharing is stopped remains unresolved and belongs to a later approved repair phase.

Development Resend testing was previously successful. Production email remains unverified and still requires the production Convex deployment to contain:

- `RESEND_API_KEY` for production;
- `RESEND_TEST_MODE=false`;
- `RESEND_FROM_EMAIL` using a verified sending domain;
- `SITE_URL` set to the deployed website origin.

No secret was hardcoded or committed.

## 7. Exact manual testing instructions

### Prepare the photos

Prepare 5–10 original JPEG, PNG, or WebP photos. Avoid copies downloaded from messaging or social applications because those copies often remove metadata.

The set should contain:

1. Photos from at least two different calendar dates.
2. At least two GPS-backed locations on the same date, preferably more than 600 metres apart.
3. At least one photo with a valid capture date but no GPS. A copy exported with location information removed is suitable if it keeps the capture date.
4. At least two photos captured close together at one location so moment grouping is visible.

### Create and upload the journey

1. Open `http://localhost:3000/`.
2. Use the existing signup or sign-in flow.
3. From **Your journeys**, select **Create journey**.
4. Enter a destination or trip region.
5. Enter start and end dates that include every prepared photo date.
6. Select **Continue to photos**.
7. Choose all 5–10 prepared photos in one selection.
8. Confirm that each selected item appears before upload.
9. Select the upload button.
10. Confirm that successful files show as saved and that the overall saved count advances.
11. Wait for reconstruction to finish and open the journey timeline.

### Verify reconstruction

1. Confirm that the timeline is arranged by calendar date from earliest to latest.
2. Open the date containing photos from two locations.
3. Confirm that it contains at least two separate stop cards in chronological order.
4. Confirm that the stops are described as suggestions from photo GPS rather than an exact travelled route.
5. Confirm that moments inside each stop run from earlier capture time to later capture time.
6. Find the dated photo without GPS.
7. Confirm that it appears on its correct date inside **Location unknown**.
8. Confirm that no invented place name is attached to that photo.
9. Expand **Photo details** on representative photos and compare the displayed capture time and GPS evidence with the original files where possible.

### Verify location correction

1. On a suggested stop, open **Edit location**.
2. Replace the suggestion with a recognisable location name.
3. Select **Save location**.
4. Confirm that the stop immediately displays the new name and says that it was confirmed by you.
5. Return to **Your journeys**.
6. Reopen the same journey.
7. Confirm that the corrected location remains.

### Verify moving a moment

1. Choose a moment that is easy to recognise.
2. Open **Move or remove**.
3. In **Move to**, choose an existing stop on another date or another stop on the same date.
4. Select **Move moment**.
5. Confirm that the moment appears beneath the chosen destination stop.
6. Return to **Your journeys** and reopen the journey.
7. Confirm that the moment remains in the corrected stop.

### Verify corrections survive reconstruction

1. Record the manually corrected stop name and moved moment from the previous steps.
2. Select **Add or retry photos**.
3. With no new files selected, select **Continue reconstruction**.
4. Wait until processing returns to ready and reopen the timeline.
5. Confirm that the manually corrected stop name remains.
6. Confirm that the manually moved moment remains under its selected date and stop.

### Verify original preservation

1. Before removing a moment, open its **Photo details**.
2. Open the **Original** link in a separate tab and confirm that the original file is available to the owner.
3. Return to the timeline and open **Move or remove** for that moment.
4. Select **Remove from timeline**.
5. Confirm that the moment disappears from the visible timeline.
6. Confirm that the journey's uploaded-photo total has not decreased.
7. Confirm that the already opened original remains available. Do not use this URL as a sharing-security test; reusable-file URL access is a separate unresolved review finding.

### Verify sharing

1. Open **Edit title and cover**.
2. Confirm the journey title and select a main photo.
3. Select **Confirm title and main photo**.
4. Select **Preview and share**.
5. Confirm that the recipient preview uses the chronological date, stop, and moment timeline.
6. Confirm that possibly unrelated and unplaced photos are not visible in the preview.
7. Select **Publish and create link**.
8. Copy the resulting link.
9. Open the link in a private browser window where the owner is not signed in.
10. Confirm that only the limited preview appears before authentication.
11. Create or sign in to a separate recipient account through the existing authentication form.
12. Confirm that authentication returns directly to the shared journey.
13. Confirm that the recipient can see the complete timeline but has no editing controls.
14. In the owner session, change one location or note.
15. Refresh the recipient session and confirm that the change appears on the same link.
16. In the owner session, select **Stop sharing**.
17. Refresh the recipient session and confirm that the journey no longer opens.

### Verify the photo boundary separately

1. In a disposable journey, prepare a selection that would take its total above 100 photos.
2. Select all of those photos at once.
3. Confirm that Triplog explains that the selection exceeds the safety limit.
4. Confirm that none of the newly selected files was added or uploaded.
5. Select a smaller set that keeps the total at or below 100 and confirm that it is accepted.

### Verify HEIC/HEIF rejection separately

1. Select one `.heic` or `.heif` file.
2. Confirm that Triplog rejects it before upload.
3. Confirm that the message explains that V1 supports JPEG, PNG, and WebP and asks the traveller to export the photo in one of those formats.
4. Confirm that no part of the rejected file is uploaded.

## 8. Teach-back

Phase 1 changes Triplog from a visually styled photo book into an evidence-led travel timeline. Photo metadata creates the first structure, uncertainty remains visible, and the traveller can correct that structure without losing the original uploads. The automated foundations pass, but the value of the result still needs the real-photo and two-account browser walkthrough above before the affected milestones can be accepted.

## 9. Phase 1 landing/authentication blocker repair

### Reported symptom

On `http://localhost:3000`, selecting **Sign in** produced no visible response. The authentication form did not open and no error appeared.

### Actual cause

The rendered landing HTML contained the Sign in button in its expected disabled authentication-loading state. The Phase 1 scoped CSS did not cover, hide, overlap, or disable the button or authentication dialog.

The production server had remained running while `next build` replaced the `.next` build output. The running `next start` process continued serving landing HTML that referenced an older JavaScript filename, while that file no longer existed in the newly generated `.next/static/chunks` directory. That JavaScript request returned HTTP 500. Because the browser could not load all of the page JavaScript, React did not hydrate the landing page, which means it never changed the loading-state button into an interactive button.

This was caused by the Phase 1 validation process running a production build beside an already-running production server. It was not caused by the Phase 1 shared CSS or by a landing/authentication component change.

### Repair

1. The stale `next start` process was stopped after confirming that port 3000 belonged to this workspace.
2. Tests, lint, type checking, and a production build were run with no production server using the `.next` folder.
3. `next start` was restarted after the build completed.
4. The landing page and all nine JavaScript files referenced by it were checked; every request returned HTTP 200.

No landing-page, authentication-form, authentication-provider, redirect, or sign-out component required a source change. Their appearance and design remain unchanged.

### Regression check added

- `scripts/check-server-assets.mjs` loads the landing page, extracts every referenced JavaScript URL, requests each file, and fails if the landing page or any JavaScript file does not return a successful response.
- `package.json` adds `npm run test:server-assets` to run that check.

The check passes with this result:

```text
Landing page and 9 referenced JavaScript files returned HTTP 200.
```

### Full validation after the repair

- `npm run test` — passed, 19 tests and 0 failures.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run test:server-assets` after restarting the server — passed.

The pre-existing Node module warning and the non-fatal build messages about `fs` and `zlib` remain unchanged.

### Still not verified by Codex

No browser was connected after the repair. The missing-JavaScript cause and its repair are verified at the HTTP level, but the following interactions could not be clicked by Codex:

- selecting **Sign in** and seeing the existing authentication dialog;
- submitting credentials for an existing user;
- entering the authenticated product after successful sign-in;
- signing out and returning to the landing page;
- selecting **Create your journey**, creating an account, and entering the authenticated product.

### Exact blocker verification steps

1. Refresh `http://localhost:3000` with a normal reload.
2. Select **Sign in** in the top-right corner.
3. Confirm that the existing authentication dialog opens and visually matches its previous design.
4. Enter the email and password for an existing account.
5. Select **Sign in** in the form.
6. Confirm that **Your journeys** opens inside the authenticated product.
7. Select **Sign out**.
8. Confirm that the browser returns to the unchanged landing page at `/`.
9. Select **Turn a trip into a book**, the existing Create your journey/signup action.
10. Confirm that the same existing authentication dialog opens in account-creation mode.
11. Enter a new disposable email address and a password of at least eight characters.
12. Select **Create account**.
13. Confirm that the new account enters **Your journeys**.
14. Sign out and confirm that the landing page opens again.

If either landing button is unresponsive again, run `npm run test:server-assets`. A failed JavaScript URL indicates that the active server and `.next` output do not match. Stop the server before building, then restart it only after `npm run build` finishes.

## 10. Phase 1 reconstruction-navigation blocker

### Reported symptom

A new Goa journey showed 6 photos and **Ready** on its card. **Continue journey** opened the photo-upload screen, **Continue reconstruction** returned to **Your journeys**, and repeating those actions never opened the reconstructed timeline.

### Stored Goa state

The Convex development data was inspected without changing it. The Goa journey contained:

- `photoCount: 6`;
- `processedPhotoCount: 6`;
- `processingStatus: ready`;
- 6 uploaded photo records;
- 6 completed upload records;
- 0 date records;
- 0 stop records;
- 0 moment records.

All six originals remain stored. Their metadata reports 20 January 2025, including usable GPS coordinates. The journey's entered dates are 20–26 January 2024, so all six photos were conservatively placed in **Possibly unrelated** rather than used to create timeline dates. This classification is expected when photo evidence falls a year outside the entered trip range. The defect was that navigation made the review queue unreachable.

### Routing cause

`components/trip-editor.tsx` previously opened `PhotoOnboarding` whenever `trip.momentCount === 0`, including when `trip.processingStatus === "ready"`. A ready journey with photos waiting for review therefore looked identical to a journey that still needed upload or reconstruction.

The upload and reconstruction callback also set `selectedId` to `null`, which deliberately returned the user to **Your journeys** immediately after queuing. The next card click encountered the same zero-moment condition and reopened upload, creating the loop.

### Repair

- Journey entry now uses an explicit state decision:
  - no photos, an error needing retry, or intentional photo management → photo screen;
  - queued or active reconstruction → processing status screen;
  - ready → timeline, even with zero visible moments;
  - compatible older data with moments but no processing status → timeline.
- Completing upload or starting a necessary reconstruction keeps the selected journey open.
- The active reconstruction screen updates from the existing reactive Convex query and changes to the timeline automatically when the journey becomes ready.
- **Continue reconstruction** is offered only when saved photos genuinely need it. It is not shown while intentionally managing photos in an already-ready journey.
- **Add or retry photos** remains a separate button inside the timeline workspace.
- No upload, photo, day, stop, or moment record was deleted or duplicated as part of this repair.

### Files changed

- `lib/trip.ts` — explicit journey-entry and reconstruction-retry state decisions.
- `lib/trip.test.ts` — complete navigation-state regression coverage.
- `components/trip-editor.tsx` — corrected routing, processing screen, and post-upload destination.
- `components/photo-onboarding.tsx` — conditionally offers reconstruction only when necessary.
- `app/globals.css` — scoped styling for the practical processing status screen.
- `PLAN.md`, `TEACH.md`, and this report — evidence and behaviour documentation.

The landing page and authentication components were not changed.

### Regression coverage

The added tests verify this sequence:

1. Six photos have completed upload and reconstruction is queued → processing screen.
2. Reconstruction becomes ready, including with zero visible moments → timeline.
3. The journey is closed and reopened while ready → timeline again.
4. The user explicitly selects photo management → photo screen.
5. Reconstruction retry is available for saved photos in error or selecting states.
6. Reconstruction retry is not offered for a ready journey or a journey with no saved photos.

### Manual verification for the existing Goa journey

1. Refresh `http://localhost:3000/book` and sign in if required.
2. On the Goa card, confirm it still reports 6 photos and **Ready**.
3. Select **Continue journey**.
4. Confirm that the timeline workspace opens instead of the photo-upload screen.
5. Confirm that the workspace reports 6 preserved photos and shows **Check these photos**.
6. Open **Possibly unrelated** and confirm that all six January 2025 photographs are present.
7. Confirm that none of those photos was uploaded again and the saved-photo count remains 6.
8. Select **Restore all** if these photos belong to this journey despite the entered 2024 dates.
9. Confirm that the reconstructed January 2025 date, GPS-backed stop or stops, and chronological moments appear.
10. Select **Your journeys**, then select **Continue journey** on Goa again.
11. Confirm that the timeline opens directly and the restored structure remains.
12. Refresh the browser while the timeline is open.
13. Confirm that the same timeline reopens without visiting photo upload.
14. Select **Add or retry photos**.
15. Confirm that this intentional action opens photo management and reports the six saved photos without selecting or uploading them again.
16. Select **Back to journey** and confirm that the timeline returns.

For a new journey, repeat an upload with matching entered dates and photo metadata. After upload, the app should show the reconstruction status briefly if processing is still active and then open the timeline automatically when the reactive Convex status becomes ready.

## 11. Phase 1 timeline-page blocker

### Verified Goa data

The development deployment was inspected before and after this repair. The Goa journey still has 6 photo records and 6 completed upload records. Every photo reports the same extracted date, 20 January 2025. The entered journey range remains 20–26 January 2024. All six photos remain `possibly_unrelated`, and the journey remains `ready` with 0 dates, 0 stops, and 0 moments. No photo, upload, journey date, or journey record was changed by this repair.

The six GPS points are close together: approximately 15.0553–15.0580 latitude and 73.9726–73.9738 longitude. If the owner confirms these photos, the current 600-metre evidence rule is expected to produce one GPS-backed stop unless later evidence supports another stop. Triplog does not invent extra locations.

### Runtime diagnosis

Convex logs contained no failed query or action for the journey open. An authenticated read of `trips:getOne` returned valid `days: []`, `stops: []`, `moments: []`, and a six-photo review queue. All six thumbnail URLs and their Next.js resized-image URLs returned HTTP 200. Rendering `JourneyWorkspace` against that exact zero-moment data shape completed without an exception.

The reported Next.js screen was its client-side global error screen, not a server error with an error identifier. The current server also returns HTTP 200 for `/book` and all of its JavaScript files. A connected browser was unavailable, so the original browser-console exception could not be recovered after the fact. The evidence rules out all six photos being in review, their dates being outside the entered range, empty collections, and the image files as direct crash causes. The remaining evidenced failure class is stale or mismatched client code in the browser/runtime, the same build-delivery risk found in the earlier authentication blocker. The server check previously covered only landing-page JavaScript; it now covers `/book` as well.

The application repair also removes unsafe assumptions at the workspace boundary: newer collections are normalised before the page reads or maps them. This makes empty and older stop-less results render safely even if a browser temporarily holds an older result shape.

### User-visible repair

- A Ready journey with visible moments renders its date → stop → moment timeline.
- A Ready journey with zero visible moments opens the workspace and shows a clear timeline review state.
- When photos are possibly unrelated or unplaced, **Check these photos** is visible and links to the open review group.
- Possibly unrelated copy states that the photo dates fall outside the entered journey dates and that the saved files remain stored.
- An older journey with moments but no stops shows the existing rebuild state without trying to render missing stop data.
- The photo classification rule is now a shared tested function; it still keeps reliable out-of-range dates in `possibly_unrelated` and missing dates in `unplaced`.
- The server asset check now verifies both `/` and `/book`, including every JavaScript file referenced by either page.

### Files changed for this blocker

- `components/journey-workspace.tsx`
- `lib/trip.ts`
- `lib/trip.test.ts`
- `convex/trips.ts`
- `app/globals.css`
- `scripts/check-server-assets.mjs`
- `SCOPE.md`
- `PLAN.md`
- `TEACH.md`
- `docs/Triplog_Phase_1_Report.md`

The protected landing page, authentication form, authentication actions, `/book` authentication gate, signed-out redirect, and sign-out handler were not changed.

### Regression coverage

The automated suite covers:

1. a Ready same-day journey with visible moments;
2. more than one GPS-backed stop on the same day;
3. a Ready journey with zero visible moments;
4. all photos waiting in Possibly unrelated;
5. photo metadata outside the entered journey range;
6. an older journey with moments but no stops;
7. Ready journey opening again after close/reopen or refresh;
8. a reliable date without GPS remaining under Location unknown;
9. nearby GPS photos staying in chronological order within one stop.

### Final validation results

- `npm run test` — passed, 25 tests and 0 failures.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed with Next.js 16.3.3. The existing non-fatal `Couldn't load fs` and `Couldn't load zlib` messages remain.
- `npx convex dev --once` — passed; functions are ready on `aware-rook-625`.
- `npm run test:server-assets` after restarting the built server — passed; `/`, `/book`, and all 12 referenced JavaScript files returned HTTP 200.
- Post-sync Goa data check — passed; 6 photo records, 6 completed upload records, and no changed journey dates.

### Exact manual verification for the existing Goa journey

1. Open `http://localhost:3000/book` and sign in with the account that owns Goa.
2. Refresh **Your journeys** once.
3. Confirm the Goa card still says **6 photos**, **Ready**, and **Continue journey**.
4. Select **Continue journey**.
5. Confirm the timeline workspace opens without the Next.js error page.
6. Confirm the header says Goa, 6 photos, 0 dates, and 0 stops.
7. Confirm the page explains that no photos are shown yet and displays **Check these photos**.
8. Confirm **Possibly unrelated** is already open and contains all six photo thumbnails dated 20 January 2025.
9. Confirm the entered journey range shown for Goa is still 20–26 January 2024.
10. If those six photos do belong to this journey, select **Restore all**. This is the one intentional data-changing step in the check.
11. Wait for the same saved files to be organised; do not select or upload the photos again.
12. Confirm one timeline day for 20 January 2025 appears, containing one or more GPS-backed stops only when the metadata supports them, with moments in capture-time order.
13. Select **Your journeys**, reopen Goa, and confirm the timeline opens directly.
14. Refresh the browser while Goa is open and confirm the same timeline returns.
15. Select **Add or retry photos** only to inspect the upload state. Confirm it reports 6 saved, 0 unfinished, and 0 failed, then return without selecting files.

### Not verified by Codex

No in-app or external browser was connected, so Codex could not click the repaired Goa journey, read the original browser-console exception, or perform the owner-controlled **Restore all** step. The database, query shape, isolated component render, image delivery, server files, automated tests, type checking, lint, and production build were verified directly. Final visual and interactive confirmation remains the manual test above.

## 12. Phase 1 trip-detail correction blocker

### Root cause

The Goa journey's saved dates were 20–26 January 2024 while all six photos had reliable metadata for 20 January 2025. Classifying those photos as possibly unrelated was correct. The product defect was that the journey-card menu exposed only **Rename** and **Delete**, so the owner could not correct the mistaken destination or date range after creation.

The stale processing state had a separate, exact cause. The review workspace's restore path called the day, moment, and place rebuild operations directly. The moment rebuild intentionally changed the trip to `shaping`; the page path ended after place resolution and never called the final processing operation that writes `ready` or `error`. The development logs confirm that exact sequence for the owner's restore: `setPhotoReviewState` → `rebuildDays` → `rebuildMoments` → `resolvePlaces`, with no finishing operation afterward. The normal background pipeline did call that final operation. The two reconstruction entry paths had drifted apart, which left Goa indefinitely in `shaping` after the manual restore attempt.

### What changed

- The journey card's three-dot menu now includes **Edit trip details**.
- Its inline form shows the currently saved destination and date range and pre-fills destination, start date, and end date.
- The owner must choose **Save and reconstruct** or **Cancel**. Cancel closes the form without a Convex write.
- Browser and Convex validation reject missing values and an end date before the start date.
- Saving updates only the owner-approved trip details, reclassifies the existing photo records against the corrected date range, clears the stale status by setting it to `queued`, and schedules reconstruction from those records.
- Photo storage identifiers, upload records, original image bytes, and viewing copies are not replaced, removed, or recreated by the correction.
- Photos the owner had intentionally removed from the visible journey remain removed.
- The app keeps the corrected journey open. Its reactive status screen changes automatically to the timeline when Convex reports `ready`, or to a clear failure screen with **Retry reconstruction** when Convex reports `error`.
- Restore, manual date placement, and timeline rebuild now use that same background pipeline instead of a partial page-driven sequence.
- Reverse-geocoding requests have a ten-second timeout so a failed place lookup can reach the visible error state instead of waiting indefinitely.
- Reconstruction removes obsolete empty generated days after a corrected rebuild while preserving days that still contain a manually added memory.

### Files changed for this blocker

- `components/journeys-home.tsx`
- `components/trip-editor.tsx`
- `components/journey-workspace.tsx`
- `convex/trips.ts`
- `lib/trip.ts`
- `lib/trip.test.ts`
- `app/globals.css`
- `SCOPE.md`
- `PLAN.md`
- `TEACH.md`
- `docs/Triplog_Phase_1_Report.md`

No landing-page or authentication component was changed.

### Regression coverage

The automated checks cover editing and saving corrected dates, cancelling back to the saved values, rejecting an invalid date range, reclassifying existing photo IDs after a date correction, retaining an intentionally removed photo, reconstructing from saved photo records without an upload input, reopening a completed journey, and offering recovery for stale `shaping` and failed states.

### Assumptions

- A corrected range of 20–26 January 2025 is appropriate for the current Goa recovery because all six saved photos report 20 January 2025. Triplog will not apply this change automatically; the owner must save it.
- Re-evaluation applies to the current saved photo records. It does not create a new upload attempt or change image metadata.
- If the six nearby GPS points still represent one place under the existing evidence threshold, one suggested stop is correct. The product will not create extra stops without supporting metadata.

### Validation results

- `npm run test` — passed, 30 tests and 0 failures.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed with Next.js 16.3.3. The existing non-fatal `Couldn't load fs` and `Couldn't load zlib` build messages remain.
- `npx convex dev --once` — passed; the functions and schema are ready on development deployment `aware-rook-625`.
- `npm run test:server-assets` after restarting the production server — passed; `/`, `/book`, and all 12 referenced JavaScript files returned HTTP 200.
- Protected-source check — passed; the landing page, landing styles, authentication form/action, `/book` authentication gate, and signed-out redirect files have no working-tree changes. The existing sign-out handler still signs out and replaces the browser location with `/`.
- Read-only Goa audit after deployment — passed; the trip still has its owner-entered 20–26 January 2024 range and stale `shaping` status. It has 6 photo records, 6 completed upload records, 1 generated date, 1 stop, and 1 moment. One photo is currently included and five are possibly unrelated after the owner's earlier restore attempt. All six report 20 January 2025, and every photo still has an original plus thumbnail, display, and large-view storage identifier.

### Not verified by Codex

No browser is connected to this session, so Codex cannot operate the owner's signed-in Goa journey or claim the final visual and interactive flow has passed. The edit, save, automatic opening, refresh, and cancel interactions remain the manual test below. The protected landing and authentication files were not edited; their interactive behavior will also remain a user confirmation.

### Exact manual verification for the existing Goa journey

1. Open `http://localhost:3000/book` and sign in with the account that owns Goa.
2. Refresh **Your journeys** and confirm Goa still shows 6 photos.
3. Open Goa's three-dot menu and select **Edit trip details**.
4. Confirm the form shows the currently saved values: Goa and 20–26 January 2024.
5. Change the start date to 20 January 2025 and the end date to 26 January 2025. Leave the destination as Goa, or correct it deliberately if needed.
6. Before saving, temporarily set the end date before the start date and select **Save and reconstruct**. Confirm the form stays open and explains that the end date cannot be earlier.
7. Restore the valid 20–26 January 2025 range and select **Cancel**. Reopen **Edit trip details** and confirm the saved 2024 values are still present.
8. Enter the valid 20–26 January 2025 range again and select **Save and reconstruct** once.
9. Confirm the app opens the reconstruction status for Goa without asking for photo selection. Do not upload any files.
10. Confirm processing opens the timeline automatically when ready. If it fails, confirm the page says the six saved photos are safe and offers **Retry reconstruction**.
11. Confirm the timeline contains one date, 20 January 2025, with one or more GPS-backed stops only where the metadata supports them and photo moments in time order.
12. Select **Your journeys**, reopen Goa, and confirm it opens the timeline rather than photo upload.
13. Refresh the browser while Goa is open and confirm the same timeline returns.
14. Return to **Your journeys**, reopen **Edit trip details**, and confirm the saved values are Goa and 20–26 January 2025.
15. Select **Add or retry photos** only to inspect the upload state. Confirm it still reports 6 saved, 0 unfinished, and 0 failed. Return without choosing any files.
