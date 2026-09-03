I verified the full review against the current code, scope, milestone plan, tests, and Convex documentation. No code or project files were changed.

One review statement is outdated: Resend testing mode was subsequently tested successfully and returned delivery ID `01a063ed-f40a-73a9-b004-2f834751c8da`. Production email configuration remains unverified.

## Approved Core Repair Phase 1

Phase 1 is limited to the core upload-to-timeline outcome: dates, multiple place-based stops within each date, chronological moments, metadata-backed placement, a clear **Location unknown** stop, persistent location and moment-placement corrections, original-photo preservation, and compatibility with the existing share flow. Authenticated core screens and the shared journey use a practical mobile-first travel timeline rather than a coffee-table-book interface.

The working assumption is 10–100 selected photos. A 100-photo internal safety limit replaces the former large-collection requirement; a selection over that limit is rejected in full. JPEG, PNG, and WebP remain supported. HEIC and HEIF are clearly rejected in V1, with no conversion dependency. Pagination, scheduled deletion changes, and upload infrastructure justified only by unusually large journeys are no longer Phase 1 requirements.

Phase 1 currently has 33 passing unit checks. A later core-stabilization Chromium run also proves two-file additional upload, four-field note persistence after refresh and reopening, preview/back navigation, compact empty enrichment, rendered photos, and layouts at 390px, 768px, and 1440px. GPS-bearing browser input, forced network failure, normal 10–100-photo scale, and two-account sharing remain open and are not inferred from code alone.

## Finding verification

| Milestone | Current result |
|---:|---|
| 1 | CTA wording mismatch confirmed, but the landing page is protected and will remain unchanged. |
| 2 | Auth and sign-out code exist. Live account testing remains incomplete; double-submit protection is incomplete. This flow is protected. |
| 3 | Pass in code. |
| 4 | Defect confirmed: processing completion incorrectly displays as “Complete.” |
| 5 | Validation and duplicate prevention pass. Silent destination truncation is confirmed. |
| 6 | Revised Phase 1 requirement: a selection that would exceed 100 must be rejected in full; HEIC/HEIF must be rejected clearly rather than converted. |
| 7 | Per-file states exist, but per-file upload percentage does not. |
| 8 | Successful files are preserved. Restarting an interrupted individual file is allowed by the updated scope; file-key collision and orphan-storage risks remain. |
| 9 | Pass in code. |
| 10 | Defect confirmed: only one coordinate per day becomes a readable place. |
| 11 | Defect confirmed: no real place grouping or multi-stop route exists. |
| 12 | Grouping works, but representative selection always starts with the first photo. |
| 13 | Pass in code. |
| 14 | Defect confirmed: no nearby-evidence placement suggestion or location correction for unplaced photos. |
| 15 | Retention and manual representative choice work; quality is not used for the suggestion. |
| 16 | Development Resend delivery passes. Production sender, domain, and `SITE_URL` remain unverified. |
| 17 | Pass in code. |
| 18 | Defect confirmed: moments cannot move between days/stops, groups cannot be split or merged, and route order is not truly editable. |
| 19 | Defects confirmed: recent edits can be lost on close and text is silently truncated. |
| 20 | Present in code but not adequately tested on phones, desktop, or at scale. |
| 21 | Defects confirmed: removed content and stale days can satisfy publishing checks; destination and dates lack explicit confirmation. |
| 22 | Account-gated preview works in code, but the creator name normally falls back to a generic label. |
| 23 | Return-to-share logic exists but has not been tested through a real recipient signup. |
| 24 | Pass in code. |
| 25 | Reactive owner updates should reach recipients, but no two-account browser test exists. |
| 26 | Security defect confirmed. Convex file URLs remain usable after link revocation. |
| 27 | Recovery behavior exists. Large-collection deletion infrastructure is no longer required solely for out-of-scope photo volumes. |
| 28 | Revised milestone: validate a normal 10–100-photo journey and full rejection of a selection that would exceed 100. |
| 29 | Backend persistence is mostly present, but close/reopen testing is absent and recent text can be lost. |

The review is correct about direct file URLs: Convex says they remain reusable until the stored file is deleted. It recommends permission-checked HTTP actions when access changes over time. [Convex file-storage security model](https://docs.convex.dev/file-storage/overview)

Convex operation limits still inform defensive implementation, but V1 will not add pagination or deletion architecture solely to support photo volumes outside the revised 10–100-photo assumption. [Convex limits](https://docs.convex.dev/production/state/limits)

The original review found 15 passing unit tests. Phase 1 adds reconstruction and limit coverage; its current count and final command results must be recorded only after validation. The Node module warning and Git line-ending warnings remain. A local HTTP response is not a substitute for the missing browser journeys.

## Ordered repair plan

### BLOCKERS

| Order | Repair | Type | Milestones |
|---:|---|---|---:|
| 1 | Reject the entire selection when it would exceed the internal 100-photo safety limit; clearly reject HEIC/HEIF; add server file-type checks. The previously requested upload lock and byte-level progress remain outside Phase 1. | Functional | 6–8 |
| 2 | Replace retry identity with a content-backed identifier; record uploaded blobs as they arrive and clean abandoned blobs without touching successful photos. | Functional/data safety | 8–9, 29 |
| 3 | Rebuild reconstruction around dates, place-based stops, and chronological moments. Cluster GPS evidence into multiple stops, reverse-geocode each stop, assign confidence, put dated photos without GPS under Location unknown, and never claim an unsupported exact path. **Approved for Phase 1.** | Deeper product/UX | 10–11 |
| 4 | Use quality and resolution when suggesting representatives; use destination, dates, GPS, metadata, and visual similarity when identifying possibly unrelated photos. | Deeper product/UX | 12–15 |
| 5 | Phase 1 adds controls to change a suggested location and move a moment between existing dates or stops, with corrections retained during later reconstruction. Removing a visible moment must preserve every original upload. Splitting, merging, stop reordering, and single-photo removal remain later repair work. | Functional plus product/UX | 14, 18 |
| 6 | Remove stale empty days/stops and require visible recipient content plus explicit destination/date/title/cover confirmation before publishing. | Functional | 11, 18, 21 |
| 7 | Stop exposing reusable Convex URLs to recipients. Serve optimized sharing copies through permission-checked Convex HTTP routes; check the active link on every request and require authentication for full-journey images. Originals remain owner-only. | Privacy/security | 22, 26 |
| 8 | Reassess hydration and permanent-deletion batching against measured normal 10–100-photo journeys. Do not add complex pagination, scheduled deletion, or upload infrastructure solely for extreme photo counts. | Functional/performance | 20, 24–25, 27–28 |
| 9 | Add release browser coverage using the existing Playwright dependency: real 5–10-photo Phase 1 reconstruction, interruption, two accounts, sharing, revocation, owner updates, close/reopen, responsive layouts, a prepared 10–100-photo journey, and full rejection when a selection would exceed 100. | Validation | 2, 6–10, 16, 20, 22–29 |

### SHOULD-FIX

| Order | Repair | Type | Milestones |
|---:|---|---|---:|
| 1 | Show the real completion level—automatic draft, usable, or enriched—and add clear Open and Share actions to journey cards. | Product/UX | 3–4 |
| 2 | Make destination, title, place, date label, and memory limits visible. Prevent emoji splitting and make rename/confirmation rules consistent. | Functional/UX | 5, 17, 19 |
| 3 | Make saves close-safe using immediate local draft protection, save-on-blur/navigation, and server idempotency for manually added memories. | Functional/data safety | 19, 29 |
| 4 | Correct the Resend environment documentation and surface delivery failures. Production still needs `RESEND_TEST_MODE=false`, a verified `RESEND_FROM_EMAIL`, production `RESEND_API_KEY`, and the deployed `SITE_URL` in Convex. | Functional/operations | 16 |
| 5 | Show restore and permanent-delete failures; increase all core-product touch targets to at least 44px. | Functional/accessibility | 6, 12, 15, 18, 27 |
| 6 | Collect the creator name during share-readiness confirmation—not signup—so the limited preview can identify the traveller without changing authentication onboarding. | Product/UX | 21–22 |
| 7 | Correct `PLAN.md`, `SCOPE.md`, and `TEACH.md` after each repaired milestone so they report evidence rather than intended behavior. | Documentation | 1–29 |

The stale-day, unrelated-photo, representative-quality, retry-collision, and orphan-storage SHOULD-FIX findings are absorbed into the blocker work above because the core reconstruction and upload flow depend on them.

### NITs

1. Standardize core-product wording: “trip” for the real event and “journey” for the saved project. Remove book language from core-product and shared screens. Do not alter landing-page copy.

2. Replace `•••` with `…` and add wrapping for long titles and destinations in core screens.

3. Remove the Node module warning only after checking that the package setting does not disturb Next.js or Convex.

4. Normalize line-ending configuration without rewriting unrelated user changes.

## Protected findings

These findings are verified but deliberately excluded from the repair work:

- Milestone 1 CTA wording.
- Landing-page “Share the parts you want” copy.
- Authentication modal focus handling, Escape behavior, and focus return.
- Authentication form double-submit handling.

They touch the protected landing or authentication surfaces. I will not change them without separate permission. Sign-out-to-landing will remain unchanged throughout.

The HEIC/HEIF decision is resolved: V1 rejects those files with a clear explanation and adds no conversion dependency.

## Core stabilization pass — 3 September 2026

Completed in this repair slice:

- Removed the permanent cross-journey upload block caused by an abandoned processing status. Recent processing keeps a 15-minute lease; older records become retryable errors.
- Added saved-file duplicate checks on both the client and server, a saved-photo count, a short duplicate-index loading guard, filename-specific failed states, per-file Retry, and a same-event upload lock.
- Replaced delayed note autosave with explicit Save/Cancel, confirmed success, retained drafts on failure, Retry, and double-submit locks. Removed server-side silent shortening of traveller text and raised the visible limit to 20,000 characters per field.
- Made manual-memory creation repeat-safe with a stable request key.
- Added consistent authenticated back navigation, stable recipient-preview navigation, a compact journey header, photo-backed overview, day chips, photo-led responsive moments, contextual enrichment panels, and shared-view visual parity without owner controls.
- Removed repeated empty-note sentences and fixed the zero-height one-photo layout.

Evidence: 33 unit tests, lint, type checking, the Next.js production build, Convex validation on `aware-rook-625`, and the production JavaScript asset check pass. The real Chromium regression also passes at 1440px, 768px, and 390px.
