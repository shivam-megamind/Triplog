# Triplog V1 Scoping Document

**Status:** Scope Gate — Build Week V1  
**Date:** 2 September 2026  
**Working name:** Triplog (temporary)

> **Core action:** Shivam uploads photos from one completed trip → receives an organised, editable reconstruction grouped by date and place; after correcting and enriching it, he gets an interactive journey that he can relive and share through an account-gated link.

## 1. USER — Specific person

Shivam is 31 and has just returned from a trip to Japan. His phone contains 562 photos and videos from the trip, but he shared only 10 photos and 22 Instagram stories. Other reminders are scattered across his memory, location history, station stamps, tickets, souvenirs, food purchases, and objects brought home.

Shivam wants to enjoy travelling without maintaining a journal during the trip. He may install travel-journaling products such as Polarsteps or Day One, but he does not consistently update them because doing so competes with being present and digitally disconnected.

After returning, Shivam wants two connected outcomes:

- A meaningful way to reconstruct and relive his own journey.
- A complete journey he can share when somebody asks about the trip.

The initial recipient is a colleague or friend considering a similar trip. The recipient is willing to create an account to view a journey shared by someone they know.

## 2. PROBLEM — What is broken in their day

A few days after returning from Japan, Shivam is speaking with colleagues at work. A colleague planning a Japan trip asks about his route, favourite places, accommodation, transportation, food, and reasons for his recommendations.

Shivam answers from memory but jumps between different parts of the trip. He shares whatever comes to mind first, misses useful details, and cannot explain the experience in a clear sequence. The colleague receives scattered information instead of something they can confidently use. Shivam also realises that his account will become less complete six months later.

Today, he works around the problem by:

- Answering orally from memory.
- Scrolling through hundreds of photos to reconstruct fragments.
- Checking Google Timeline, even though it may show places he merely passed.
- Occasionally attempting a travel journal, then abandoning it because it requires work during the trip.

His gallery is complete as a collection of files but poor as a memory experience. It does not explain the sequence, route, importance, context, unphotographed moments, disappointments, warnings, or personal meaning of the trip.

The product fails if it simply moves the same sorting and journaling workload into a new interface.

## 3. WHAT V1 DOES — Full user flow, step by step

### Product boundary

V1 is a mobile-first website that can be saved to a phone's home screen. It is not a native mobile app. During Build Week, accounts can create unlimited free journeys. A normal journey is expected to contain approximately 10–100 selected photos. The product enforces 100 photos as an internal safety limit, has no fixed limit on travel days, may contain multiple cities or countries, and may be the only journey actively uploading or processing for that account at that moment.

V1 is photo-first. It does not process videos.

### A. Entry, authentication, and home

1. A visitor opens the landing page and can choose **Create your journey** or **Sign in**.
2. The visitor creates an account or signs in.
3. After authentication, the main screen is **Your Journeys**.
4. The screen contains the user's drafts and completed journeys, a **Shared with me** area, and a way to start a new journey.
5. Each owned journey provides clear actions to continue editing, rename, open, share, or delete it.
6. Signing out returns the user to the landing page.

### B. Create a journey and select photos

1. Shivam taps **Create journey**.
2. Before uploading, he provides only:
   - Destination or trip region.
   - Approximate start date.
   - Approximate end date.
3. Destination and dates are required. Empty fields are identified individually. An end date earlier than the start date is rejected with a clear explanation.
4. Shivam opens the phone's native photo picker and selects the 10–100 photos that best represent the trip.
5. He is not expected to pre-sort perfectly. The upload may contain screenshots, downloaded images, receipts, duplicates, low-quality images, or unrelated photographs.
6. If a selection would take the journey above the internal 100-photo safety limit, the entire selection is rejected before uploading begins. No partial selection is silently accepted.
7. JPEG, PNG, and WebP are supported. HEIC and HEIF are rejected in V1 with a clear explanation to export the photo in a supported format; V1 adds no conversion dependency.
8. Repeated taps on create or upload do not create duplicate trips or duplicate upload jobs.

### C. Upload safely

1. The website displays the total number selected, upload progress, completed items, and failed items.
2. Uploads are resumable. If the mobile browser interrupts an upload, completed items remain saved and unfinished items resume when Shivam returns.
3. Once uploading is complete, Shivam may leave while processing continues.
4. A small number of failed photos does not block the journey. Successful photos continue processing, failed items remain visible, and Shivam can retry only those items.
5. Original photos are stored without being overwritten.
6. Separate compressed versions are created for thumbnails, normal display, and larger viewing. The interactive journey loads an appropriate optimised version rather than repeatedly loading the full original.
7. The app never claims to replace Shivam's phone or cloud photo backup.

### D. Reconstruct the draft

After upload, the system:

1. Reads available capture date, time, GPS location, orientation, dimensions, and other useful file information.
2. Converts coordinates into understandable place names.
3. Orders photos chronologically into dates, multiple place-based stops within each date, and chronological moments within each stop.
4. Detects exact duplicates and groups visually similar photographs.
5. Suggests clearer representative photographs where several similar options exist.
6. Uses destination, dates, metadata, and visual evidence to separate likely trip photos from possibly unrelated items.
7. Suggests an ordered sequence of confirmed or likely stops. It does not invent a location or claim to know the exact road, rail, or walking route without supporting evidence.
8. Assigns confidence to inferred dates, locations, groupings, and route stops.
9. Produces an automatic first draft without requiring Shivam to answer journaling questions first.
10. Shows live processing status inside **Your Journeys**.
11. Sends one transactional email when the draft is ready. Browser push notifications are not required in V1.

The system may organise and suggest, but it cannot invent experiences, emotions, recommendations, warnings, or facts.

### E. Review uncertain and imperfect inputs

1. Photos believed to be unrelated are excluded from the main draft but retained under **Possibly unrelated**.
2. Shivam can restore one or several items from **Possibly unrelated**. Nothing is automatically deleted.
3. A photo with a reliable date but no usable GPS remains on that date in a clearly labelled **Location unknown** stop. A photo without a reliable date remains available for manual placement.
4. Uncertain placement is labelled clearly and requires confirmation.
5. Anything that cannot be placed appears under **Unplaced memories** and remains available.
6. Blurry, dark, or low-quality photos are never silently deleted or altered.
7. When similar alternatives exist, the clearest may be suggested as the representative.
8. If a low-quality photo is the only evidence of a meaningful moment, it remains available for inclusion.
9. The user can change a suggested location and move a moment between existing dates or stops. Those corrections remain authoritative during later saves or reconstruction.
10. User-confirmed information always takes priority over system suggestions.

### F. Build and enrich the journey

1. The upload, reconstruction review, and editing experience operate as one guided **Journey Builder**, not a collection of disconnected tools.
2. The system suggests the journey title and cover after processing. Shivam confirms or edits them through an explicit action.
3. The journey is organised by meaningful days, places, and moments. Calendar days with no photo or manually added memory do not need empty sections.
4. Each moment presents one primary image and a small curated selection of supporting images.
5. Additional images remain available through **View all from this moment**.
6. Shivam can replace the primary photo, promote another photo, restore an excluded photo, reorder moments, correct the route, or remove content from the journey view.
7. The product asks short, contextual questions beside the relevant moment or day to capture important unphotographed experiences.
8. Questions are optional and skippable. The journey is never blocked because every prompt was not answered.
9. Shivam can manually add, edit, reorder, or remove a memory.
10. Every correction and answer is saved continuously.
11. V1 aims to keep active review below approximately one to two minutes per travel day containing journey moments. Longer enrichment remains optional and can be resumed later.

The product recognises three completion levels:

- **Automatic draft:** Created after processing without required journaling.
- **Usable journey:** Major trip details and obvious reconstruction errors have been reviewed.
- **Enriched journey:** Shivam has optionally added deeper memories and unphotographed experiences.

### G. Experience the journey

1. Shivam opens a simple, mobile-first travel timeline organised by date, place-based stop, chronological moment, and selected photos.
2. The interface uses familiar cards, timeline markers, tabs, buttons, and editing controls with a clear practical hierarchy.
3. It does not imitate a coffee-table book, magazine, fixed book pages, page-turning, or a converted PDF.
4. The reconstructed result and uncertain evidence are visible immediately. Personal questions remain optional, contextual, and progressively revealed.
5. Shivam can move between the visual timeline and complete photo groups without making the main experience overwhelming.
6. The shared journey uses the same helpful visual-summary structure and remains private while it is a draft.

### H. Publish and share

Before sharing:

1. Destination, dates, title, and cover must be confirmed.
2. **Possibly unrelated** and **Unplaced memories** remain excluded unless Shivam restores or confirms them.
3. Shivam previews the recipient experience at least once.
4. He explicitly taps **Publish and create link**.

After publishing:

1. The system creates an unlisted, account-gated link.
2. The link is not publicly searchable or listed on a public profile.
3. Anyone possessing the link may open a limited preview showing Shivam, the destination, cover, and trip dates.
4. The recipient creates an account or signs in through a minimal authentication flow.
5. No profile photo, username, travel preferences, interests, or generic onboarding is required before viewing.
6. After authentication, the recipient returns directly to the shared journey.
7. The journey appears under the recipient's **Shared with me** area.
8. Recipients receive read-only access and cannot edit Shivam's journey.
9. Shivam may continue editing after sharing; saved changes appear in the existing shared journey.
10. If Shivam taps **Stop sharing**, the link is invalidated and all existing recipient access is removed. He may create a new link later.

### I. Delete and recover

1. Deleting a journey moves it into **Recently Deleted** rather than erasing it immediately.
2. Shared access is removed immediately when the journey is deleted.
3. Shivam may restore the journey for 30 days.
4. After 30 days, the original photos, optimised copies, journey content, and sharing permissions are permanently deleted.
5. Permanent deletion requires a clear warning.

## 4. WHAT V1 DOES NOT DO — Everything parked

V1 does not include:

- Native iOS or Android applications.
- Video upload, processing, editing, or playback.
- Google Photos or iCloud import.
- Google Timeline or continuous location-history import.
- Claims of reconstructing the exact path travelled between photographed stops.
- Voice answers or transcription.
- Browser push notifications.
- Automatic enhancement or alteration of original photos.
- AI-written memories, emotions, warnings, recommendations, visa advice, or generic travel narratives.
- A separate automatically condensed recommendation guide.
- Detailed categories for stays, restaurants, cafés, food, hidden gems, and warnings.
- Structured souvenir, ticket, or station-stamp capture.
- Importing bookings, confirmation emails, or the original itinerary.
- Planned-versus-visited comparison or missed-place recommendations.
- Visa application tracking, document management, or pre-trip task management.
- A dedicated dated visa-experience section.
- Password-protected links, expiring links, or different links for different audiences.
- Granular controls to hide individual sections for different recipients.
- Individual recipient-access management beyond stopping sharing for everyone.
- Public traveller profiles, public journey discovery, community destination pages, social feeds, likes, follows, or comments.
- Combining journeys from multiple travellers.
- AI itinerary generation or personalised trip planning.
- Affiliate booking links, attribution, creator earnings, commissions, or payouts.
- Pricing pages, journey limits, paid tiers, monthly plans, annual plans, checkout, billing, or payment processing during Build Week.
- Physical-book layout, ordering, payments, printing, delivery, replacements, or fulfilment.
- Social-media video generation.

These items remain written down so they are not casually reintroduced during V1 implementation.

## 5. RISKIEST ASSUMPTION — What could make this pointless

> **A journey automatically reconstructed from a messy bulk photo upload will be accurate and emotionally compelling enough that Shivam feels the result is worth the effort of uploading and reviewing it.**

This assumption contains the core value exchange. Shivam gives the product hundreds of personal photos and some review time. In return, the product must produce something substantially more meaningful and convenient than scrolling through his gallery.

The assumption fails if:

- Uploading from a phone is unreliable or exhausting.
- Filtering unrelated photos creates another sorting job.
- Suggested locations, moments, or representative photos are frequently wrong.
- Too many confirmations or questions are required.
- The output feels like a generic journal, dashboard, slideshow, or digital PDF.
- Shivam does not want to revisit or share the finished journey.

The V1 proof is not the number of features built. The proof is that a traveller can upload a real, messy trip collection, receive a recognisable draft, correct it within the intended effort budget, genuinely enjoy revisiting it, and successfully share it with another person.
