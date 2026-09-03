# Triplog V1 Review Report

## Verdict

Not ready to show yet.

The app compiles and its 15 unit tests pass, but several core promises—place reconstruction, upload limits, sharing revocation, and 1,000-photo scale—do not currently hold.

This review made no application-code changes.

Validation run:

- `npm run test` — pass, 15 tests
- `npm run lint` — pass
- `npm run typecheck` — pass
- `npm run build` — pass
- `git diff --check` — no whitespace errors; line-ending warnings were reported
- Live browser testing — unavailable because no browser was connected
- Automated browser tests — none found

There were no failed automated tests. The important limitation is test coverage: the existing 15 tests exercise pure validation and reconstruction helpers, not the complete browser, authentication, upload, sharing, deletion, or persistence flows.

Mobile/desktop and close/reopen behavior therefore remain unverified in a real browser. The responsive CSS looks considered, but that is not the same as testing it.

## Milestone results

“Code-pass” means the implementation appears sound from the code, but was not clicked through live.

| # | Result | Finding |
|---:|---|---|
| 1 | PARTIAL | Landing exists and is responsive in code. The required “Create your journey” action is called “Turn a trip into a book.” |
| 2 | UNVERIFIED | Account, sign-in, sign-out, and redirect code exists. No live authentication test. Rapid double-submit is not explicitly guarded. |
| 3 | CODE-PASS | My journeys, Shared with me, Recently Deleted, and useful empty states exist. |
| 4 | FAIL | Multiple drafts work, but a journey becomes “Complete” as soon as processing is ready—even before review or confirmation. |
| 5 | CODE-PASS | Empty destination/dates, reversed dates, and duplicate creation are checked. Long destinations are silently cut to 160 characters. |
| 6 | FAIL | Wrong types get an explanation. More than 1,000 files is not rejected as one selection; the first 1,000 remain uploadable. HEIC/HEIF photos are unsupported. |
| 7 | PARTIAL | Originals and three viewing copies are stored. Per-file status exists, but not per-file progress. No real upload was tested. |
| 8 | PARTIAL | Saved files survive and failed files can be reselected. Interrupted files restart from the beginning, and matching can confuse different files with identical name, size, and timestamp. |
| 9 | CODE-PASS | Owner can open original, thumbnail, display, and large copies. |
| 10 | FAIL | Time, GPS, dimensions, and quality are extracted, but readable place evidence uses only one GPS coordinate per day. |
| 11 | FAIL | Days and moments are built, but there is no real place grouping or multi-stop route. “Suggested stops” is effectively one stop per day. |
| 12 | PARTIAL | Exact/similar grouping and View all exist. The representative is always the first photo, not the clearest one. |
| 13 | CODE-PASS | Possibly unrelated items remain stored and support single or bulk restoration. |
| 14 | FAIL | Unplaced photos get a blank date field. There is no suggested placement from nearby photos and no location correction here. |
| 15 | PARTIAL | Dark/blurry photos remain available and the primary photo can be overridden. Quality is not used when making the original suggestion. |
| 16 | UNVERIFIED | Processing states and one-email logic exist. Email delivery and deployment settings were not verified. |
| 17 | CODE-PASS | Automatic draft, editable title/cover, and explicit confirmation exist. |
| 18 | FAIL | Moments can be added, edited, reordered, and removed. Reordering does not change the route, day, or grouping, and moments cannot be moved between days. |
| 19 | PARTIAL | Questions are optional and memories autosave. Closing within the 900ms save delay can lose the last edit; long text is silently cut. |
| 20 | UNVERIFIED | The journey is photography-led in code. Mobile appearance, speed, and interaction were not tested live. |
| 21 | FAIL | Recipient preview and exclusions exist. Publishing can count removed moments or stale days, allowing a visibly empty journey to pass server validation. Dates and destination have no explicit confirmation step. |
| 22 | PARTIAL | The unlisted, account-gated preview exists. The creator name will normally be “A Triplog traveller” because signup never collects a name. |
| 23 | UNVERIFIED | The same share URL should open after authentication. No live recipient-account test. |
| 24 | CODE-PASS | Shared journeys are saved for reopening, and server ownership checks prevent recipient edits. |
| 25 | CODE-PASS | Owner and recipient read the same saved journey, so later owner changes should appear. Not tested with two sessions. |
| 26 | FAIL | The share link and database access are revoked, but photo URLs previously received by a recipient remain usable. |
| 27 | PARTIAL | Delete, restore, warning, and scheduled purge exist. Permanent deletion of a 1,000-photo journey is implemented as one very large operation and is unlikely to fit platform limits. |
| 28 | FAIL | Only the grouping function was tested with 1,000 lightweight records. No 1,000-photo upload or browser proof exists, and the real query starts over 1,000 image-URL operations. |
| 29 | PARTIAL | Most state lives in Convex and should persist. The actual close/reopen flow is untested, and the most recent unsaved text can be lost. |

## BLOCKER — must fix before anyone sees it

1. **The core reconstruction is not grouped by place or real stops.** It takes the first GPS-bearing photo for each day and presents each day as one route stop. That does not meet Milestones 10–11 or the product’s core promise. See `convex/trips.ts:522` and `components/journey-workspace.tsx:391`.

2. **Users cannot correct every important suggestion.** They cannot split or merge photo groups, move a moment to another day/place, reorder route stops, or remove one photo from a grouped moment. Milestones 14 and 18 fail.

3. **Stop sharing does not fully stop access to photos.** The recipient receives direct Convex storage URLs. Convex documents that these URLs remain reusable until the file itself is deleted; revoking the app link does not revoke them. See `convex/trips.ts:1144` and the [Convex file-storage security model](https://docs.convex.dev/file-storage/overview).

4. **The 1,000-photo path is not viable as written.** Opening a journey starts thumbnail URL generation for every photo and another display URL for every representative photo. Deletion attempts up to four storage deletions per photo in one mutation. Convex allows 1,000 I/O operations per function and recommends batching large work. See `convex/trips.ts:55`, `convex/trips.ts:286`, [Convex limits](https://docs.convex.dev/production/state/limits), and [Convex bulk-write guidance](https://docs.convex.dev/database/writing-data).

5. **Publishing can approve an empty recipient journey.** The server counts database rows without excluding removed moments, while the client does not require a visible moment. See `lib/trip.ts:34` and `convex/trips.ts:1057`.

6. **Selections above 1,000 are partially accepted.** The loop keeps accepted files, stops at the limit, displays a warning, and leaves upload enabled. A traveller can think the whole selection is being handled when only part is. See `components/photo-onboarding.tsx:57`.

7. **Default iPhone photo formats are unsupported.** Only JPEG, PNG, and WebP are accepted; HEIC/HEIF is rejected. That is a serious gap for a mobile-first photo product. See `components/photo-onboarding.tsx:12`.

8. **There is no release-level browser evidence.** No end-to-end tests exist, and the connected browser was unavailable. Authentication, real uploads, responsive layout, sharing between two accounts, and close/reopen persistence cannot honestly be marked complete.

## SHOULD-FIX — works but poorly

- **Incorrect completion status:** raw automatic drafts are labelled Complete. `convex/trips.ts:128`

- **Home actions are incomplete:** cards expose rename/delete/continue, but not clear Open and Share actions required by the scope. `components/journeys-home.tsx:153`

- **Unrelated-photo detection is too weak:** it only checks whether the capture time is outside the entered dates. Destination, location, and visual evidence are not considered. `convex/trips.ts:464`

- **Representative selection ignores quality:** the first photo always wins, even when marked blurry or dark. `lib/reconstruction.ts:98`

- **Stale days are never removed:** `rebuildDays` tracks used days but does not delete unused ones after placement or exclusion changes. `convex/trips.ts:519`

- **Upload recovery can misidentify files:** the retry key is only filename, size, and last-modified time. `components/photo-onboarding.tsx:16`

- **Interrupted uploads can leave unused stored files:** closing after blob upload but before `addPhoto` records it leaves no cleanup path.

- **Long text is silently cut:** memories stop at 2,000 characters and titles at 160, without a counter or explanation. An emoji exactly across the cut is corrupted; this was reproduced locally. `convex/trips.ts:823`

- **Autosave is not close-safe:** changes wait 900ms before saving, with no flush when leaving the page. `components/journey-workspace.tsx:48`

- **Email configuration is easy to misconfigure:** `.env.example` documents `NEXT_PUBLIC_SITE_URL`, but the email code reads Convex’s `SITE_URL`; missing setup produces localhost links or three silent failures. `.env.example:1` and `convex/trips.ts:753`

- **Restore and permanent-delete failures have no user-facing error:** those handlers use `finally` without `catch`. `components/journeys-home.tsx:100`

- **Authentication modal accessibility is incomplete:** it has no Escape handling, focus trap, or focus return. `components/landing-auth-action.tsx:62`

- **Several touch targets are below 44px:** remove-photo and primary-photo actions are 32–36px high. `app/globals.css:209`

- **Landing copy promises unsupported sharing controls:** “Share the parts you want” conflicts with whole-journey-only sharing. `app/page.tsx:116`

- **Documentation overstates completion:** `PLAN.md` marks nearly everything complete even though browser testing was unavailable and several acceptance conditions are absent.

## NIT — cosmetic

- “Trip,” “journey,” and “book” are used interchangeably in navigation and actions.
- The action menu uses `•••` rather than the conventional `…`.
- Long unbroken titles and destinations have no explicit overflow wrapping.
- Node tests emit a module-type warning because `package.json` does not declare a module type.
- Git reports LF-to-CRLF warnings across the current working changes.

## Bad-input test summary

### Empty fields

- Journey destination, start date, and end date are individually validated.
- Whitespace-only destination is treated as empty.
- Rename and title-save paths reject or disable an empty title.
- Adding an unphotographed memory is disabled for empty or whitespace-only text.
- Authentication relies on native browser `required` validation; it was not tested interactively.

### Wrong file type

- The picker accepts only JPEG, PNG, and WebP MIME types.
- Other types receive a clear message saying videos are unsupported.
- HEIC/HEIF, common on iPhones, is also rejected.
- Server-side `beginUpload` validates file size but does not independently enforce the allowed MIME-type list.

### Double-click and repeated actions

- Journey creation uses a request ID on both client and server, so repeated creation returns the same draft.
- Publishing returns the existing active token rather than creating duplicate links.
- Upload records use a per-file key and `addPhoto` checks for an already-created photo, reducing duplicate records.
- The client state change is not a same-event-loop lock, so very fast repeated upload taps can still start redundant upload work before the button rerenders as disabled.
- Authentication submission has a busy state but no early `if (busy) return` guard.
- Adding an unphotographed memory has no server request ID, so a sufficiently fast repeated tap could create duplicate manual moments.

### Long text

- Destination is silently cut to 160 UTF-16 code units during creation.
- Confirmed title is silently cut to 160 UTF-16 code units.
- Memory, recommendation, warning, and detail fields are silently cut to 2,000 UTF-16 code units.
- The UI gives no maximum length, remaining-character count, or truncation warning.
- Home rename and the draft title editor can temporarily store longer titles through `updateTitle`, but later confirmation cuts them to 160, making behavior inconsistent.
- Day display date and place have no explicit length bound.
- Long unbroken titles and destinations may overflow because no `overflow-wrap` rule is present for those headings.

### Emoji

- Normal emoji input passes the validation and storage paths.
- Cutting at 160 or 2,000 UTF-16 code units can split an emoji into an invalid half-character.
- A local check reproduced this for both title and memory limits.

## Mobile versus desktop

The CSS includes responsive breakpoints at 900px and 600px for the private app, and mobile-first/min-width breakpoints for the landing page. The code addresses:

- One-column journey cards on smaller screens.
- One-column setup and authentication layouts.
- Full-width primary actions on phones.
- Scrollable navigation and library tabs.
- One-column moment and book layouts.
- Reduced photo-grid column counts.
- Reduced-motion preferences.

What could not be verified:

- Actual phone photo-picker behavior.
- iOS Safari and Android Chrome rendering.
- Keyboard opening over forms.
- Safe-area spacing around notches and home indicators.
- Real touch target comfort.
- Horizontal overflow with long text.
- Authentication modal focus and scrolling.
- 1,000-photo scrolling performance.
- Image memory use while hashing and resizing three large photos concurrently.
- Desktop layout at common widths.
- Whether the website produces a good home-screen icon and install experience on iOS and Android.

## Close tab and reopen

Code-backed persistence:

- Trips, photos, upload records, processing state, days, moments, corrections, memories, ordering, share state, and recipient-access records live in Convex rather than local browser memory.
- Completed uploaded photos should remain stored.
- Failed and unfinished upload records should remain visible.
- Processing is scheduled in the Convex backend and can continue without the tab.
- Shared-with-me access is stored in the backend.

Limitations and risks:

- No actual close-tab/reopen browser test was possible.
- Files cannot be retained by the browser; unfinished files must be selected again.
- The retry mechanism restarts an interrupted file instead of resuming its bytes.
- Text typed less than 900ms before closing may never reach the backend.
- A photo whose blobs finished uploading but whose database record was not created can become unused stored data.
- Email readiness depends on deployment environment settings that were not verified.

## Scoping-document error-case coverage

- **Required destination and dates:** implemented, with individual errors.
- **End date before start:** implemented and unit tested.
- **More than 1,000 photos:** server cap exists, but the browser partially accepts the first 1,000 instead of rejecting the whole selection.
- **Repeated create taps:** protected with an idempotent request ID.
- **Repeated upload taps:** database duplication is reduced, but redundant upload work can still start.
- **Upload progress:** overall completed count and per-file states exist; per-file byte/percentage progress does not.
- **Interrupted upload:** completed files remain; unfinished files require reselection and restart.
- **Partial failure:** successful files continue, failed records remain, and failed files can be reselected.
- **Retry only failed items:** supported through persisted upload keys, with collision risk.
- **Original preservation:** original plus three derivatives are stored.
- **Appropriate display copy:** thumbnail/display URL choice exists, though the 1,000-photo hydration strategy is unsafe.
- **Not a backup claim:** clearly stated in the upload interface.
- **Metadata extraction:** date/time, GPS, orientation, dimensions, hashes, and quality signal exist.
- **Readable place names:** one representative coordinate per day is reverse-geocoded; place-level or moment-level reconstruction is missing.
- **Chronological grouping:** implemented.
- **Grouping by places and moments:** moment grouping exists; place grouping does not.
- **Exact duplicates:** grouped by hash within a day.
- **Similar photos:** heuristically grouped.
- **Clear representative suggestion:** not implemented; the first photo wins.
- **Likely unrelated photos:** only date range is considered, not destination or visual evidence.
- **No exact-route claim:** the UI says suggested stops, but those stops are day labels rather than reconstructed stops.
- **Confidence:** stored and visible in photo evidence, but uncertain placement suggestions are missing.
- **Possibly unrelated retained:** implemented.
- **Single/bulk restore:** implemented.
- **Suggested placement from nearby evidence:** missing.
- **Unplaced memories:** implemented, with manual date only.
- **Low-quality photos retained:** implemented.
- **User corrects every title/date/location/group/route/representative:** title, display date, day place, and representative are editable; group and route correction are incomplete.
- **User confirmation overrides suggestions:** title, cover, representative, date placement, and manual place overrides are stored.
- **Automatic first draft:** implemented in a background action.
- **Live processing state:** implemented in the journey list.
- **One ready email:** idempotency code exists; actual delivery was not verified.
- **Guided builder:** implemented as one workspace.
- **Suggested title and cover:** location title suggestion and first included cover exist; cover quality is not considered.
- **Curated moment plus View all:** implemented.
- **Replace/promote photo:** primary-photo promotion exists.
- **Restore excluded photo:** implemented.
- **Reorder moments:** sort order changes, but route/day relationships do not.
- **Correct route:** missing.
- **Remove content:** whole moments can be hidden; individual-photo removal from a group is missing.
- **Optional contextual questions:** implemented.
- **Skip and enrich later:** implemented.
- **Manual memory:** implemented within an existing day.
- **Continuous save:** delayed autosave exists but is not close-safe.
- **Review-time target:** not measured.
- **Automatic/usable/enriched levels:** stored, but the journey-list status does not present them correctly.
- **Photography-led experience:** present in code, not visually verified.
- **Private draft:** ownership checks and unpublished defaults exist.
- **Destination/date/title/cover confirmation:** title and cover have explicit confirmation; destination and dates do not.
- **Unresolved items excluded:** reconstruction uses included photos, but stale day rows can remain.
- **Recipient preview:** exists and records the click before publishing.
- **Unlisted account-gated link:** implemented.
- **Limited signed-out preview:** implemented.
- **Creator identity in preview:** normally generic because no name is collected.
- **Return to exact journey after authentication:** implemented in the same share route, not live-tested.
- **Read-only recipient:** server mutation ownership checks and limited recipient payload support this.
- **Shared with me:** recorded after opening the shared journey.
- **Owner edits appear to recipient:** both read the same records, not live-tested.
- **Stop sharing:** app link and access records are revoked; previously issued direct photo URLs remain usable.
- **Recently Deleted:** implemented.
- **Immediate recipient removal on delete:** link/access revocation is implemented.
- **30-day restore:** implemented.
- **Permanent warning:** implemented through `window.confirm`.
- **Permanent deletion:** implemented as one oversized operation that is unsafe at 1,000-photo scale.
- **1,000-photo usable view:** not demonstrated and likely exceeds the current query design's I/O budget.
- **Full close/reopen persistence:** backend design supports most state, but no live proof exists and recent text can be lost.

## Automated-test limitation

The existing test file contains 15 tests covering:

- Publish-readiness helper logic.
- Recipient-preview requirement.
- Coordinate-cache keys.
- Local calendar date grouping.
- The numeric 1,000-photo limit helper.
- Empty journey details.
- Reversed dates.
- Exact duplicate grouping.
- Camera-burst grouping.
- Separate-stop grouping at the pure-function level.
- A 1,000-record reconstruction timing check.
- Undated selected order.
- Goa title suggestion.
- Manual-place title behavior.
- Preserving an intentional title.

It does not test:

- React components.
- Authentication.
- Convex ownership checks against real sessions.
- Real file selection.
- Wrong-type picker behavior.
- Real image decoding, EXIF, hashing, or resizing.
- Upload interruption or retries.
- Background processing.
- Nominatim responses and errors.
- Resend delivery.
- Sharing between two accounts.
- Stop-sharing behavior.
- Direct photo URL revocation.
- Recently Deleted and scheduled purge.
- 1,000 real photos.
- Mobile or desktop rendering.
- Close/reopen persistence.
- Double-click behavior in the browser.
- Long text and emoji through the full UI.

## Tool and environment limitations

- The in-app browser runtime reported that no browser was available.
- Browser troubleshooting confirmed that no browser types were connected.
- The review therefore did not use screenshots or claim live UI success.
- A fresh Next.js development server did start successfully on port 3001 because port 3000 was already occupied.
- The fresh server was stopped after the browser connection failed.
- The production build completed successfully and generated `/`, `/book`, `/manifest.webmanifest`, and `/share/[token]`.
- The build printed `Couldn't load fs` and `Couldn't load zlib` during static-page generation but still exited successfully.
- Convex deployment environment values were not inspected; email readiness and production `SITE_URL` remain unverified.
- The worktree was already dirty before this review. Existing changes were preserved.

## Plain-language teach-back

The shell, private data ownership, and basic editing model are promising. The biggest gap is that the current reconstruction mostly sorts photos by day—it does not yet produce the place-aware, correctable journey the plan promises.
