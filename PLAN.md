# V1 build plan

## Sources

- Product scope: `docs/Triplog_V1_Scoping_Doc.md`
- Ordered milestones: `docs/Triplog_V1_Build_Plan.md`

## Delivery rule

The independent review reopened affected milestones. Core Repair Phase 1 is the only currently approved repair slice; stop for user review after its validation. No later milestone or repair phase compensates for an earlier broken one.

## Retained boundary

The landing page at `/`, the signup/sign-in interface, and the flow that returns a signed-out user to `/` stay unchanged unless the user approves a change first.

## Milestone tracker

Only milestones with accepted evidence are checked. The independent review reopened milestones 3–29; code that already exists is retained and verified during its approved repair phase rather than assumed complete.

- [x] 1. Landing page with Create your journey and Sign in — retained, validated, and approved.
- [ ] 2. Account creation, sign-in, sign-out, and return to landing — the stale-build asset blocker is repaired and the server-asset regression check passes; final live browser confirmation is reopened.
- [ ] 3. Your Journeys and Shared with me, including empty states.
- [ ] 4. Multiple free journey drafts with correct statuses.
- [ ] 5. Destination/date entry, validation, duplicate-tap protection, and owner correction after creation. The Phase 1 edit-and-reconstruct path is implemented; browser proof remains.
- [ ] 6. Photo selection with supported-format checks, conditional browser-native HEIC/HEIF handling, and full rejection above the internal 100-photo safety limit. Automated checks cover format and video rejection; real iPhone proof remains.
- [ ] 7. Original upload with per-file and overall progress. The mobile repair adds immediate selection confirmation, bounded preparation/transfers, `Uploading X of N`, and filename-specific retry; a real interrupted iPhone upload remains open.
- [ ] 8. Resume unfinished work and retry only failed photos. The stabilization browser run proves that adding one new file preserves the first file, returns to the updated timeline, and rejects reselection of the saved file; a forced network-failure browser run remains open.
- [ ] 9. Preserved original plus thumbnail, display, and large copies.
- [ ] 10. Visible date, time, GPS, and readable place evidence. Phase 1 implementation exists; real-photo browser proof remains.
- [ ] 11. Automatic dates, multiple stops per date, chronological moments, and evidence-based stop sequence. Unit checks pass; real-photo browser proof remains.
- [ ] 12. Duplicate/similar groups, representative suggestion, and View all.
- [ ] 13. Possibly unrelated review and restore. Ready journeys with zero visible moments now open a safe review state, and corrected trip dates reclassify the same saved photo records; browser proof remains.
- [ ] 14. Location unknown handling plus location and moment-placement correction. Phase 1 implementation exists; persistence needs browser proof.
- [ ] 15. Low-quality-photo retention and representative override.
- [ ] 16. Persistent processing status and one idempotent Resend journey-ready email. All reconstruction entry points now use the finish-or-error background path and expose retry; development delivery has evidence, while browser proof remains.
- [ ] 17. Automatic draft with confirmed title and cover.
- [ ] 18. Move moments between existing dates/stops and preserve originals when hidden. Phase 1 implementation exists; browser proof remains. Other reviewed controls are deferred.
- [ ] 19. Optional memories, useful details, recommendations, warnings, and unphotographed memories with explicit Save and Cancel. The core browser run proves four-field save, double-click protection, clean read state, and refresh/reopen persistence; forced server-failure recovery remains a manual check.
- [ ] 20. Practical mobile-first chronological travel timeline for owner and recipient. The redesigned owner workspace has Chromium layout coverage at 320px, 360px, 375px, 390px, 414px, 430px, 768px, and 1440px; physical iPhone safe-area confirmation remains open.
- [ ] 21. Recipient preview and publish-readiness checks. Timeline → preview → timeline passed in Chromium; the complete two-account publishing flow remains outside this milestone.
- [ ] 22. Unlisted link with limited signed-out preview.
- [ ] 23. Recipient authentication returning to the shared journey.
- [ ] 24. Shared with me reopening and read-only enforcement.
- [ ] 25. Owner edits visible in the existing shared journey.
- [ ] 26. Stop sharing revokes link and recipient access.
- [ ] 27. Recently Deleted, 30-day restore, and warned permanent deletion.
- [ ] 28. Validate a prepared normal 10–100-photo journey and full rejection when a selection would exceed 100.
- [ ] 29. Convex persistence and explicit confirmed saves. Memory, useful detail, recommendation, and warning survived refresh and reopening in Chromium; the broader two-session persistence audit remains open.

## Validation required after every milestone

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Relevant mobile and desktop browser checks
- Confirm the landing, authentication, and sign-out behavior remain unchanged

## Current architecture decisions

- Next.js and React provide the website.
- Convex provides authentication, database records, and photo storage.
- OpenStreetMap Nominatim converts one representative coordinate per group into a place name; photos are never sent to it.
- V1 uses Convex for upload recovery. Completed photos stay saved; failed or unfinished photos are retried or reselected individually. No separate resumable-upload service will be added.
- Browser photo preparation runs one item at a time, at most two photos move through the outer queue, and at most two storage bodies transfer at once. This bounds iPhone memory and network use without changing Convex storage.
- Convex background jobs reconstruct a journey after upload, so the browser does not need to remain open.
- Resend sends the one journey-ready email from the Convex background job. Development defaults to Resend's safe delivered test address; production delivery requires explicit sender settings.
- Existing recovery behavior remains; Phase 1 adds no complex deletion infrastructure solely for unusually large journeys.
- No system-generated traveller memories, opinions, warnings, or recommendations.
- No new dependencies without approval.

## Decision log

- 2026-08-31: Use Next.js and Convex, deployable to Vercel.
- 2026-08-31: Keep trips private until the owner explicitly publishes.
- 2026-08-31: Use installed email-and-password Convex Auth for the current authentication flow.
- 2026-08-31: Use OpenStreetMap Nominatim with rounded-coordinate caching, visible attribution, and no photo transfer.
- 2026-09-01: Freeze the completed landing page and retain the existing authentication and sign-out flow.
- 2026-09-02: Replace the proof-of-concept scope with the approved 29-milestone V1 scope.
- 2026-09-03: Keep uploads on Convex; preserve successful files and retry or reselect only failed or unfinished files.
- 2026-09-03: Use Resend's HTTP API for the journey-ready email, with the API key held only in Convex and an idempotency key preventing duplicates.
- 2026-09-03: Replace the coffee-table-book core direction with a practical chronological travel timeline.
- 2026-09-03: Assume 10–100 selected photos and enforce an internal 100-photo safety limit with full-selection rejection. Accept HEIC/HEIF only when the browser can decode it natively; otherwise show a per-file export message, without adding a conversion dependency.
- 2026-09-03: Limit Core Repair Phase 1 to reconstruction, necessary correction controls, original preservation, timeline UI, and share-flow compatibility.
- 2026-09-03: A ready journey always opens its timeline and review queue, even when all saved photos need review and no visible moments exist. Upload management remains an explicit separate action.
- 2026-09-03: Empty and older stop-less journey structures must render a clear review or rebuild state; the owner must never lose access to preserved photos because the visible timeline is empty.
- 2026-09-03: Trip details remain owner-controlled after creation. An explicit save reclassifies and reconstructs existing photo records; cancel performs no write, and failed or stale processing exposes retry.
- 2026-09-03: Replace delayed enrichment autosave with one consistent explicit Save/Cancel model so navigation cannot discard a queued local timer and success appears only after Convex confirms the write.
- 2026-09-03: Treat another journey's processing state as active for 15 minutes. Older processing records become recoverable errors instead of permanently blocking additional uploads.
- 2026-09-03: Use the existing Playwright browser package for the core regression run; add no dependency or map service. Render GPS-backed stops in a lightweight in-product geographic overview and show a refined dated-timeline fallback when GPS is absent.
- 2026-09-03: Bound mobile intake to one photo preparation task and two storage transfers at a time, expose immediate selection and batch progress, and use `viewport-fit=cover` plus safe-area CSS for iPhone chrome.
