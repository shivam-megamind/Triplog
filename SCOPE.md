# Product scope

## The user and moment

A traveler has returned from one completed trip and is looking at an unorganized camera roll. They want to recover one meaningful day and place while the details are still available, without writing a traditional journal from scratch.

## Job and desired outcome

Turn a small set of personal photos and real memories into a private, saved, photography-led travel book that can be shared deliberately.

Current workarounds are leaving photos in the camera roll, posting a small selection on Instagram, or manually assembling notes and albums. This product’s advantage is reconstruction with the traveler in control: built from their photos and told in their voice.

The first proof of value is that one traveler completes and later returns to a saved chapter, or deliberately publishes its read-only link.

## Public landing page

The public homepage gives a recently returned traveller a 40-second explanation of Triplog. It shows four moments only: the private-book promise, automatic reconstruction from existing photos, preservation of personal details, and a read-only guide shared with a friend. Its single action, repeated twice, opens the private product at `/book`. It does not add a second product workflow or expose saved trip data.

## Milestone 1 boundary

- One account with multiple completed trips, one selected for editing at a time.
- Up to six image files.
- Triplog reads EXIF capture dates and GPS locally, orders photos chronologically, and groups them by capture day.
- For each day group, Triplog sends one representative GPS coordinate—and never the photo—to OpenStreetMap Nominatim to suggest a place name.
- Every returned place is cached by rounded coordinate so the same place is not requested twice.
- Manual date or place entry appears only when that metadata is missing; all suggestions remain editable.
- One authentic memory per reconstructed day.
- Editable trip names, a trip switcher, and a clear way to start another trip.
- Saved travel books with optional read-only public links.
- Email-and-password sign-in using the installed Convex Auth package. Email verification and password reset are not included in this local slice.

## Four layers

1. Interface: sign-in, trip setup, upload, correction fields, memory field, chapter preview, privacy control, public reading page.
2. Business logic: require ownership, cap uploads at six, validate required fields, keep private by default, publish only completed chapters.
3. Database: users, authentication records, trips, photo storage references, and share tokens persist in Convex.
4. Third-party services: Convex provides authentication, database, and image file storage. OpenStreetMap Nominatim receives one coordinate per day group and returns a place name; photos are never sent to it. Vercel can host the Next.js app later.

## External coordinate privacy

GPS coordinates can reveal where a traveler was. Triplog sends only one representative latitude/longitude pair per reconstructed day to OpenStreetMap Nominatim. It never sends the photo, memory, account, trip title, or traveler identity. The returned place name is cached in Convex so the same rounded coordinate is never looked up twice. The interface shows OpenStreetMap attribution.

## Not this week

Active-trip tracking, social features, collaboration, booking, itinerary planning, payments, printed books, PDFs, cloud-photo imports, continuous GPS, notifications, generated travel writing, multiple themes, advanced layout editing, and native mobile apps.
