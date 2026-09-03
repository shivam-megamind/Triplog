export const MAX_PHOTOS = 100;

export type JourneyDetails = {
  destination: string;
  startDate?: number;
  endDate?: number;
};

export type JourneyDetailsErrors = Partial<Record<"destination" | "startDate" | "endDate", string>>;
export type JourneyDetailsInput = {
  destination: string;
  startDate: string;
  endDate: string;
};

export function journeyDetailsErrors(details: JourneyDetails): JourneyDetailsErrors {
  const errors: JourneyDetailsErrors = {};
  if (!details.destination.trim()) errors.destination = "Add the destination or trip region.";
  if (details.startDate === undefined || !Number.isFinite(details.startDate)) errors.startDate = "Add the approximate start date.";
  if (details.endDate === undefined || !Number.isFinite(details.endDate)) errors.endDate = "Add the approximate end date.";
  if (details.startDate !== undefined && details.endDate !== undefined && details.endDate < details.startDate) {
    errors.endDate = "The end date must be the same as or later than the start date.";
  }
  return errors;
}

export function dateInputTimestamp(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

export function journeyDetailsInput(details: JourneyDetails): JourneyDetailsInput {
  return {
    destination: details.destination,
    startDate: details.startDate === undefined ? "" : localDateKey(new Date(details.startDate)),
    endDate: details.endDate === undefined ? "" : localDateKey(new Date(details.endDate)),
  };
}

export function journeyDetailsChanged(saved: JourneyDetails, input: JourneyDetailsInput): boolean {
  return saved.destination.trim() !== input.destination.trim()
    || saved.startDate !== dateInputTimestamp(input.startDate)
    || saved.endDate !== dateInputTimestamp(input.endDate);
}

export type ChapterFields = {
  destination?: string;
  startDate?: number;
  endDate?: number;
  title: string;
  titleConfirmed?: boolean;
  coverConfirmed?: boolean;
  recipientPreviewedAt?: number;
  photoCount: number;
  days: Array<{ displayDate: string; place: string; memory?: string }>;
  moments?: Array<{ memory: string; recommendation: string; warning: string; detail: string }>;
};

export function chapterProblem(fields: ChapterFields): string | null {
  if (!fields.destination?.trim() || fields.startDate === undefined || fields.endDate === undefined) return "Confirm the destination and trip dates.";
  if (!fields.title.trim() || fields.title.trim() === "Untitled journey") return "Give this trip a name.";
  if (!fields.titleConfirmed) return "Confirm the journey title.";
  if (!fields.coverConfirmed) return "Confirm the cover photograph.";
  if (fields.photoCount < 1) return "Add at least one photo.";
  if (fields.days.length < 1) return "Confirm at least one day.";
  if (!fields.recipientPreviewedAt) return "Preview the recipient experience before sharing.";
  return null;
}

export function canAddPhotos(existing: number, incoming: number): boolean {
  return incoming > 0 && existing + incoming <= MAX_PHOTOS;
}

export type JourneyProcessingState = "selecting" | "queued" | "reading" | "ordering" | "grouping" | "shaping" | "ready" | "error";
export type JourneyEntryView = "photos" | "processing" | "timeline" | "error";
export type TimelineAvailability = "visible" | "needs_review" | "needs_rebuild" | "empty";
export type PhotoReviewState = "included" | "possibly_unrelated" | "unplaced";

export function journeyEntryView({
  photoCount,
  momentCount = 0,
  processingStatus,
  managingPhotos,
}: {
  photoCount: number;
  momentCount?: number;
  processingStatus?: JourneyProcessingState;
  managingPhotos: boolean;
}): JourneyEntryView {
  if (managingPhotos || photoCount === 0) return "photos";
  if (processingStatus === "ready") return "timeline";
  if (processingStatus === "error") return "error";
  if (["queued", "reading", "ordering", "grouping", "shaping"].includes(processingStatus ?? "")) return "processing";
  if (processingStatus === undefined && momentCount > 0) return "timeline";
  return "photos";
}

export function shouldOfferReconstructionRetry(photoCount: number, processingStatus?: JourneyProcessingState, momentCount = 0): boolean {
  if (photoCount === 0 || processingStatus === "ready") return false;
  if (processingStatus === undefined && momentCount > 0) return false;
  return processingStatus === undefined || processingStatus === "selecting" || processingStatus === "error";
}

export function timelineAvailability({
  visibleMomentCount,
  reviewPhotoCount,
  needsTimelineRebuild,
}: {
  visibleMomentCount: number;
  reviewPhotoCount: number;
  needsTimelineRebuild: boolean;
}): TimelineAvailability {
  if (visibleMomentCount > 0) return "visible";
  if (reviewPhotoCount > 0) return "needs_review";
  if (needsTimelineRebuild) return "needs_rebuild";
  return "empty";
}

export function initialPhotoReviewState({
  capturedAt,
  hasDateMetadata,
  startDate,
  endDate,
}: {
  capturedAt?: number;
  hasDateMetadata: boolean;
  startDate?: number;
  endDate?: number;
}): PhotoReviewState {
  if (!hasDateMetadata || capturedAt === undefined) return "unplaced";
  const oneDay = 24 * 60 * 60 * 1000;
  const outsideTrip = (startDate !== undefined && capturedAt < startDate - oneDay)
    || (endDate !== undefined && capturedAt > endDate + oneDay);
  return outsideTrip ? "possibly_unrelated" : "included";
}

export function tripDetailsReprocessingPlan(
  photos: Array<{
    id: string;
    capturedAt?: number;
    hasDateMetadata?: boolean;
    reviewState?: PhotoReviewState | "removed";
  }>,
  startDate: number,
  endDate: number,
) {
  return {
    processingStatus: photos.length > 0 ? "queued" as const : "selecting" as const,
    photoReviews: photos.map((photo) => ({
      id: photo.id,
      reviewState: photo.reviewState === "removed"
        ? "removed" as const
        : initialPhotoReviewState({
          capturedAt: photo.capturedAt,
          hasDateMetadata: photo.hasDateMetadata ?? photo.capturedAt !== undefined,
          startDate,
          endDate,
        }),
    })),
  };
}

export function canRetryProcessing(processingStatus?: JourneyProcessingState): boolean {
  return processingStatus === "error"
    || ["queued", "reading", "ordering", "grouping", "shaping"].includes(processingStatus ?? "");
}

export function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
