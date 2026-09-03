# Triplog V1 Build Plan

**Source of truth:** Triplog V1 Scoping Document, 2 September 2026  
**Purpose:** Convert the approved scope into an ordered, testable Build Week plan.  
**Working name:** Triplog (temporary)

## 1. Feature sort

### MUST HAVE

These features are required to prove the core value: a traveller can upload a real trip, receive a useful reconstruction, correct it without excessive work, relive it, and share it with an authenticated recipient.

| Feature | One-line reason |
|---|---|
| Mobile-first responsive website | The source photos live primarily on the traveller's phone. |
| Save website to phone home screen | Provides convenient repeat access without building a native app. |
| Landing page with create and sign-in actions | Gives new and returning users a clear entry point. |
| Minimal account creation and sign-in | Journeys, uploads, edits, and recipient access must belong to persistent identities. |
| Sign-out returns to landing page | Prevents authenticated screens from becoming a dead end. |
| Your Journeys home | Gives users one place to start, resume, open, rename, share, or delete journeys. |
| Draft and completed journey states | Users must understand which journeys still need work. |
| Shared with me area | Authenticated recipients need a reliable way to reopen journeys shared with them. |
| Unlimited free journeys during Build Week | Testing repeat creation matters more than monetisation in V1. |
| Destination and approximate date entry | Gives the system enough context to filter a messy upload. |
| Required-field and invalid-date validation | Prevents empty or impossible trip records from entering the pipeline. |
| Native mobile photo picker | Lets users select photos directly from the device where they were captured. |
| Photos-only input | Keeps V1 processing bounded and avoids incomplete video support. |
| Normal 10–100-photo journey with an internal 100-photo safety limit | Keeps V1 focused on a useful selected trip set; a selection over the limit is rejected in full before upload. |
| Clear HEIC/HEIF rejection | V1 supports JPEG, PNG, and WebP without adding a conversion dependency. |
| No fixed travel-day limit | Long trips remain possible as long as they respect the photo boundary. |
| Multiple cities or countries per journey | A real trip such as Japan commonly contains several stops. |
| One active upload/processing job per account | Reduces processing conflicts and resource spikes. |
| Duplicate-tap protection | Prevents repeated taps from creating duplicate journeys, uploads, or links. |
| Upload progress | Users need to know whether a large mobile upload is advancing. |
| Recoverable interrupted uploads | Successful files remain saved while failed or unfinished files can be retried or reselected. |
| Partial-failure handling and individual retry | A few bad files must not invalidate the entire trip. |
| Preserve full-resolution originals | Protects source quality and permits later recuration. |
| Thumbnail, display, and large-view copies | Keeps the journey fast without repeatedly serving original files. |
| Metadata extraction | Date, time, and GPS evidence drive the initial reconstruction. |
| Coordinate-to-place conversion | Raw GPS coordinates must become understandable locations. |
| Chronological grouping by day and place | Converts a gallery dump into the basic shape of a journey. |
| Suggested ordered stops | Provides a useful route overview without claiming an exact travelled path. |
| Exact-duplicate and similar-photo grouping | Reduces repetitive review work. |
| Suggested representative photos | Creates a curated main experience while leaving the user in control. |
| Possibly unrelated group | Removes likely noise from the draft without deleting meaningful evidence. |
| Restore excluded photos individually or in bulk | Corrects filtering mistakes with minimal effort. |
| Unplaced memories group | Keeps trip photos with missing or unreliable metadata available. |
| Suggested placement with confidence | Reduces manual work while exposing uncertainty. |
| Low-quality photo handling | A blurry image may still be the only evidence of an important moment. |
| User confirmation overrides suggestions | The traveller, not the system, is authoritative about the trip. |
| Automatic first draft | The product must deliver value before asking the user to journal. |
| Live processing status | Users need to see whether reconstruction is queued, running, ready, or failed. |
| One journey-ready email | Lets users leave after upload and return when background processing finishes. |
| Guided Journey Builder | Keeps upload review, correction, and enrichment in one understandable workflow. |
| Suggested but editable title and cover | Reduces setup while preventing incorrect generated details from becoming permanent. |
| Curated moment plus View all | Balances a visually strong main story with access to the full collection. |
| Add, edit, reorder, and remove moments | Reconstruction errors and missing experiences must be correctable. |
| Replace and promote photos | Emotional importance cannot be decided reliably by automation. |
| Optional contextual questions | Captures unphotographed experiences without recreating mandatory journaling. |
| Skip questions and enrich later | A usable journey must not depend on completing every prompt. |
| Continuous autosave | Corrections and memories must survive accidental exits or interruptions. |
| Chronological travel timeline | The output must clearly show dates, place-based stops, moments, photos, and uncertainty without resembling a digital book or PDF. |
| Private draft state | Personal photos must not be shared before explicit publication. |
| Share-readiness validation | Destination, dates, title, cover, and recipient preview must be confirmed before publishing. |
| Publish and create account-gated link | Sharing is part of the approved core action. |
| Unlisted recipient preview | Gives recipients context without exposing the complete journey publicly. |
| Minimal recipient authentication | Supports distribution without forcing unrelated onboarding. |
| Return recipient to the exact journey | Prevents authentication from breaking the shared-link flow. |
| Read-only recipient journey | Protects the creator's content from recipient edits. |
| Save shared journey under Shared with me | Lets recipients reopen the experience after their first visit. |
| Stop sharing for everyone | Gives the creator a clear, privacy-safe way to revoke the link and existing access. |
| Recently Deleted with 30-day recovery | Protects irreplaceable journey content from accidental deletion. |
| Permanent deletion after warning | Gives users control over stored originals, derivatives, memories, and access records. |

### NICE TO HAVE

These can improve convenience or extend the approved experience after the complete MUST HAVE flow works reliably.

| Feature | One-line reason |
|---|---|
| Video upload and playback | Videos enrich memories but add a separate, expensive processing pipeline. |
| Google Photos or iCloud import | Reduces selection friction but requires additional platform integrations and permissions. |
| Google Timeline or location-history import | Could improve route evidence but introduces sensitive data and integration complexity. |
| Voice answers and transcription | Makes enrichment easier but is unnecessary for proving reconstruction. |
| Browser push notification | Feels more app-like, but email already covers the essential ready notification. |
| Separate non-destructive photo enhancement | May improve weak photos later, but originals and truthful presentation come first. |
| Condensed recommendation guide | Serves planners better but creates a second output before the personal journey is proven. |
| Recommendation categories | Structured stays, food, warnings, and hidden gems matter after the core memory experience works. |
| Structured souvenir, ticket, and stamp capture | Broadens the memory record but is not required to prove photo reconstruction. |
| Booking and original-itinerary import | Adds useful reconstruction evidence but requires external data ingestion. |
| Planned-versus-visited comparison | Depends on imported plans that are outside the first proof. |
| Missed-place recommendations | Extends into future planning rather than reconstructing what happened. |
| Dated personal visa-experience section | Useful first-hand context, but not central to reliving the journey. |
| Password-protected or expiring links | Adds sharing control after the basic gated link works. |
| Different links for different audiences | Adds complexity before one reliable sharing path is proven. |
| Granular section-level sharing controls | Useful for privacy but unnecessary for the first complete share flow. |
| Individual recipient access management | More precise than Stop sharing, but requires additional permission UI and logic. |
| Advanced map interactions and visual transitions | Can improve delight after the core viewer is fast, clear, and reliable. |

### NOT THIS WEEK

These features create a different product, business, or operational system and must not enter the Build Week implementation.

| Feature | One-line reason |
|---|---|
| Native iOS or Android applications | V1 is deliberately a mobile-first website. |
| Claiming an exact travelled route without continuous location data | Sparse photo locations cannot truthfully prove the path taken. |
| AI-invented memories, emotions, recommendations, warnings, or visa advice | The system is an organiser, not the author of the traveller's experience. |
| Generic AI travel narratives | Filler prose would undermine trust and create the AI-slop experience being avoided. |
| Full pre-trip planning | Changes the product from retrospective reconstruction into a planning tool. |
| Visa application tracking or document management | Adds sensitive administration without proving the core memory outcome. |
| Public traveller profiles | Introduces a social product before private reconstruction works. |
| Public journey discovery and community destination pages | Requires moderation, permissions, ranking, and enough public content. |
| Social feeds, likes, follows, and comments | Do not help prove the core upload-to-journey action. |
| Combining journeys from multiple travellers | Requires standardised, permissioned community data that does not yet exist. |
| AI-generated or personalised itineraries | Depends on the unproven community-data layer. |
| Affiliate booking links and attribution | Adds a marketplace and commercial tracking before product value is validated. |
| Creator earnings, commissions, and payouts | Requires financial, legal, fraud, and payout operations. |
| Pricing pages and journey limits | Build Week needs unrestricted testing rather than artificial conversion gates. |
| Monthly, annual, or per-journey payments | Monetisation is a later hypothesis, not part of V1 proof. |
| Physical-book design and ordering | Creates a separate print-commerce workflow. |
| Printing, delivery, replacements, and fulfilment | Introduces operational logistics outside the software proof. |
| Social-media video generation | Adds another output format unrelated to proving the interactive journey. |

## 2. V1 milestones

Every milestone must be independently demonstrable in roughly 10 seconds. The sequence builds from a visible shell to real photo reconstruction, then editing, sharing, recovery, scale, and final persistence verification.

| # | Milestone | Layer |
|---:|---|---|
| 1 | [ ] **I can open the mobile website and see a clear landing page with Create your journey and Sign in.** | Frontend |
| 2 | [ ] **I can create an account, sign in, sign out, and return to the landing page.** | Frontend / Backend / Database / Integration |
| 3 | [ ] **I can open Your Journeys and switch between my journeys and Shared with me, including useful empty states.** | Frontend / Backend / Database |
| 4 | [ ] **I can create multiple free journey drafts and see each one listed with its correct status.** | Frontend / Backend / Database |
| 5 | [ ] **I can enter a destination and dates, while empty fields, reversed dates, and repeated taps produce clear errors without duplicate drafts.** | Frontend / Backend / Database |
| 6 | [ ] **I can select photos from my phone, while videos, HEIC/HEIF, invalid files, and any selection that would take the journey above the internal 100-photo limit are rejected in full before upload.** | Frontend |
| 7 | [ ] **I can upload a small photo set and see per-file and overall progress while originals are stored safely.** | Frontend / Backend / Database / Integration |
| 8 | [ ] **I can interrupt an upload, reopen it, resume unfinished items, and retry only failed photos without restarting successful ones.** | Frontend / Backend / Database / Integration |
| 9 | [ ] **I can open an uploaded photo and see its original preserved alongside fast thumbnail, display, and large-view copies.** | Backend / Database / Integration |
| 10 | [ ] **I can see capture dates, times, GPS evidence, and readable place names extracted from real photos.** | Frontend / Backend / Database / Integration |
| 11 | [ ] **I can see photos automatically organised into dates, multiple place-based stops per date, and chronological moments, with dated photos lacking GPS under Location unknown.** | Frontend / Backend / Database / Integration |
| 12 | [ ] **I can see duplicate and similar photos grouped, with a suggested representative and View all from this moment.** | Frontend / Backend / Database |
| 13 | [ ] **I can review Possibly unrelated photos and restore one or several incorrectly excluded items.** | Frontend / Backend / Database |
| 14 | [ ] **I can correct a suggested location and move a moment between existing dates or stops, while a reliable date without GPS remains under Location unknown.** | Frontend / Backend / Database |
| 15 | [ ] **I can keep a blurry or dark photo when it is meaningful, replace a suggested representative, and confirm my choice overrides the system.** | Frontend / Backend / Database |
| 16 | [ ] **I can leave after upload, see queued/running/ready/failed status, and receive one email that opens the ready journey.** | Frontend / Backend / Database / Integration |
| 17 | [ ] **I can review an automatic first draft, edit the suggested title and cover, and explicitly confirm the correct values.** | Frontend / Backend / Database |
| 18 | [ ] **I can add, edit, reorder, move, or remove a moment and see the affected date and stop sequence update without deleting its original photos.** | Frontend / Backend / Database |
| 19 | [ ] **I can answer or skip a contextual question, add an unphotographed memory, and return to enrich it later.** | Frontend / Backend / Database |
| 20 | [ ] **I can explore a simple mobile travel timeline with dates, stops, chronological moments, selected photos, optional notes, and clearly identified uncertainty without a book-, magazine-, or PDF-style interface.** | Frontend / Backend / Database / Integration |
| 21 | [ ] **I can preview the recipient experience, see unresolved items excluded, and publish only after required trip details are confirmed.** | Frontend / Backend / Database |
| 22 | [ ] **I can copy an unlisted link, open its limited preview in a signed-out browser, and see that the full journey requires authentication.** | Frontend / Backend / Database |
| 23 | [ ] **I can create a recipient account from the link and land directly in the read-only journey without unrelated onboarding.** | Frontend / Backend / Database / Integration |
| 24 | [ ] **I can reopen that journey from Shared with me, and I cannot edit the creator's content.** | Frontend / Backend / Database |
| 25 | [ ] **I can edit a published journey as its owner and see the same saved change in the recipient view.** | Frontend / Backend / Database |
| 26 | [ ] **I can tap Stop sharing and verify that the link and every recipient's existing access stop working.** | Frontend / Backend / Database |
| 27 | [ ] **I can delete a journey, see recipient access disappear, restore it from Recently Deleted, and receive a warning before permanent deletion.** | Frontend / Backend / Database / Integration |
| 28 | [ ] **I can open a prepared normal-size journey of 10–100 selected photos and demonstrate that its main mobile views remain usable and responsive; a 101st-photo selection is rejected in full.** | Frontend / Backend / Database / Integration |
| 29 | [ ] **I can close the website during a draft, reopen it, and find my uploads, processing state, corrections, memories, journey order, sharing state, and recipient access intact.** | Frontend / Backend / Database / Integration |

The milestones should be implemented and accepted in order. A later milestone does not compensate for an earlier broken one, and no NICE TO HAVE or NOT THIS WEEK feature enters the build until Milestone 29 passes.
