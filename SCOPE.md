# Product scope

## Source of truth

- `docs/Triplog_V1_Scoping_Doc.md` defines the approved V1 product boundary.
- `docs/Triplog_V1_Build_Plan.md` defines the 29 ordered acceptance milestones.
- If older proof-of-concept behavior conflicts with either document, the approved V1 documents win.

## Core action

A signed-in traveller uploads selected photos from one completed trip and receives a recognisable, chronological, editable travel timeline grouped by date, multiple place-based stops, and moments. After correcting and optionally enriching it, the traveller can explicitly publish an unlisted, account-gated link.

## Retained application surfaces

The existing landing-page design, signup/sign-in interface, and sign-out-to-landing flow are retained. They must not be redesigned or rebuilt without the user's approval.
The user-facing product name is Postcard. Postcard is positioned as reconstructing a completed trip from the traveller's own photos into a useful, private, shareable journey—not as a travel book or future-trip planner. Existing internal Triplog identifiers, routes, deployments, and infrastructure names remain unchanged.

## V1 boundaries

- Mobile-first website that can be saved to a phone home screen; no native app.
- Photos only; no video processing.
- Unlimited free journeys during Build Week.
- Normal journeys contain approximately 10–100 selected photos. A 100-photo internal safety limit rejects an over-limit selection in full.
- JPEG, PNG, and WebP are supported. HEIC and HEIF are also accepted when the current browser can decode them; otherwise that file fails visibly with JPEG/PNG/WebP export guidance. No conversion dependency is added.
- For new uploads, Postcard reads evidence and duplicate fingerprints from the untouched source, then tries to upload one approximately 1600px WebP. If Safari cannot prepare WebP, JPEG, PNG, and WebP sources fall back to one untouched supported file; HEIC/HEIF still require successful browser-native conversion. Older four-file photos remain supported without migration, and every displayed role is served from its existing Convex storage identifier without rewriting stored data.
- Stored journey photos load directly from the existing Convex photo endpoint in the browser. They do not depend on the Next.js server fetching and re-encoding the file, so optimized WebP and original JPEG/PNG/WebP fallbacks use the same reliable display path while retaining one durable file.
- Reconstruction may organise evidence and make clearly labelled suggestions, but it must never invent memories, opinions, warnings, recommendations, or an exact travelled path.
- User-confirmed information always overrides a system suggestion.
- A reliable date without usable GPS stays on that date under **Location unknown**. The product never invents a place or exact travelled route.
- Owners can explicitly edit a journey's destination, start date, and end date from **Your journeys**. Saving corrected dates rechecks and reconstructs the already saved photos; cancelling changes nothing and no photo is uploaded again.
- A Ready journey with no visible moments opens a safe review state. Possibly unrelated or unplaced photos remain stored and the owner can reach **Check these photos** to confirm them.
- Core and shared screens use a practical mobile-first travel timeline, not a coffee-table-book, magazine, or PDF presentation.
- Trips remain private until an explicit publish action.
- Shared journeys are unlisted, require an account for full access, and are read-only for recipients.
- Deletion uses a 30-day recovery period before permanent removal.
- No dependency or external service is added without approval.
- Convex background jobs may continue reconstruction after the upload page is closed.
- Failed or stale reconstruction can be retried from the saved photos and must settle in either Ready or a visible error state.
- An existing journey can accept additional photos. The screen shows the saved count, accepts only new files, preserves existing saved images, identifies a failed filename, and retries that item without restarting successful uploads.
- Multi-photo intake confirms the returned selection before browser image work begins. Photo preparation is serialised and storage transfers use limited concurrency so a normal iPhone selection does not start every decode, canvas, or upload at once.
- An upload is described as unfinished only when its source file is no longer available on the current device page. A pending, preparing, fallback, uploading, or attaching photo with its selected source still present remains in the processing state; only a definite failure offers Retry.
- The picker recommends JPEG/JPG, PNG, and WebP, labels browser-native HEIC/HEIF support as beta, and identifies RAW/DNG as unsupported. A short trust note explains the one-copy storage model, private-by-default journeys, optional/revocable sharing, and the 30-day deletion window.
- The generated journey title is valid by default and can be edited before publishing. An explicitly saved main photo remains authoritative; if a fresh journey reaches publishing without one, the first included photo becomes the saved main photo as part of publishing. Trip details, stop names, memories, useful details, recommendations, and warnings keep their existing explicit save or cancel interactions.
- Authenticated owner and recipient screens share a warm, photo-led travel workspace with a compact journey header, an evidence-based stop overview, day navigation, and a responsive timeline. A stop sequence is labelled approximate and never presented as an exact travelled route.
- Resend sends one journey-ready email from Convex. Development uses Resend testing mode; production requires a verified sender domain and production deployment environment settings.

## Upload recovery decision

V1 continues to use Convex storage. Each successful new photo has one durable file: an optimized WebP when browser preparation succeeds, or one original JPEG/PNG/WebP fallback when it does not. Successfully uploaded photos remain saved; failed or unfinished photos can be retried or reselected without restarting successful uploads. If a file reaches storage but its photo record cannot be confirmed, Postcard reconciles the result and removes an unattached file when the server can be reached. V1 does not add a separate resumable-upload service and does not promise byte-by-byte continuation inside one interrupted file.

## Explicitly outside V1

The complete parked list remains in `docs/Triplog_V1_Scoping_Doc.md`. In particular, V1 excludes native apps, video, cloud-photo imports, continuous location history, generated travel writing, planning, visa tools, social features, payments, public discovery, affiliate systems, physical books, PDFs, and social-media video generation.
