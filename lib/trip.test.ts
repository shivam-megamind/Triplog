import assert from "node:assert/strict";
import test from "node:test";
import { canAddPhotos, canRetryProcessing, chapterProblem, coordinateKey, dateInputTimestamp, enrichmentError, initialPhotoReviewState, isProcessingLeaseActive, journeyDetailsChanged, journeyDetailsErrors, journeyDetailsInput, journeyEntryView, localDateKey, manualMomentKey, MAX_ENRICHMENT_LENGTH, shouldOfferReconstructionRetry, timelineAvailability, tripDetailsReprocessingPlan } from "./trip.ts";
import { groupPhotosIntoMoments, groupedPhotoCount, reconstructTravelTimeline, visualHashDistance } from "./reconstruction.ts";
import { shouldOfferLocationSuggestion, suggestJourneyTitle } from "./title-suggestion.ts";
import { createTaskLimiter, photoFileError, photoFormat } from "./photo-upload.ts";

const fileDetails = (name: string, type: string, size = 1024) => ({ name, type, size });

test("photo intake accepts supported still-image formats, including iPhone HEIC", () => {
  assert.equal(photoFormat(fileDetails("coast.jpeg", "image/jpeg")), "jpeg");
  assert.equal(photoFormat(fileDetails("coast.png", "image/png")), "png");
  assert.equal(photoFormat(fileDetails("coast.webp", "image/webp")), "webp");
  assert.equal(photoFormat(fileDetails("IMG_1234.HEIC", "image/heic")), "heic");
  assert.equal(photoFormat(fileDetails("IMG_1234.HEIF", "")), "heif");
});

test("photo intake rejects videos, misleading extensions, and oversized images clearly", () => {
  assert.match(photoFileError(fileDetails("clip.mov", "video/quicktime")) ?? "", /video/i);
  assert.match(photoFileError(fileDetails("clip.jpg", "video/mp4")) ?? "", /video/i);
  assert.match(photoFileError(fileDetails("notes.jpg", "text/plain")) ?? "", /supported photo/i);
  assert.match(photoFileError(fileDetails("large.jpg", "image/jpeg", (50 * 1024 * 1024) + 1)) ?? "", /50 MB/i);
});

test("the task limiter never starts more than its configured number of jobs", async () => {
  const limit = createTaskLimiter(2);
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const jobs = Array.from({ length: 5 }, () => limit(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
  }));

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(active, 2);
  while (releases.length) {
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(jobs);
  assert.equal(peak, 2);
});

test("a confirmed reconstructed journey can be published", () => {
  assert.equal(chapterProblem({ destination: "Japan", startDate: 1, endDate: 2, title: "Kyoto", titleConfirmed: true, coverConfirmed: true, recipientPreviewedAt: 3, photoCount: 2, days: [{ displayDate: "14 October 2025", place: "Gion, Kyoto" }], moments: [{ memory: "", recommendation: "", warning: "", detail: "" }] }), null);
});

test("recipient preview is required before publishing", () => {
  assert.equal(chapterProblem({ destination: "Japan", startDate: 1, endDate: 2, title: "Kyoto", titleConfirmed: true, coverConfirmed: true, photoCount: 1, days: [{ displayDate: "", place: "" }], moments: [] }), "Preview the recipient experience before sharing.");
});

test("nearby coordinates share one cache key", () => {
  assert.equal(coordinateKey(35.00321, 135.77881), coordinateKey(35.00319, 135.77879));
});

test("capture dates group by the photo's local calendar day", () => {
  assert.equal(localDateKey(new Date(2025, 9, 14, 23, 45)), "2025-10-14");
});

test("photo additions are capped at one hundred", () => {
  assert.equal(canAddPhotos(99, 1), true);
  assert.equal(canAddPhotos(99, 2), false);
});

test("a completed reconstruction opens and reopens the timeline", () => {
  assert.equal(journeyEntryView({ photoCount: 6, processingStatus: "queued", managingPhotos: false }), "processing");
  assert.equal(journeyEntryView({ photoCount: 6, processingStatus: "ready", managingPhotos: false }), "timeline");
  assert.equal(journeyEntryView({ photoCount: 6, processingStatus: "ready", managingPhotos: false }), "timeline");
  assert.equal(journeyEntryView({ photoCount: 6, processingStatus: "ready", managingPhotos: true }), "photos");
});

test("a ready same-day journey with visible moments opens the timeline after refresh", () => {
  assert.equal(journeyEntryView({ photoCount: 6, momentCount: 3, processingStatus: "ready", managingPhotos: false }), "timeline");
  assert.equal(timelineAvailability({ visibleMomentCount: 3, reviewPhotoCount: 0, needsTimelineRebuild: false }), "visible");
  assert.equal(journeyEntryView({ photoCount: 6, momentCount: 3, processingStatus: "ready", managingPhotos: false }), "timeline");
});

test("a ready journey with zero visible moments renders an empty state", () => {
  assert.equal(timelineAvailability({ visibleMomentCount: 0, reviewPhotoCount: 0, needsTimelineRebuild: false }), "empty");
});

test("all possibly unrelated photos render the review state", () => {
  assert.equal(timelineAvailability({ visibleMomentCount: 0, reviewPhotoCount: 6, needsTimelineRebuild: false }), "needs_review");
});

test("photo dates outside the entered journey range require review", () => {
  assert.equal(initialPhotoReviewState({ capturedAt: Date.UTC(2025, 0, 20), hasDateMetadata: true, startDate: Date.UTC(2024, 0, 20), endDate: Date.UTC(2024, 0, 26) }), "possibly_unrelated");
});

test("missing capture dates stay unplaced", () => {
  assert.equal(initialPhotoReviewState({ hasDateMetadata: false, startDate: Date.UTC(2024, 0, 20), endDate: Date.UTC(2024, 0, 26) }), "unplaced");
});

test("legacy moments without stops request a safe rebuild state", () => {
  assert.equal(timelineAvailability({ visibleMomentCount: 0, reviewPhotoCount: 0, needsTimelineRebuild: true }), "needs_rebuild");
});

test("reconstruction retry is offered only when saved photos need it", () => {
  assert.equal(shouldOfferReconstructionRetry(6, "error"), true);
  assert.equal(shouldOfferReconstructionRetry(6, "selecting"), true);
  assert.equal(shouldOfferReconstructionRetry(6, "ready"), false);
  assert.equal(shouldOfferReconstructionRetry(0, "error"), false);
});

test("journey details identify each missing field", () => {
  assert.deepEqual(journeyDetailsErrors({ destination: "" }), {
    destination: "Add the destination or trip region.",
    startDate: "Add the approximate start date.",
    endDate: "Add the approximate end date.",
  });
});

test("journey details reject an end date before the start", () => {
  assert.deepEqual(journeyDetailsErrors({ destination: "Japan", startDate: 20, endDate: 10 }), {
    endDate: "The end date must be the same as or later than the start date.",
  });
});

test("editing and saving trip dates produces validated changed details", () => {
  const saved = { destination: "Goa", startDate: Date.UTC(2024, 0, 20, 6, 30), endDate: Date.UTC(2024, 0, 26, 6, 30) };
  const input = journeyDetailsInput(saved);
  const corrected = { ...input, startDate: "2025-01-20", endDate: "2025-01-26" };
  assert.equal(journeyDetailsChanged(saved, corrected), true);
  assert.deepEqual(journeyDetailsErrors({ destination: corrected.destination, startDate: dateInputTimestamp(corrected.startDate), endDate: dateInputTimestamp(corrected.endDate) }), {});
});

test("cancelling trip detail edits restores the unchanged saved values", () => {
  const saved = { destination: "Goa", startDate: new Date(2024, 0, 20, 12).getTime(), endDate: new Date(2024, 0, 26, 12).getTime() };
  const opened = journeyDetailsInput(saved);
  const edited = { ...opened, destination: "North Goa", startDate: "2025-01-20" };
  assert.notDeepEqual(edited, opened);
  assert.deepEqual(journeyDetailsInput(saved), opened);
});

test("corrected dates reclassify saved photos and queue reconstruction without upload input", () => {
  const capturedAt = new Date(2025, 0, 20, 14).getTime();
  const photos = [
    { id: "photo-1", capturedAt, hasDateMetadata: true, reviewState: "possibly_unrelated" as const },
    { id: "photo-2", capturedAt: capturedAt + 1_000, hasDateMetadata: true, reviewState: "possibly_unrelated" as const },
  ];
  const plan = tripDetailsReprocessingPlan(photos, new Date(2025, 0, 20, 12).getTime(), new Date(2025, 0, 26, 12).getTime());
  assert.equal(plan.processingStatus, "queued");
  assert.deepEqual(plan.photoReviews, [
    { id: "photo-1", reviewState: "included" },
    { id: "photo-2", reviewState: "included" },
  ]);
  assert.deepEqual(plan.photoReviews.map((photo) => photo.id), photos.map((photo) => photo.id));
});

test("removed photos stay removed when corrected dates are re-evaluated", () => {
  const plan = tripDetailsReprocessingPlan([
    { id: "removed", capturedAt: new Date(2025, 0, 20, 12).getTime(), hasDateMetadata: true, reviewState: "removed" },
  ], new Date(2025, 0, 20, 12).getTime(), new Date(2025, 0, 26, 12).getTime());
  assert.deepEqual(plan.photoReviews, [{ id: "removed", reviewState: "removed" }]);
});

test("stale shaping and failed processing states offer recovery", () => {
  assert.equal(canRetryProcessing("shaping"), true);
  assert.equal(canRetryProcessing("error"), true);
  assert.equal(canRetryProcessing("ready"), false);
  assert.equal(journeyEntryView({ photoCount: 6, processingStatus: "error", managingPhotos: false }), "error");
});

test("only a recently updated reconstruction blocks another photo upload", () => {
  const now = 1_000_000_000;
  assert.equal(isProcessingLeaseActive("shaping", now - 60_000, now), true);
  assert.equal(isProcessingLeaseActive("shaping", now - (16 * 60_000), now), false);
  assert.equal(isProcessingLeaseActive("ready", now, now), false);
});

test("enrichment text is rejected clearly instead of silently shortened", () => {
  const fields = { memory: "kept exactly", detail: "", recommendation: "", warning: "" };
  assert.equal(enrichmentError(fields), null);
  assert.equal(enrichmentError({ ...fields, memory: "x".repeat(MAX_ENRICHMENT_LENGTH + 1) }), "Memory must be 20,000 characters or fewer.");
});

test("manual-memory request identifiers produce a stable duplicate-prevention key", () => {
  assert.equal(manualMomentKey(" request-123 "), "manual:request-123");
  assert.equal(manualMomentKey("request-123"), manualMomentKey(" request-123 "));
});

test("exact duplicates stay stored inside one moment", () => {
  const moments = groupPhotosIntoMoments([
    { id: "a", order: 0, dateKey: "2025-10-14", capturedAt: 1000, exactHash: "same" },
    { id: "b", order: 1, dateKey: "2025-10-14", capturedAt: 900_000, exactHash: "same" },
  ]);
  assert.deepEqual(moments.map((moment) => moment.photoIds), [["a", "b"]]);
  assert.equal(groupedPhotoCount(moments), 1);
});

test("a short camera burst becomes one moment", () => {
  const moments = groupPhotosIntoMoments([
    { id: "a", order: 0, dateKey: "2025-10-14", capturedAt: 1000, width: 1600, height: 1200 },
    { id: "b", order: 1, dateKey: "2025-10-14", capturedAt: 7000, width: 1600, height: 1200 },
    { id: "c", order: 2, dateKey: "2025-10-14", capturedAt: 11_000, width: 1600, height: 1200 },
  ]);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].photoIds.length, 3);
});

test("separate stops stay separate moments", () => {
  const moments = groupPhotosIntoMoments([
    { id: "a", order: 0, dateKey: "2025-10-14", capturedAt: 1000, visualHash: "0".repeat(64) },
    { id: "b", order: 1, dateKey: "2025-10-14", capturedAt: 600_000, visualHash: "1".repeat(64) },
  ]);
  assert.equal(moments.length, 2);
  assert.equal(visualHashDistance("0".repeat(64), "1".repeat(64)), 64);
});

test("one date can contain multiple chronological GPS-backed stops", () => {
  const timeline = reconstructTravelTimeline([
    { id: "temple", order: 0, dateKey: "2026-04-01", capturedAt: 1_000, latitude: 35.003, longitude: 135.778 },
    { id: "cafe", order: 1, dateKey: "2026-04-01", capturedAt: 3_600_000, latitude: 35.011, longitude: 135.768 },
  ]);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].stops.length, 2);
  assert.deepEqual(timeline[0].stops.map((stop) => stop.photoIds), [["temple"], ["cafe"]]);
  assert.deepEqual(timeline[0].stops.map((stop) => stop.evidence), ["gps", "gps"]);
});

test("a dated photo without GPS stays on its date under Location unknown", () => {
  const timeline = reconstructTravelTimeline([
    { id: "receipt", order: 0, dateKey: "2026-04-02", capturedAt: 2_000 },
  ]);
  assert.equal(timeline[0].dateKey, "2026-04-02");
  assert.equal(timeline[0].stops[0].evidence, "unknown");
  assert.equal(timeline[0].stops[0].suggestedLabel, "Location unknown");
  assert.deepEqual(timeline[0].stops[0].moments.map((moment) => moment.photoIds), [["receipt"]]);
});

test("nearby GPS photos remain one stop with chronological moments", () => {
  const timeline = reconstructTravelTimeline([
    { id: "later", order: 1, dateKey: "2026-04-03", capturedAt: 900_000, latitude: 35.0032, longitude: 135.7789 },
    { id: "earlier", order: 0, dateKey: "2026-04-03", capturedAt: 1_000, latitude: 35.003, longitude: 135.778 },
  ]);
  assert.equal(timeline[0].stops.length, 1);
  assert.deepEqual(timeline[0].stops[0].moments.map((moment) => moment.representativePhotoId), ["earlier", "later"]);
});

test("photos without dates preserve selected order", () => {
  const moments = groupPhotosIntoMoments([
    { id: "second", order: 1, dateKey: "undated" },
    { id: "first", order: 0, dateKey: "undated" },
  ]);
  assert.deepEqual(moments.map((moment) => moment.representativePhotoId), ["first", "second"]);
});

test("a GPS-backed Goa stop suggests Goa instead of a stale country", () => {
  const suggestion = suggestJourneyTitle([{ dayNumber: 1, place: "Baga, Calangute, India", placeSource: "gps", latitude: 15.557387, longitude: 73.750391, photoCount: 12 }]);
  assert.equal(suggestion, "Goa, India");
  assert.equal(shouldOfferLocationSuggestion("Japan", undefined, suggestion), true);
});

test("manual places do not masquerade as photo metadata", () => {
  assert.equal(suggestJourneyTitle([{ dayNumber: 1, place: "Goa, India", placeSource: "manual", photoCount: 8 }]), null);
});

test("an intentional title is never replaced by a suggestion", () => {
  assert.equal(shouldOfferLocationSuggestion("Monsoon weekend", "user", "Goa, India"), false);
});
