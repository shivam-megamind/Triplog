# How this project works

## Milestone 1 — public landing page

The existing landing page was retained without a redesign or source change.

- `/` is the public introduction to Postcard.
- Its main actions let a new visitor create an account and a returning visitor sign in.
- Authenticated visitors can continue to `/book`.
- The page explains that Postcard reconstructs a journey from photos, keeps it private by default, and lets the traveller decide what to share.
- `app/page.tsx` contains the landing content.
- `app/landing.module.css` contains the landing-only responsive design.
- `public/images` contains only the example photographs used on the landing page; they are not connected to a user's private photos.

The landing page is separate from the private product. A failure in the private builder does not expose journey data through the landing page.

## Validation status

Milestone 1's automated checks pass. The existing saved desktop and mobile screenshots confirm the retained responsive layout. The later core-stabilization browser run opened the protected landing CTA and created an account without changing the landing source.

## Milestone 2 — authentication

The existing account and session flow was retained without a redesign or source change.

- A visitor opens Create account or Sign in from the landing page.
- `components/auth-form.tsx` sends the email, password, and selected flow to Convex Auth.
- After successful authentication, `components/landing-auth-action.tsx` returns the traveller to `/book` or to the shared journey that originally requested authentication.
- `app/book/page.tsx` shows the private product only to an authenticated visitor.
- `components/trip-editor.tsx` signs the traveller out and then replaces the current browser location with `/`, so a signed-out session returns to the landing page.
- The password must contain at least eight characters. Email verification and password reset are not part of this V1 flow.

The authentication interface is separate from journey ownership checks. Convex queries and changes still verify the signed-in user's identity before returning or changing private journey data.

## Milestone 2 validation status

The retained authentication files have no source differences. The core-stabilization Chromium run created a new account through the landing dialog and reached the private product. The full sign-out and sign-back-in loop remains a user confirmation.

### Phase 1 blocker repair

The Sign in and Create journey buttons were rendered in their normal disabled loading state, but the browser could not hydrate them because one JavaScript file referenced by the running server returned HTTP 500. The server had remained open while `next build` replaced its `.next` output, leaving the running process with an old in-memory asset list and a newly generated folder. Phase 1 CSS did not cover, hide, or disable the buttons.

The repair was operational: stop the old server, run a clean production build, and restart `next start` against that build. `npm run test:server-assets` checks both `/` and `/book` plus every JavaScript file they reference. No landing or authentication component was changed. A later Chromium run proved signup and the redirect into `/book`; sign-out and returning sign-in remain manual checks.

### Phase 1 reconstruction-navigation blocker

Journey navigation now follows the stored processing state rather than using the number of visible moments as a shortcut. A queued or actively processing journey shows a small reconstruction status screen and opens its timeline automatically when Convex changes it to ready. A ready journey opens the timeline even when it has zero moments, because that state may mean every preserved photo is waiting in **Possibly unrelated** or another review group.

The upload callback keeps the current journey selected instead of returning to **Your journeys**. **Add or retry photos** remains an explicit timeline action, and **Continue reconstruction** appears only when saved photos are in a state that genuinely needs reconstruction. The state-transition tests cover upload completion, active reconstruction, ready timeline opening, reopening, and intentional photo management.

### Phase 1 empty-timeline blocker

The Goa journey proves that **Ready** and “has visible timeline moments” are different facts. Its six photos all report 20 January 2025, while the entered journey dates are 20–26 January 2024. Postcard correctly keeps those photos in **Possibly unrelated**, so the saved journey can be Ready with zero dates, stops, or moments.

The timeline workspace now normalises missing collections from older or cached journey shapes before rendering. A Ready journey with no visible moments shows a clear review state and a direct **Check these photos** action. An older journey that has moments but no stop structure shows the existing rebuild action. Restoring a possibly unrelated photo uses the saved original and then rebuilds the date, stop, and moment structure; it does not upload another copy or change the entered journey dates.

### Phase 1 trip-detail correction blocker

The Goa analysis was correct: its photos say 20 January 2025 while its saved trip range says 20–26 January 2024. The missing capability was an owner-controlled way to repair the original trip details. **Edit trip details** now opens the three saved fields on the journey card. Nothing changes until **Save and reconstruct** is selected; **Cancel** makes no database change. Convex validates the range again, updates only the destination and dates, rechecks the six existing photo records, and queues reconstruction without touching their stored image files or upload records.

The earlier **Restore all** path became stuck because it ran the first reconstruction steps directly from the page. Those steps deliberately set the status to `shaping`, but that page path never called the final step that changes the status to `ready` or `error`. Restore, placement, rebuild, date correction, and retry now all enter the same Convex background pipeline. That pipeline always attempts the final status change, so a failure produces a visible error with **Retry reconstruction** instead of an endless loading state.

## Milestones 3–5 — journey library and safe draft creation

- Your Journeys now separates owned journeys, journeys shared with the account, and Recently Deleted items.
- Creating a draft requires a destination and approximate start and end dates. The browser catches missing or reversed dates, and Convex checks them again.
- A request ID makes a repeated Create tap return the same draft instead of making a duplicate.

## Milestones 6–10 — safe photo intake

- The picker accepts JPEG, PNG, and WebP photos only, rejects files above 50 MB, and rejects an entire selection if it would take the journey above the internal 100-photo safety limit.
- HEIC and HEIF are rejected with instructions to export as JPEG, PNG, or WebP. V1 does not add a conversion library.
- Each selected photo has a persistent Convex upload record. Completed photos are skipped on retry; interrupted or failed items can be reselected and matched without restarting successful items.
- For a new upload, Postcard reads the untouched device file first, then creates and stores one approximately 1600px WebP. The device original is never sent to Convex. Older photos still use their original, thumbnail, display, and large files without migration.
- Capture time, GPS, dimensions, duplicate fingerprints, visual fingerprints, and a conservative dark/blurry signal are stored as evidence. GPS coordinates are converted to cached OpenStreetMap place names.

## Milestones 11–17 — reconstruction and review

- Convex background work orders included photos into dates, multiple place-based stops within each date, and chronological moments. Stops use available GPS evidence; photos with a reliable date but no GPS stay on that date under **Location unknown**.
- The stop sequence is a sequence of photo-backed places, never a claim about the exact path travelled. Postcard does not invent a location when the evidence is missing.
- Photos clearly outside the entered dates are retained under Possibly unrelated. Photos without a reliable date remain under Unplaced memories. The traveller can restore or place them.
- Dark or blurry photos are labelled but kept. A traveller-selected primary photo overrides the system suggestion.
- The journey has automatic, usable, and enriched completion levels. Title and cover suggestions require explicit confirmation.
- Processing can continue after the browser closes. When it becomes ready, Convex calls Resend once and includes a direct link to that journey. A stored sent time plus Resend's idempotency key prevents duplicates; failed calls retry at most three times.

## Milestones 18–21 — guided builder and timeline experience

- A suggested stop name can be corrected, and a moment can move between existing dates or stops. Those user choices are stored and retained during later reconstruction.
- Moments can be hidden from the timeline without deleting their saved photo file.
- Contextual enrichment is optional and collapsed until requested. Memory, useful detail, recommendation, and warning use explicit Save and Cancel; unphotographed memories can be added to the relevant stop.
- The owner and recipient views use a clear mobile-first timeline of dates, stops, moments, selected photos, memories, recommendations, and warnings. They do not use a coffee-table-book, magazine, or PDF layout.
- Recipient preview excludes Possibly unrelated and Unplaced photos. A generated title is ready to publish without manual confirmation; an empty generated value becomes `My Journey`. The destination, dates, main photo, and at least one recipient preview keep their existing checks, and the title remains optional to edit.

## Milestones 22–27 — account-gated sharing and recovery

- A signed-out person with an active unlisted link sees only the creator name, destination, cover, and dates. The complete journey appears on that same link after account creation or sign-in.
- Recipient access is read-only and saved under Shared with me. Because both owner and recipient read the same Convex records, later owner edits appear in the existing link.
- Stop sharing revokes the link and removes every saved recipient-access record.
- Delete moves a journey to Recently Deleted, revokes sharing immediately, and keeps it recoverable for 30 days. Permanent deletion warns first and erases the one saved file for each new photo, every stored file for each legacy photo, content, upload records, links, and access. A daily Convex job clears expired items.

## Milestones 28–29 — normal journey size and persistence

- V1 is designed around approximately 10–100 selected photos. The internal 100-photo safety limit is not promoted as a product feature, and any selection that would exceed it is rejected in full.
- Upload records, processing state, corrections, ordering, memories, sharing state, and recipient access live in Convex rather than browser memory. Editable sections wait for an explicit save and show success only after Convex confirms it.
- A persistence audit in two separate backend sessions returned the same 10 journeys, 31 photos, 13 moments, 4 written memories, and 2 recipient-access records. The temporary audit function was then removed.
- A real 5–10-photo Phase 1 browser run, a prepared normal 10–100-photo check, and correction/share persistence checks remain required before the affected milestones can be accepted.

## Core Repair Phase 1 validation status

- The automated test suite has 25 passing checks. It covers the internal 100-photo boundary, multiple GPS-backed stops on one date, chronological moment ordering, the **Location unknown** result for a dated photo without GPS, ready-journey navigation after upload and reopening, zero-visible-moment review, out-of-range dates, and older stop-less data.
- Lint, TypeScript checking, and the production build pass.
- The protected landing, authentication, redirect, and `/book` route files have the same SHA-256 file hashes recorded before Phase 1. The sign-out handler still signs out and replaces the browser location with `/`.
- The later core-stabilization browser run verified a two-photo journey, note persistence after refresh and reopening, and 390px, 768px, and 1440px layouts. GPS-bearing input, forced save failure, normal 10–100-photo scale, and the two-account shared journey still need hands-on verification.

## Resend environments

- Development defaults to `Postcard <onboarding@resend.dev>` and `delivered+trip-ready@resend.dev`. The real account email is not contacted in testing mode.
- Production must have `RESEND_API_KEY`, `RESEND_TEST_MODE=false`, `RESEND_FROM_EMAIL` set to a sender on a verified domain, and `SITE_URL` set to the deployed website origin in the production Convex deployment.
- No Resend secret is stored in the repository or sent to the browser.

## Core stabilization and travel workspace

The authenticated product now behaves like a journey browser first and an editor only when asked.

- The sticky top bar always gives the owner a route back to **Your journeys**, plus **Add photos** and **Preview and share**. Preview keeps its navigation state outside the live journey record, so a Convex refresh cannot throw the user back unexpectedly.
- Additional uploads compare a selected file with completed upload records before reserving it. A recent reconstruction on another journey still blocks a competing upload, but a record older than 15 minutes is treated as stalled and changed to a retryable error.
- Notes no longer wait on a short browser timer. The draft remains in the form until Convex confirms it, then the editor closes and the saved text is shown. A failed request leaves the draft present and changes the action to **Retry**.
- Manual memories carry a request identifier. Repeating the same request returns the existing record instead of adding a second memory.
- The route overview plots only stops that have photo GPS. Its dotted connection is labelled an approximate sequence. When no GPS exists, the interface says so and keeps the dated timeline prominent.
- One-photo moments need an explicit child height because Next Image uses an absolutely positioned image for `fill`. Without that height, the image can download correctly but paint into a zero-height box.

The browser regression creates a private test journey, uploads two real JPEG files, saves all four enrichment fields, refreshes and reopens, checks duplicate upload prevention and preview navigation, then records desktop, tablet, and mobile screenshots. It does not prove a forced network failure, a GPS-bearing upload, or the full two-account share flow.

## Mobile photo intake and safe areas

The earlier upload queue looked limited because it used three photo workers, but each worker decoded the same full-size image for metadata and viewing copies, created three canvases together, and started four storage transfers together. On a phone that multiplied memory, processor, network, and stored-file use before the screen could keep up.

The repaired flow paints the selected count as soon as the iOS picker returns. It then reads metadata and fingerprints from the original, prepares one approximately 1600px WebP at a time, lets at most two photos move through the wider queue, and permits only two storage file bodies at once. Each card still reaches Saved or Failed independently, the batch reports `Uploading X of N`, and a failed filename keeps its own Retry button.

JPEG, PNG, and WebP remain the dependable formats. Safari can natively decode HEIC and HEIF on supported iPhones, so those files now enter the same pipeline without a new conversion package. A browser that cannot decode one leaves that file visible with instructions to export it as JPEG, PNG, or WebP.

The app now requests `viewport-fit=cover`, which lets CSS see an iPhone's notch and home-indicator spaces. The journey and upload headers add those safe-area measurements to their existing padding. Journey-library tabs keep their full labels and scroll inside their own row on narrow screens instead of shrinking into one another.

The final automated run has 36 passing unit checks, plus passing lint, TypeScript, and production build checks. The production Chromium flow confirmed the journey library at 320, 360, 375, 390, 414, and 430 pixels, confirmed an 18-photo selection at 390 pixels, and rechecked the timeline at every mobile width plus 768 and 1440 pixels. A physical iPhone upload and a real HEIC/HEIF file still need device confirmation because desktop Chromium cannot reproduce iOS memory limits or Apple's safe-area values.

To run that check locally, start `npm run dev -- -p 3001` in one terminal. In a second terminal run `npm run test:e2e`. The test uses the Playwright browser package already installed in this project and writes its screenshots under `.validation/core-stabilization`.

## Single-image photo storage

`storageLayout: "single_optimized_v1"` tells the app that a photo has one durable image. If that field is missing, the photo is legacy, so its original, thumbnail, display, and large identifiers continue to work exactly as before.

For each new selection, the browser finishes EXIF date/GPS reading, exact hashing, and visual fingerprinting against the original file before conversion begins. Native browser decoding also applies the photo orientation when drawing the WebP. HEIC and HEIF follow this same path only when the browser can decode them; otherwise the item fails before any file upload and tells the traveller to export it as JPEG, PNG, or WebP.

Convex checks that the durable upload really is a non-empty WebP before it creates the photo record. If the final record request has an uncertain result, a reconciliation request either confirms the record or removes the unattached file. A small Convex file endpoint reads the saved Blob by its storage identifier; new photos use their one identifier for every display role, while legacy photos still use their separate original, thumbnail, display, and large identifiers. Next.js is allowed to resize Convex's region-qualified image hosts for cards, timelines, maps, and shared journeys. Photo details show four copy links for legacy photos and one **Saved web image** link for new photos.
