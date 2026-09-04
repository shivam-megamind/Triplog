import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import {
  enrichmentError,
  initialPhotoReviewState,
  isProcessingLeaseActive,
  journeyDetailsErrors,
  journeyTitle,
  manualMomentKey,
  MAX_ENRICHMENT_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_PHOTOS,
  MAX_TITLE_LENGTH,
  tripDetailsReprocessingPlan,
} from "../lib/trip";
import { groupedPhotoCount, reconstructTravelTimeline } from "../lib/reconstruction";
import { durablePhotoStorageIds, isSingleImageStorage, photoDeliveryUrl, SINGLE_IMAGE_STORAGE, storedPhotoValidationError } from "../lib/photo-storage";
import { suggestJourneyTitle } from "../lib/title-suggestion";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_SOURCE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const processingStatus = v.union(
  v.literal("selecting"),
  v.literal("queued"),
  v.literal("reading"),
  v.literal("ordering"),
  v.literal("grouping"),
  v.literal("shaping"),
  v.literal("ready"),
  v.literal("error"),
);

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError("Sign in to continue.");
  return userId;
}

async function requireOwnedTrip(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">) {
  const userId = await requireUserId(ctx);
  const trip = await ctx.db.get(tripId);
  if (trip === null || trip.ownerId !== userId) throw new ConvexError("Trip not found.");
  return trip;
}

function photoTime(photo: Doc<"photos">) {
  return photo.capturedAt ?? Number.MAX_SAFE_INTEGER;
}

function displayDate(dateKey: string) {
  if (dateKey === "undated") return "";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${dateKey}T12:00:00Z`));
}

async function photoRoleUrl(ctx: QueryCtx, storageId: Id<"_storage">) {
  return photoDeliveryUrl(await ctx.storage.getUrl(storageId), storageId);
}

async function hydratedTrip(ctx: QueryCtx, trip: Doc<"trips">) {
  const [photos, days, stops, moments] = await Promise.all([
    ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("stops").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
  ]);
  const sortedPhotos = photos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
  const displayPhotoIds = new Set(moments.flatMap((moment) => moment.representativePhotoId ? [moment.representativePhotoId] : []));
  if (trip.coverPhotoId) displayPhotoIds.add(trip.coverPhotoId);
  const hydratedPhotos = await Promise.all(sortedPhotos.map(async (photo) => {
    const thumbnailUrl = await photoRoleUrl(ctx, photo.thumbnailStorageId ?? photo.storageId);
    const displayUrl = displayPhotoIds.has(photo._id)
      ? await photoRoleUrl(ctx, photo.displayStorageId ?? photo.storageId)
      : null;
    return {
      ...photo,
      thumbnailUrl,
      displayUrl: displayUrl ?? thumbnailUrl,
      url: displayUrl ?? thumbnailUrl,
      reviewState: photo.reviewState ?? "included" as const,
      placementConfidence: photo.placementConfidence ?? "low" as const,
      quality: photo.quality ?? "clear" as const,
    };
  }));
  const photoById = new Map(hydratedPhotos.map((photo) => [photo._id, photo]));
  const hydratedMoments = moments.filter((moment) => !moment.removed).sort((a, b) => a.sortOrder - b.sortOrder).map((moment) => ({
    ...moment,
    photos: moment.photoIds.flatMap((photoId) => {
      const photo = photoById.get(photoId);
      return photo ? [photo] : [];
    }),
    representativePhoto: moment.representativePhotoId ? photoById.get(moment.representativePhotoId) ?? null : null,
  }));
  const momentsByDay = new Map<Id<"days">, typeof hydratedMoments>();
  const momentsByStop = new Map<Id<"stops">, typeof hydratedMoments>();
  for (const moment of hydratedMoments) {
    const current = momentsByDay.get(moment.dayId);
    if (current) current.push(moment);
    else momentsByDay.set(moment.dayId, [moment]);
    if (moment.stopId) {
      const atStop = momentsByStop.get(moment.stopId);
      if (atStop) atStop.push(moment);
      else momentsByStop.set(moment.stopId, [moment]);
    }
  }
  const stopsByDay = new Map<Id<"days">, Array<Doc<"stops"> & { moments: typeof hydratedMoments; photos: typeof hydratedPhotos }>>();
  for (const stop of stops.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const hydratedStop = {
      ...stop,
      moments: momentsByStop.get(stop._id) ?? [],
      photos: stop.photoIds.flatMap((photoId) => {
        const photo = photoById.get(photoId);
        return photo ? [photo] : [];
      }),
    };
    const current = stopsByDay.get(stop.dayId);
    if (current) current.push(hydratedStop);
    else stopsByDay.set(stop.dayId, [hydratedStop]);
  }
  const sortedDays = days.sort((a, b) => a.dayNumber - b.dayNumber).map((day) => ({
    ...day,
    photos: hydratedPhotos.filter((photo) => photo.reviewState === "included" && (photo.dateKey ?? "undated") === day.dateKey),
    moments: momentsByDay.get(day._id) ?? [],
    stops: stopsByDay.get(day._id) ?? [],
  }));
  return {
    ...trip,
    title: journeyTitle(trip.title),
    photoCount: hydratedPhotos.length,
    momentCount: hydratedMoments.length,
    groupedPhotoCount: hydratedMoments.reduce((total, moment) => total + Math.max(0, moment.photoIds.length - 1), 0),
    days: sortedDays,
    suggestedTitle: suggestJourneyTitle(sortedDays.flatMap((day) => day.stops.map((stop) => ({
      dayNumber: day.dayNumber,
      place: stop.label,
      placeSource: stop.placeSource === "unknown" ? "missing" as const : stop.placeSource,
      latitude: stop.latitude,
      longitude: stop.longitude,
      photoCount: stop.photoIds.length,
    })))),
    needsTimelineRebuild: hydratedMoments.length > 0 && stops.length === 0,
    stops: stops.sort((a, b) => a.sortOrder - b.sortOrder),
    moments: hydratedMoments,
    photos: hydratedPhotos,
    review: {
      possiblyUnrelated: hydratedPhotos.filter((photo) => photo.reviewState === "possibly_unrelated"),
      unplaced: hydratedPhotos.filter((photo) => photo.reviewState === "unplaced"),
      lowQuality: hydratedPhotos.filter((photo) => photo.quality !== "clear" && photo.reviewState !== "removed"),
    },
  };
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const trips = await ctx.db.query("trips").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    return await Promise.all(trips.filter((trip) => trip.deletedAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt).map(async (trip) => {
      const [photos, days, moments] = await Promise.all([
        ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
        ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
        ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
      ]);
      const sortedPhotos = photos.sort((left, right) => photoTime(left) - photoTime(right) || left.order - right.order);
      const cover = sortedPhotos.find((photo) => photo._id === trip.coverPhotoId) ?? sortedPhotos[0];
      const photoCount = photos.length;
      const status = trip.processingStatus === "ready" && photoCount > 0 && days.length > 0 && moments.length > 0
        ? "complete" as const
        : "draft" as const;
      return {
        _id: trip._id,
        title: journeyTitle(trip.title),
        destination: trip.destination ?? journeyTitle(trip.title),
        startDate: trip.startDate,
        endDate: trip.endDate,
        published: trip.published,
        processingStatus: trip.processingStatus ?? "selecting",
        completionLevel: trip.completionLevel ?? "automatic",
        updatedAt: trip.updatedAt,
        photoCount,
        status,
        coverUrl: cover ? await photoRoleUrl(ctx, cover.thumbnailStorageId ?? cover.storageId) : null,
      };
    }));
  },
});

export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const viewerId = await requireUserId(ctx);
    const mine = (await ctx.db.query("shareAccess").withIndex("by_viewer", (q) => q.eq("viewerId", viewerId)).collect())
      .sort((a, b) => b.lastViewedAt - a.lastViewedAt);
    const seen = new Set<Id<"trips">>();
    const shared = [];
    for (const record of mine) {
      if (seen.has(record.tripId)) continue;
      const [trip, link] = await Promise.all([ctx.db.get(record.tripId), ctx.db.get(record.shareLinkId)]);
      if (trip === null || link === null || link.revokedAt !== undefined || !trip.published || trip.deletedAt !== undefined || trip.shareToken !== link.token) continue;
      if (trip.ownerId === viewerId) continue;
      seen.add(trip._id);
      const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect();
      const sortedPhotos = photos.sort((left, right) => photoTime(left) - photoTime(right) || left.order - right.order);
      const cover = sortedPhotos.find((photo) => photo._id === trip.coverPhotoId) ?? sortedPhotos[0];
      shared.push({
        _id: trip._id,
        title: journeyTitle(trip.title),
        destination: trip.destination ?? journeyTitle(trip.title),
        startDate: trip.startDate,
        endDate: trip.endDate,
        shareToken: link.token,
        lastViewedAt: record.lastViewedAt,
        coverUrl: cover ? await photoRoleUrl(ctx, cover.thumbnailStorageId ?? cover.storageId) : null,
      });
    }
    return shared;
  },
});

export const getOne = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => await hydratedTrip(ctx, await requireOwnedTrip(ctx, tripId)),
});

export const getPhotoCopies = query({
  args: { photoId: v.id("photos") },
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) return null;
    await requireOwnedTrip(ctx, photo.tripId);
    const storageLayout = photo.storageLayout ?? "legacy";
    if (isSingleImageStorage(storageLayout)) {
      return {
        storageLayout,
        storedPhotoKind: photo.storedPhotoKind,
        savedImageUrl: await photoRoleUrl(ctx, photo.storageId),
      };
    }
    const [originalUrl, thumbnailUrl, displayUrl, largeUrl] = await Promise.all([
      photoRoleUrl(ctx, photo.storageId),
      photoRoleUrl(ctx, photo.thumbnailStorageId ?? photo.storageId),
      photoRoleUrl(ctx, photo.displayStorageId ?? photo.storageId),
      photoRoleUrl(ctx, photo.largeStorageId ?? photo.storageId),
    ]);
    return { storageLayout: "legacy" as const, originalUrl, thumbnailUrl, displayUrl, largeUrl };
  },
});

export const create = mutation({
  args: {
    destination: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    creationRequestId: v.string(),
  },
  handler: async (ctx, details) => {
    const userId = await requireUserId(ctx);
    const errors = journeyDetailsErrors(details);
    if (Object.keys(errors).length) throw new ConvexError({ message: "Check the journey details.", fieldErrors: errors });
    const creationRequestId = details.creationRequestId.trim();
    if (!creationRequestId) throw new ConvexError("The journey request is missing.");
    const existing = await ctx.db.query("trips").withIndex("by_owner_request", (q) => q.eq("ownerId", userId).eq("creationRequestId", creationRequestId)).unique();
    if (existing !== null) return existing._id;
    const cleanDestination = details.destination.trim();
    return await ctx.db.insert("trips", {
      ownerId: userId,
      creationRequestId,
      destination: cleanDestination,
      title: journeyTitle(cleanDestination),
      titleSource: "default",
      published: false,
      processingStatus: "selecting",
      completionLevel: "automatic",
      photoCount: 0,
      processedPhotoCount: 0,
      startDate: details.startDate,
      endDate: details.endDate,
      updatedAt: Date.now(),
    });
  },
});

export const updateTitle = mutation({
  args: { tripId: v.id("trips"), title: v.string() },
  handler: async (ctx, { tripId, title }) => {
    await requireOwnedTrip(ctx, tripId);
    const cleanTitle = journeyTitle(title);
    if (cleanTitle.length > MAX_TITLE_LENGTH) throw new ConvexError(`Keep the journey title under ${MAX_TITLE_LENGTH} characters.`);
    await ctx.db.patch(tripId, { title: cleanTitle, titleSource: "user", updatedAt: Date.now() });
  },
});

export const updateDetails = mutation({
  args: {
    tripId: v.id("trips"),
    destination: v.string(),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, { tripId, destination, startDate, endDate }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const cleanDestination = destination.trim();
    const errors = journeyDetailsErrors({ destination: cleanDestination, startDate, endDate });
    if (Object.keys(errors).length) throw new ConvexError({ message: "Check the journey details.", fieldErrors: errors });

    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    const plan = tripDetailsReprocessingPlan(photos.map((photo) => ({
      id: photo._id,
      capturedAt: photo.capturedAt,
      hasDateMetadata: photo.hasDateMetadata,
      reviewState: photo.reviewState,
    })), startDate, endDate);

    for (const photoReview of plan.photoReviews) {
      const photoId = photoReview.id as Id<"photos">;
      const photo = photos.find((candidate) => candidate._id === photoId);
      if (photo && photo.reviewState !== photoReview.reviewState) await ctx.db.patch(photoId, { reviewState: photoReview.reviewState });
    }

    const now = Date.now();
    await ctx.db.patch(tripId, {
      destination: cleanDestination,
      startDate,
      endDate,
      processingStatus: plan.processingStatus,
      processedPhotoCount: photos.length,
      updatedAt: now,
    });
    if (photos.length > 0) await ctx.scheduler.runAfter(0, internal.trips.processTrip, { tripId, ownerId: trip.ownerId });
    return { tripId, queued: photos.length > 0, photoCount: photos.length };
  },
});

export const deleteTrip = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    const [links, accessRecords] = await Promise.all([
      ctx.db.query("shareLinks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("shareAccess").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const now = Date.now();
    for (const link of links) if (link.revokedAt === undefined) await ctx.db.patch(link._id, { revokedAt: now });
    for (const record of accessRecords) await ctx.db.delete(record._id);
    await ctx.db.patch(tripId, { deletedAt: now, purgeAt: now + 30 * 24 * 60 * 60 * 1000, published: false, shareToken: undefined, updatedAt: now });
  },
});

export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const trips = await ctx.db.query("trips").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    return trips.filter((trip) => trip.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)).map((trip) => ({
      _id: trip._id,
      title: journeyTitle(trip.title),
      destination: trip.destination ?? journeyTitle(trip.title),
      deletedAt: trip.deletedAt!,
      purgeAt: trip.purgeAt!,
    }));
  },
});

export const restoreTrip = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    if (trip.deletedAt === undefined) return;
    if ((trip.purgeAt ?? 0) <= Date.now()) throw new ConvexError("This journey's 30-day recovery period has ended.");
    await ctx.db.patch(tripId, { deletedAt: undefined, purgeAt: undefined, published: false, shareToken: undefined, updatedAt: Date.now() });
  },
});

async function eraseTrip(ctx: MutationCtx, tripId: Id<"trips">) {
    const [photos, days, stops, moments, links, accessRecords, uploadItems] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("stops").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("shareLinks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("shareAccess").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("uploadItems").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    for (const photo of photos) {
      for (const storageId of durablePhotoStorageIds(photo)) await ctx.storage.delete(storageId);
      await ctx.db.delete(photo._id);
    }
    for (const record of [...days, ...stops, ...moments, ...links, ...accessRecords, ...uploadItems]) await ctx.db.delete(record._id);
    await ctx.db.delete(tripId);
}

export const permanentlyDeleteTrip = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    if (trip.deletedAt === undefined) throw new ConvexError("Move this journey to Recently Deleted first.");
    await eraseTrip(ctx, tripId);
  },
});

export const purgeExpiredDeleted = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = (await ctx.db.query("trips").collect()).filter((trip) => trip.deletedAt !== undefined && (trip.purgeAt ?? Number.MAX_SAFE_INTEGER) <= Date.now());
    for (const trip of expired) await eraseTrip(ctx, trip._id);
  },
});

export const setProcessingStatus = mutation({
  args: { tripId: v.id("trips"), status: processingStatus, processedPhotoCount: v.optional(v.number()) },
  handler: async (ctx, { tripId, status, processedPhotoCount }) => {
    await requireOwnedTrip(ctx, tripId);
    await ctx.db.patch(tripId, {
      processingStatus: status,
      ...(processedPhotoCount === undefined ? {} : { processedPhotoCount }),
      updatedAt: Date.now(),
    });
  },
});

export const listUploadItems = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    return (await ctx.db.query("uploadItems").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect())
      .sort((left, right) => left.order - right.order);
  },
});

const uploadItemInput = v.object({
  uploadKey: v.string(),
  fileName: v.string(),
  fileType: v.string(),
  fileSize: v.number(),
  order: v.number(),
});

export const beginUpload = mutation({
  args: { tripId: v.id("trips"), items: v.array(uploadItemInput) },
  handler: async (ctx, { tripId, items }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const ownerTrips = await ctx.db.query("trips").withIndex("by_owner", (q) => q.eq("ownerId", trip.ownerId)).collect();
    const now = Date.now();
    const processingOthers = ownerTrips.filter((item) => item._id !== tripId && ["reading", "queued", "ordering", "grouping", "shaping"].includes(item.processingStatus ?? ""));
    const activeOther = processingOthers.find((item) => isProcessingLeaseActive(item.processingStatus, item.updatedAt, now));
    if (activeOther) throw new ConvexError(`“${activeOther.title}” is still reconstructing. Wait for it to finish, then retry this upload.`);
    for (const staleTrip of processingOthers) {
      await ctx.db.patch(staleTrip._id, { processingStatus: "error", updatedAt: now });
    }
    const current = await ctx.db.query("uploadItems").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    const storedPhotos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    const byKey = new Map(current.map((item) => [item.uploadKey, item]));
    const uniqueNew = items.filter((item, index) => items.findIndex((candidate) => candidate.uploadKey === item.uploadKey) === index && !byKey.has(item.uploadKey));
    const uploadedSignatures = new Set(current.filter((item) => item.status === "uploaded").map((item) => `${item.fileName}:${item.fileSize}`));
    const duplicate = uniqueNew.find((item) => uploadedSignatures.has(`${item.fileName}:${item.fileSize}`));
    if (duplicate) throw new ConvexError(`${duplicate.fileName} is already uploaded to this journey.`);
    if (Math.max(current.length, storedPhotos.length) + uniqueNew.length > MAX_PHOTOS) throw new ConvexError(`A journey can hold up to ${MAX_PHOTOS} photos.`);
    const invalid = uniqueNew.find((item) => !SUPPORTED_SOURCE_PHOTO_TYPES.has(item.fileType));
    if (invalid) throw new ConvexError(`${invalid.fileName} is not a supported JPEG, PNG, WebP, HEIC, or HEIF photo.`);
    const oversized = uniqueNew.find((item) => item.fileSize > MAX_FILE_SIZE);
    if (oversized) throw new ConvexError(`${oversized.fileName} is larger than 50 MB.`);
    for (const item of uniqueNew) {
      await ctx.db.insert("uploadItems", {
        tripId,
        ownerId: trip.ownerId,
        uploadKey: item.uploadKey.slice(0, 300),
        fileName: item.fileName.slice(0, 160),
        fileType: item.fileType,
        fileSize: item.fileSize,
        order: item.order,
        status: "pending",
        attempts: 0,
        updatedAt: now,
      });
    }
    await ctx.db.patch(tripId, { processingStatus: "reading", updatedAt: now });
  },
});

export const markUploadAttempt = mutation({
  args: { tripId: v.id("trips"), uploadKey: v.string() },
  handler: async (ctx, { tripId, uploadKey }) => {
    await requireOwnedTrip(ctx, tripId);
    const item = await ctx.db.query("uploadItems").withIndex("by_trip_key", (q) => q.eq("tripId", tripId).eq("uploadKey", uploadKey)).unique();
    if (!item || item.status === "uploaded") return;
    await ctx.db.patch(item._id, { status: "uploading", attempts: item.attempts + 1, error: undefined, updatedAt: Date.now() });
  },
});

export const markUploadFailed = mutation({
  args: { tripId: v.id("trips"), uploadKey: v.string(), error: v.string() },
  handler: async (ctx, { tripId, uploadKey, error }) => {
    await requireOwnedTrip(ctx, tripId);
    const item = await ctx.db.query("uploadItems").withIndex("by_trip_key", (q) => q.eq("tripId", tripId).eq("uploadKey", uploadKey)).unique();
    if (!item || item.status === "uploaded") return;
    await ctx.db.patch(item._id, { status: "failed", error: error.slice(0, 240), updatedAt: Date.now() });
  },
});

export const generateUploadUrl = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const currentCount = trip.photoCount ?? (await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()).length;
    if (currentCount >= MAX_PHOTOS) throw new ConvexError(`A trip can hold up to ${MAX_PHOTOS} photos.`);
    return await ctx.storage.generateUploadUrl();
  },
});

const photoMetadataArgs = {
  capturedAt: v.optional(v.number()),
  dateKey: v.string(),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  hasDateMetadata: v.boolean(),
  hasGpsMetadata: v.boolean(),
  orientation: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  fileType: v.string(),
  fileSize: v.number(),
  exactHash: v.optional(v.string()),
  visualHash: v.optional(v.string()),
  quality: v.union(v.literal("clear"), v.literal("dark"), v.literal("blurry"), v.literal("dark_blurry")),
};

export const addPhoto = mutation({
  args: {
    tripId: v.id("trips"),
    uploadKey: v.string(),
    storageId: v.id("_storage"),
    storedPhotoKind: v.union(v.literal("optimized_webp"), v.literal("original_fallback")),
    fileName: v.string(),
    order: v.number(),
    ...photoMetadataArgs,
  },
  handler: async (ctx, args) => {
    const trip = await requireOwnedTrip(ctx, args.tripId);
    const uploadItem = await ctx.db.query("uploadItems").withIndex("by_trip_key", (q) => q.eq("tripId", args.tripId).eq("uploadKey", args.uploadKey)).unique();
    if (!uploadItem) throw new ConvexError("This upload item was not prepared.");
    if (uploadItem.photoId) {
      const existingPhoto = await ctx.db.get(uploadItem.photoId);
      if (existingPhoto?.storageId !== args.storageId && await ctx.db.system.get(args.storageId)) await ctx.storage.delete(args.storageId);
      return uploadItem.photoId;
    }
    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", args.tripId)).collect();
    const storedImage = await ctx.db.system.get(args.storageId);
    const invalidSource = !SUPPORTED_SOURCE_PHOTO_TYPES.has(args.fileType);
    const storedImageError = storedPhotoValidationError({
      kind: args.storedPhotoKind,
      sourceType: args.fileType,
      sourceSize: args.fileSize,
      storedType: storedImage?.contentType,
      storedSize: storedImage?.size,
    });
    if (photos.length >= MAX_PHOTOS || args.order < 0 || args.order >= MAX_PHOTOS || args.fileSize > MAX_FILE_SIZE || invalidSource || storedImageError) {
      if (storedImage) await ctx.storage.delete(args.storageId);
      throw new ConvexError(args.fileSize > MAX_FILE_SIZE
        ? "This photo is larger than 50 MB."
        : invalidSource
          ? "This photo is not a supported JPEG, PNG, WebP, HEIC, or HEIF image."
          : storedImageError
            ? storedImageError
          : `A trip can hold up to ${MAX_PHOTOS} photos.`);
    }
    const reviewState = initialPhotoReviewState({
      capturedAt: args.capturedAt,
      hasDateMetadata: args.hasDateMetadata,
      startDate: trip.startDate,
      endDate: trip.endDate,
    });
    const placementConfidence = args.hasDateMetadata && args.hasGpsMetadata ? "high" as const : args.hasDateMetadata ? "medium" as const : "low" as const;
    const photoId = await ctx.db.insert("photos", {
      ...args,
      storageLayout: SINGLE_IMAGE_STORAGE,
      fileName: args.fileName.slice(0, 160),
      reviewState,
      placementConfidence,
      placementConfirmed: placementConfidence === "high",
    });
    await ctx.db.patch(uploadItem._id, { status: "uploaded", photoId, error: undefined, updatedAt: Date.now() });
    await ctx.db.patch(trip._id, { photoCount: photos.length + 1, processedPhotoCount: photos.length + 1, updatedAt: Date.now() });
    if (!trip.coverPhotoId && reviewState === "included") await ctx.db.patch(trip._id, { coverPhotoId: photoId, updatedAt: Date.now() });
    return photoId;
  },
});

export const reconcileSingleImageUpload = mutation({
  args: {
    tripId: v.id("trips"),
    uploadKey: v.string(),
    storageId: v.id("_storage"),
    error: v.string(),
  },
  handler: async (ctx, { tripId, uploadKey, storageId, error }) => {
    await requireOwnedTrip(ctx, tripId);
    const item = await ctx.db.query("uploadItems").withIndex("by_trip_key", (q) => q.eq("tripId", tripId).eq("uploadKey", uploadKey)).unique();
    if (!item) {
      if (await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
      return { saved: false as const };
    }
    if (item.photoId) {
      const photo = await ctx.db.get(item.photoId);
      if (photo?.storageId !== storageId && await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
      await ctx.db.patch(item._id, { status: "uploaded", error: undefined, updatedAt: Date.now() });
      return { saved: true as const, photoId: item.photoId };
    }
    if (await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
    await ctx.db.patch(item._id, { status: "failed", error: error.slice(0, 240), updatedAt: Date.now() });
    return { saved: false as const };
  },
});

export const updatePhotoMetadata = mutation({
  args: { photoId: v.id("photos"), ...photoMetadataArgs },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (photo === null) throw new ConvexError("Photo not found.");
    await requireOwnedTrip(ctx, photo.tripId);
    await ctx.db.patch(photo._id, {
      capturedAt: args.capturedAt,
      dateKey: args.dateKey,
      latitude: args.latitude,
      longitude: args.longitude,
      hasDateMetadata: args.hasDateMetadata,
      hasGpsMetadata: args.hasGpsMetadata,
      orientation: args.orientation,
      width: args.width,
      height: args.height,
      fileType: args.fileType,
      fileSize: args.fileSize,
      exactHash: args.exactHash,
      visualHash: args.visualHash,
      quality: args.quality,
    });
  },
});

export const rebuildDays = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const [photos, existingDays] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const includedPhotos = photos.filter((photo) => (photo.reviewState ?? "included") === "included");
    const sorted = includedPhotos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
    const dateKeys = [...new Set(sorted.map((photo) => photo.dateKey ?? "undated"))];
    const usedDays = new Set<Id<"days">>();
    for (const [index, dateKey] of dateKeys.entries()) {
      const groupPhotos = sorted.filter((photo) => (photo.dateKey ?? "undated") === dateKey);
      const representative = groupPhotos.find((photo) => photo.latitude !== undefined && photo.longitude !== undefined);
      const existing = existingDays.find((day) => day.dateKey === dateKey);
      if (existing === undefined) {
        const dayId = await ctx.db.insert("days", {
          tripId,
          dateKey,
          dayNumber: index + 1,
          displayDate: displayDate(dateKey),
          place: "",
          placeSource: "missing",
          memory: "",
          representativeLatitude: representative?.latitude,
          representativeLongitude: representative?.longitude,
        });
        usedDays.add(dayId);
      } else {
        usedDays.add(existing._id);
        const coordinateChanged = existing.representativeLatitude !== representative?.latitude || existing.representativeLongitude !== representative?.longitude;
        await ctx.db.patch(existing._id, {
          dayNumber: index + 1,
          representativeLatitude: representative?.latitude,
          representativeLongitude: representative?.longitude,
          ...(coordinateChanged && existing.placeSource === "gps" ? { place: "", placeSource: "missing" as const } : {}),
        });
      }
    }
    await ctx.db.patch(trip._id, {
      processingStatus: "grouping",
      photoCount: photos.length,
      updatedAt: Date.now(),
    });
    return { days: dateKeys.length, missingDates: photos.filter((photo) => !photo.hasDateMetadata).length };
  },
});

function reconstructionInput(photo: Doc<"photos">) {
  return {
    id: photo._id,
    order: photo.order,
    capturedAt: photo.capturedAt,
    dateKey: photo.dateKey,
    latitude: photo.latitude,
    longitude: photo.longitude,
    exactHash: photo.exactHash,
    visualHash: photo.visualHash,
    width: photo.width,
    height: photo.height,
  };
}

async function rebuildTimelineRecords(ctx: MutationCtx, tripId: Id<"trips">) {
  const [photos, days, existingStops, existingMoments] = await Promise.all([
    ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("stops").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
  ]);
  const timeline = reconstructTravelTimeline(photos.filter((photo) => (photo.reviewState ?? "included") === "included").map(reconstructionInput));
  const dayByDate = new Map(days.map((day) => [day.dateKey, day]));
  const existingStopByKey = new Map(existingStops.map((stop) => [stop.key, stop]));
  const existingMomentByKey = new Map(existingMoments.map((moment) => [moment.key, moment]));
  const retainedDays = new Set<Id<"days">>();
  const retainedStops = new Set<Id<"stops">>();
  const retainedMoments = new Set<Id<"moments">>();
  let stopOrder = 0;
  let momentOrder = 0;

  for (const reconstructedDay of timeline) {
    const day = dayByDate.get(reconstructedDay.dateKey);
    if (!day) throw new ConvexError("A reconstructed day is missing.");
    retainedDays.add(day._id);
    for (const stop of reconstructedDay.stops) {
      const photoIds = stop.photoIds as Id<"photos">[];
      const existingStop = existingStopByKey.get(stop.key);
      let stopId: Id<"stops">;
      if (existingStop) {
        const coordinatesChanged = existingStop.latitude !== stop.latitude || existingStop.longitude !== stop.longitude;
        const keepManualLabel = existingStop.placeSource === "manual";
        await ctx.db.patch(existingStop._id, {
          dayId: day._id,
          dateKey: stop.dateKey,
          sortOrder: stopOrder,
          label: keepManualLabel ? existingStop.label : stop.evidence === "unknown" ? "Location unknown" : coordinatesChanged ? "" : existingStop.label,
          placeSource: keepManualLabel ? "manual" : stop.evidence,
          confidence: stop.confidence,
          latitude: stop.latitude,
          longitude: stop.longitude,
          photoIds,
        });
        stopId = existingStop._id;
      } else {
        stopId = await ctx.db.insert("stops", {
          tripId,
          dayId: day._id,
          key: stop.key,
          dateKey: stop.dateKey,
          sortOrder: stopOrder,
          label: stop.evidence === "unknown" ? "Location unknown" : "",
          placeSource: stop.evidence,
          confidence: stop.confidence,
          latitude: stop.latitude,
          longitude: stop.longitude,
          photoIds,
        });
      }
      stopOrder += 1;
      retainedStops.add(stopId);

      for (const moment of stop.moments) {
        const momentPhotoIds = moment.photoIds as Id<"photos">[];
        const representativePhotoId = moment.representativePhotoId as Id<"photos">;
        const existing = existingMomentByKey.get(moment.key);
        if (existing) {
          const userStop = existing.placementSource === "user" && existing.stopId
            ? existingStops.find((candidate) => candidate._id === existing.stopId)
            : undefined;
          const targetStopId = userStop ? userStop._id : stopId;
          const targetDayId = userStop ? userStop.dayId : day._id;
          const targetDateKey = userStop ? userStop.dateKey : moment.dateKey;
          if (userStop) {
            retainedDays.add(userStop.dayId);
            retainedStops.add(userStop._id);
          }
          const keepRepresentative = existing.representativeSource === "user" && existing.representativePhotoId !== undefined && momentPhotoIds.includes(existing.representativePhotoId);
          await ctx.db.patch(existing._id, {
            dayId: targetDayId,
            stopId: targetStopId,
            dateKey: targetDateKey,
            sortOrder: momentOrder,
            startTime: moment.startTime,
            photoIds: momentPhotoIds,
            representativePhotoId: keepRepresentative ? existing.representativePhotoId : representativePhotoId,
            representativeSource: keepRepresentative ? "user" : "system",
            placementSource: userStop ? "user" : "system",
          });
          retainedMoments.add(existing._id);
        } else {
          retainedMoments.add(await ctx.db.insert("moments", {
            tripId,
            dayId: day._id,
            stopId,
            key: moment.key,
            dateKey: moment.dateKey,
            sortOrder: momentOrder,
            startTime: moment.startTime,
            photoIds: momentPhotoIds,
            representativePhotoId,
            representativeSource: "system",
            placementSource: "system",
            memory: "",
            recommendation: "",
            warning: "",
            detail: "",
          }));
        }
        momentOrder += 1;
      }
    }
  }

  for (const moment of existingMoments) {
    if (moment.manuallyAdded) {
      retainedDays.add(moment.dayId);
      retainedMoments.add(moment._id);
      continue;
    }
    if (!retainedMoments.has(moment._id)) await ctx.db.delete(moment._id);
  }
  for (const stop of existingStops) {
    if (!retainedStops.has(stop._id)) await ctx.db.delete(stop._id);
  }
  for (const day of days) {
    if (!retainedDays.has(day._id)) await ctx.db.delete(day._id);
  }
  const reconstructedMoments = timeline.flatMap((day) => day.stops.flatMap((stop) => stop.moments));
  return {
    stops: timeline.reduce((total, day) => total + day.stops.length, 0),
    moments: reconstructedMoments.length,
    groupedPhotos: groupedPhotoCount(reconstructedMoments),
  };
}

export const rebuildMoments = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const result = await rebuildTimelineRecords(ctx, tripId);
    await ctx.db.patch(trip._id, { processingStatus: "shaping", updatedAt: Date.now() });
    return result;
  },
});

export const queueProcessing = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const [photos, items] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("uploadItems").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    if (!photos.length) throw new ConvexError("Upload at least one photo before making the draft.");
    if (items.some((item) => item.status === "pending" || item.status === "uploading")) throw new ConvexError("Finish or mark each selected photo before making the draft.");
    await ctx.db.patch(tripId, { processingStatus: "queued", processedPhotoCount: photos.length, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.trips.processTrip, { tripId, ownerId: trip.ownerId });
  },
});

export const rebuildDaysInBackground = internalMutation({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, { tripId, ownerId }) => {
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.ownerId !== ownerId || trip.deletedAt !== undefined) throw new Error("Journey unavailable.");
    const [photos, existingDays] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const sorted = photos.filter((photo) => (photo.reviewState ?? "included") === "included").sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
    const dateKeys = [...new Set(sorted.map((photo) => photo.dateKey ?? "undated"))];
    for (const [index, dateKey] of dateKeys.entries()) {
      const groupPhotos = sorted.filter((photo) => (photo.dateKey ?? "undated") === dateKey);
      const representative = groupPhotos.find((photo) => photo.latitude !== undefined && photo.longitude !== undefined);
      const existing = existingDays.find((day) => day.dateKey === dateKey);
      if (!existing) await ctx.db.insert("days", { tripId, dateKey, dayNumber: index + 1, displayDate: displayDate(dateKey), place: "", placeSource: "missing", memory: "", representativeLatitude: representative?.latitude, representativeLongitude: representative?.longitude });
      else await ctx.db.patch(existing._id, { dayNumber: index + 1, representativeLatitude: representative?.latitude, representativeLongitude: representative?.longitude });
    }
    await ctx.db.patch(tripId, { processingStatus: "grouping", photoCount: photos.length, updatedAt: Date.now() });
  },
});

export const rebuildMomentsInBackground = internalMutation({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, { tripId, ownerId }) => {
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.ownerId !== ownerId || trip.deletedAt !== undefined) throw new Error("Journey unavailable.");
    await rebuildTimelineRecords(ctx, tripId);
    await ctx.db.patch(tripId, { processingStatus: "shaping", updatedAt: Date.now() });
  },
});

export const finishProcessingInBackground = internalMutation({
  args: { tripId: v.id("trips"), ownerId: v.id("users"), status: v.union(v.literal("ready"), v.literal("error")) },
  handler: async (ctx, { tripId, ownerId, status }) => {
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.ownerId !== ownerId) return;
    const now = Date.now();
    await ctx.db.patch(tripId, { processingStatus: status, ...(status === "ready" && trip.readyEmailQueuedAt === undefined ? { readyEmailQueuedAt: now } : {}), updatedAt: now });
    if (status === "ready" && trip.readyEmailSentAt === undefined) await ctx.scheduler.runAfter(0, internal.trips.sendReadyEmail, { tripId, ownerId });
  },
});

export const readyEmailDetails = internalQuery({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, { tripId, ownerId }) => {
    const [trip, owner] = await Promise.all([ctx.db.get(tripId), ctx.db.get(ownerId)]);
    if (!trip || trip.ownerId !== ownerId || trip.deletedAt !== undefined || !owner?.email) return null;
    return { title: journeyTitle(trip.title), destination: trip.destination ?? journeyTitle(trip.title), email: owner.email, sentAt: trip.readyEmailSentAt, attempts: trip.readyEmailAttempts ?? 0 };
  },
});

export const recordReadyEmail = internalMutation({
  args: { tripId: v.id("trips"), ownerId: v.id("users"), emailId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { tripId, ownerId, emailId, error }) => {
    const trip = await ctx.db.get(tripId);
    if (!trip || trip.ownerId !== ownerId) return;
    const attempts = (trip.readyEmailAttempts ?? 0) + 1;
    await ctx.db.patch(tripId, emailId ? { readyEmailId: emailId, readyEmailSentAt: Date.now(), readyEmailError: undefined, readyEmailAttempts: attempts } : { readyEmailError: error?.slice(0, 300) ?? "Email delivery failed.", readyEmailAttempts: attempts });
    return attempts;
  },
});

function safeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function sendWithResend({ to, title, destination, journeyUrl, idempotencyKey }: { to: string; title: string; destination: string; journeyUrl: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const testing = process.env.RESEND_TEST_MODE !== "false";
  const recipient = testing ? "delivered+trip-ready@resend.dev" : to;
  const from = testing ? "Postcard <onboarding@resend.dev>" : process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) throw new Error("RESEND_FROM_EMAIL is required when RESEND_TEST_MODE is false.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `${title} is ready to revisit`,
      text: `Your first draft for ${destination} is ready. Open it: ${journeyUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:40px 24px;color:#1d1e1b"><p style="color:#a8563c;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Postcard · Journey ready</p><h1 style="font-family:Georgia,serif;font-weight:500;font-size:42px;line-height:1.05">${safeHtml(title)} is ready.</h1><p style="font-size:17px;line-height:1.6">Your photographs from ${safeHtml(destination)} have been organised into a private first draft. Postcard has not invented any memories or opinions.</p><p><a href="${safeHtml(journeyUrl)}" style="display:inline-block;background:#244336;color:#fff;padding:14px 20px;text-decoration:none">Open your journey</a></p></div>`,
    }),
  });
  const result = await response.json() as { id?: string; message?: string };
  if (!response.ok || !result.id) throw new Error(result.message ?? `Resend returned ${response.status}.`);
  return result.id;
}

export const sendReadyEmail = internalAction({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const details = await ctx.runQuery(internal.trips.readyEmailDetails, args);
    if (!details || details.sentAt !== undefined) return;
    const rootUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    try {
      const emailId = await sendWithResend({ to: details.email, title: details.title, destination: details.destination, journeyUrl: `${rootUrl}/book?journey=${args.tripId}`, idempotencyKey: `trip-ready/${args.tripId}` });
      await ctx.runMutation(internal.trips.recordReadyEmail, { ...args, emailId });
    } catch (caught) {
      const attempts = await ctx.runMutation(internal.trips.recordReadyEmail, { ...args, error: caught instanceof Error ? caught.message : "Email delivery failed." });
      if (attempts !== null && attempts < 3) await ctx.scheduler.runAfter(60_000, internal.trips.sendReadyEmail, args);
    }
  },
});

export const testResendReadyEmail = internalAction({
  args: {},
  handler: async () => {
    const emailId = await sendWithResend({ to: "delivered@resend.dev", title: "Test journey", destination: "Resend testing mode", journeyUrl: "http://localhost:3000/book", idempotencyKey: `trip-ready-test/${crypto.randomUUID()}` });
    return { delivered: true, emailId };
  },
});

export const processTrip = internalAction({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.trips.rebuildDaysInBackground, args);
      await ctx.runMutation(internal.trips.rebuildMomentsInBackground, args);
      const stops: Doc<"stops">[] = await ctx.runQuery(internal.trips.pendingGeocodes, args);
      let requested = false;
      for (const stop of stops) {
        if (stop.latitude === undefined || stop.longitude === undefined) continue;
        const coordinateKey = keyFor(stop.latitude, stop.longitude);
        const cached = await ctx.runQuery(internal.trips.cachedPlace, { coordinateKey });
        if (cached) { await ctx.runMutation(internal.trips.applyCachedPlace, { stopId: stop._id, place: cached.place }); continue; }
        if (requested) await new Promise((resolve) => setTimeout(resolve, 1100));
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("format", "jsonv2"); url.searchParams.set("lat", String(stop.latitude)); url.searchParams.set("lon", String(stop.longitude)); url.searchParams.set("zoom", "14"); url.searchParams.set("addressdetails", "1");
        const response = await fetch(url, { headers: { "User-Agent": `Triplog/0.1 (${process.env.SITE_URL ?? "development"})`, "Accept-Language": "en" }, signal: AbortSignal.timeout(10_000) });
        requested = true;
        if (response.ok) {
          const place = placeFromNominatim(await response.json());
          if (place) await ctx.runMutation(internal.trips.cacheAndApplyPlace, { stopId: stop._id, coordinateKey, latitude: stop.latitude, longitude: stop.longitude, place });
        }
      }
      await ctx.runMutation(internal.trips.finishProcessingInBackground, { ...args, status: "ready" });
    } catch {
      await ctx.runMutation(internal.trips.finishProcessingInBackground, { ...args, status: "error" });
    }
  },
});

export const saveDay = mutation({
  args: { dayId: v.id("days"), displayDate: v.string(), place: v.string() },
  handler: async (ctx, args) => {
    const day = await ctx.db.get(args.dayId);
    if (day === null) throw new ConvexError("Day not found.");
    await requireOwnedTrip(ctx, day.tripId);
    const place = args.place.trim();
    await ctx.db.patch(day._id, {
      displayDate: args.displayDate.trim(),
      place,
      placeSource: place === day.place ? day.placeSource : place ? "manual" : "missing",
    });
    await ctx.db.patch(day.tripId, { updatedAt: Date.now() });
  },
});

export const saveStop = mutation({
  args: { stopId: v.id("stops"), label: v.string() },
  handler: async (ctx, { stopId, label }) => {
    const stop = await ctx.db.get(stopId);
    if (!stop) throw new ConvexError("Stop not found.");
    await requireOwnedTrip(ctx, stop.tripId);
    const cleanLabel = label.trim();
    if (!cleanLabel) throw new ConvexError("Add a location name, or keep Location unknown.");
    if (cleanLabel.length > MAX_LOCATION_LENGTH) throw new ConvexError(`Keep the location name under ${MAX_LOCATION_LENGTH} characters.`);
    await ctx.db.patch(stopId, { label: cleanLabel, placeSource: "manual", confidence: "high" });
    await ctx.db.patch(stop.tripId, { updatedAt: Date.now(), completionLevel: "usable" });
  },
});

export const saveMoment = mutation({
  args: {
    momentId: v.id("moments"),
    memory: v.string(),
    recommendation: v.string(),
    warning: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const moment = await ctx.db.get(args.momentId);
    if (moment === null) throw new ConvexError("Moment not found.");
    await requireOwnedTrip(ctx, moment.tripId);
    const error = enrichmentError(args);
    if (error) throw new ConvexError(error);
    await ctx.db.patch(moment._id, {
      memory: args.memory,
      recommendation: args.recommendation,
      warning: args.warning,
      detail: args.detail,
      promptSkipped: false,
    });
    const enriched = [args.memory, args.recommendation, args.warning, args.detail].some((value) => value.trim());
    await ctx.db.patch(moment.tripId, { updatedAt: Date.now(), ...(enriched ? { completionLevel: "enriched" as const } : {}) });
  },
});

export const skipMomentPrompt = mutation({
  args: { momentId: v.id("moments") },
  handler: async (ctx, { momentId }) => {
    const moment = await ctx.db.get(momentId);
    if (!moment) throw new ConvexError("Moment not found.");
    await requireOwnedTrip(ctx, moment.tripId);
    await ctx.db.patch(momentId, { promptSkipped: true });
    await ctx.db.patch(moment.tripId, { updatedAt: Date.now() });
  },
});

export const setPhotoReviewState = mutation({
  args: {
    tripId: v.id("trips"),
    photoIds: v.array(v.id("photos")),
    reviewState: v.union(v.literal("included"), v.literal("possibly_unrelated"), v.literal("unplaced"), v.literal("removed")),
  },
  handler: async (ctx, { tripId, photoIds, reviewState }) => {
    await requireOwnedTrip(ctx, tripId);
    for (const photoId of [...new Set(photoIds)]) {
      const photo = await ctx.db.get(photoId);
      if (!photo || photo.tripId !== tripId) throw new ConvexError("One selected photo does not belong to this journey.");
      await ctx.db.patch(photoId, { reviewState });
    }
    await ctx.db.patch(tripId, { updatedAt: Date.now() });
  },
});

export const confirmPhotoPlacement = mutation({
  args: { photoId: v.id("photos"), dateKey: v.string() },
  handler: async (ctx, { photoId, dateKey }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo) throw new ConvexError("Photo not found.");
    await requireOwnedTrip(ctx, photo.tripId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new ConvexError("Choose a date for this photo.");
    await ctx.db.patch(photoId, { dateKey, reviewState: "included", placementConfirmed: true, placementConfidence: "high" });
    await ctx.db.patch(photo.tripId, { updatedAt: Date.now() });
  },
});

export const setRepresentativePhoto = mutation({
  args: { momentId: v.id("moments"), photoId: v.id("photos") },
  handler: async (ctx, { momentId, photoId }) => {
    const moment = await ctx.db.get(momentId);
    if (!moment) throw new ConvexError("Moment not found.");
    await requireOwnedTrip(ctx, moment.tripId);
    if (!moment.photoIds.includes(photoId)) throw new ConvexError("Choose a photo from this moment.");
    await ctx.db.patch(momentId, { representativePhotoId: photoId, representativeSource: "user" });
    await ctx.db.patch(moment.tripId, { updatedAt: Date.now() });
  },
});

export const moveMoment = mutation({
  args: { momentId: v.id("moments"), stopId: v.id("stops") },
  handler: async (ctx, { momentId, stopId }) => {
    const [moment, stop] = await Promise.all([ctx.db.get(momentId), ctx.db.get(stopId)]);
    if (!moment || !stop || moment.tripId !== stop.tripId) throw new ConvexError("Choose a stop from this journey.");
    await requireOwnedTrip(ctx, moment.tripId);
    await ctx.db.patch(momentId, {
      dayId: stop.dayId,
      stopId: stop._id,
      dateKey: stop.dateKey,
      placementSource: "user",
    });
    await ctx.db.patch(moment.tripId, { updatedAt: Date.now(), completionLevel: "usable" });
  },
});

export const addMoment = mutation({
  args: { tripId: v.id("trips"), dayId: v.id("days"), stopId: v.optional(v.id("stops")), memory: v.string(), requestId: v.string() },
  handler: async (ctx, { tripId, dayId, stopId, memory, requestId }) => {
    await requireOwnedTrip(ctx, tripId);
    const cleanRequestId = requestId.trim();
    if (!cleanRequestId || cleanRequestId.length > 100) throw new ConvexError("This memory request is missing. Try again.");
    if (memory.length > MAX_ENRICHMENT_LENGTH) throw new ConvexError(`Memory must be ${MAX_ENRICHMENT_LENGTH.toLocaleString("en")} characters or fewer.`);
    const key = manualMomentKey(cleanRequestId);
    const duplicate = await ctx.db.query("moments").withIndex("by_trip_key", (q) => q.eq("tripId", tripId).eq("key", key)).unique();
    if (duplicate) return duplicate._id;
    const day = await ctx.db.get(dayId);
    if (!day || day.tripId !== tripId) throw new ConvexError("Day not found.");
    const requestedStop = stopId ? await ctx.db.get(stopId) : null;
    if (requestedStop && (requestedStop.tripId !== tripId || requestedStop.dayId !== dayId)) throw new ConvexError("Choose a stop from this day.");
    const firstStop = requestedStop ?? await ctx.db.query("stops").withIndex("by_day", (q) => q.eq("dayId", dayId)).first();
    const moments = (await ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()).filter((moment) => !moment.removed);
    const now = Date.now();
    const momentId = await ctx.db.insert("moments", {
      tripId,
      dayId,
      stopId: firstStop?._id,
      key,
      dateKey: day.dateKey,
      sortOrder: moments.length,
      photoIds: [],
      representativeSource: "user",
      placementSource: "user",
      manuallyAdded: true,
      memory,
      recommendation: "",
      warning: "",
      detail: "",
    });
    await ctx.db.patch(tripId, { completionLevel: memory.trim() ? "enriched" : "usable", updatedAt: now });
    return momentId;
  },
});

export const removeMoment = mutation({
  args: { momentId: v.id("moments") },
  handler: async (ctx, { momentId }) => {
    const moment = await ctx.db.get(momentId);
    if (!moment) throw new ConvexError("Moment not found.");
    await requireOwnedTrip(ctx, moment.tripId);
    await ctx.db.patch(momentId, { removed: true });
    await ctx.db.patch(moment.tripId, { updatedAt: Date.now() });
  },
});

export const reorderMoments = mutation({
  args: { tripId: v.id("trips"), orderedMomentIds: v.array(v.id("moments")) },
  handler: async (ctx, { tripId, orderedMomentIds }) => {
    await requireOwnedTrip(ctx, tripId);
    const active = (await ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect()).filter((moment) => !moment.removed);
    if (active.length !== orderedMomentIds.length || new Set(orderedMomentIds).size !== active.length || orderedMomentIds.some((id) => !active.some((moment) => moment._id === id))) {
      throw new ConvexError("The journey changed before its moments could be reordered. Try again.");
    }
    for (const [sortOrder, momentId] of orderedMomentIds.entries()) await ctx.db.patch(momentId, { sortOrder });
    await ctx.db.patch(tripId, { completionLevel: "usable", updatedAt: Date.now() });
  },
});

export const confirmTitleAndCover = mutation({
  args: { tripId: v.id("trips"), title: v.string(), coverPhotoId: v.id("photos") },
  handler: async (ctx, { tripId, title, coverPhotoId }) => {
    await requireOwnedTrip(ctx, tripId);
    const photo = await ctx.db.get(coverPhotoId);
    if (!photo || photo.tripId !== tripId || (photo.reviewState ?? "included") !== "included") throw new ConvexError("Choose an included photo for the cover.");
    const cleanTitle = journeyTitle(title);
    if (cleanTitle.length > MAX_TITLE_LENGTH) throw new ConvexError(`Keep the journey title under ${MAX_TITLE_LENGTH} characters.`);
    await ctx.db.patch(tripId, { title: cleanTitle, titleSource: "user", titleConfirmed: true, coverPhotoId, coverConfirmed: true, completionLevel: "usable", updatedAt: Date.now() });
  },
});

export const markRecipientPreviewed = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    await ctx.db.patch(tripId, { recipientPreviewedAt: Date.now(), updatedAt: Date.now() });
  },
});

export const pendingGeocodes = internalQuery({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, { tripId, ownerId }) => {
    const trip = await ctx.db.get(tripId);
    if (trip === null || trip.ownerId !== ownerId) return [];
    const stops = await ctx.db.query("stops").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    return stops.filter((stop) => stop.placeSource === "gps" && !stop.label && stop.latitude !== undefined && stop.longitude !== undefined).sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const cachedPlace = internalQuery({
  args: { coordinateKey: v.string() },
  handler: async (ctx, { coordinateKey }) => await ctx.db.query("geocodeCache").withIndex("by_coordinate", (q) => q.eq("coordinateKey", coordinateKey)).first(),
});

export const cacheAndApplyPlace = internalMutation({
  args: { stopId: v.id("stops"), coordinateKey: v.string(), latitude: v.number(), longitude: v.number(), place: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db.query("geocodeCache").withIndex("by_coordinate", (q) => q.eq("coordinateKey", args.coordinateKey)).first();
    if (cached === null) await ctx.db.insert("geocodeCache", { coordinateKey: args.coordinateKey, latitude: args.latitude, longitude: args.longitude, place: args.place, provider: "nominatim", createdAt: Date.now() });
    const stop = await ctx.db.get(args.stopId);
    if (stop !== null && stop.placeSource === "gps" && !stop.label) await ctx.db.patch(stop._id, { label: args.place });
  },
});

export const applyCachedPlace = internalMutation({
  args: { stopId: v.id("stops"), place: v.string() },
  handler: async (ctx, { stopId, place }) => {
    const stop = await ctx.db.get(stopId);
    if (stop !== null && stop.placeSource === "gps" && !stop.label) await ctx.db.patch(stopId, { label: place });
  },
});

function keyFor(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function placeFromNominatim(value: unknown) {
  const response = value as { address?: Record<string, string>; display_name?: string };
  const address = response.address ?? {};
  const parts = [
    address.neighbourhood ?? address.suburb ?? address.city_district,
    address.city ?? address.town ?? address.village ?? address.county,
    address.country,
  ].filter(Boolean);
  return [...new Set(parts)].join(", ") || response.display_name || "";
}

export const resolvePlaces = action({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }): Promise<{ groups: number; networkRequests: number }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to continue.");
    const stops: Doc<"stops">[] = await ctx.runQuery(internal.trips.pendingGeocodes, { tripId, ownerId: userId });
    let networkRequests = 0;
    for (const stop of stops) {
      const latitude = stop.latitude;
      const longitude = stop.longitude;
      if (latitude === undefined || longitude === undefined) continue;
      const coordinateKey = keyFor(latitude, longitude);
      const cached = await ctx.runQuery(internal.trips.cachedPlace, { coordinateKey });
      if (cached !== null) {
        await ctx.runMutation(internal.trips.applyCachedPlace, { stopId: stop._id, place: cached.place });
        continue;
      }
      if (networkRequests > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("zoom", "14");
      url.searchParams.set("addressdetails", "1");
      const response = await fetch(url, {
        headers: {
          "User-Agent": `Triplog/0.1 (${process.env.SITE_URL ?? "development"})`,
          "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(10_000),
      });
      networkRequests += 1;
      if (!response.ok) continue;
      const place = placeFromNominatim(await response.json());
      if (place) await ctx.runMutation(internal.trips.cacheAndApplyPlace, { stopId: stop._id, coordinateKey, latitude, longitude, place });
    }
    return { groups: stops.length, networkRequests };
  },
});

export const publish = mutation({
  args: { tripId: v.id("trips"), title: v.optional(v.string()) },
  handler: async (ctx, { tripId, title }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const [photo, cover, days, moments, existingLinks] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).first(),
      trip.coverPhotoId ? ctx.db.get(trip.coverPhotoId) : Promise.resolve(null),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("shareLinks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    if (!trip.destination?.trim() || trip.startDate === undefined || trip.endDate === undefined) throw new ConvexError("Confirm the destination and trip dates before sharing.");
    const cleanTitle = journeyTitle(title ?? trip.title);
    if (cleanTitle.length > MAX_TITLE_LENGTH) throw new ConvexError(`Keep the journey title under ${MAX_TITLE_LENGTH} characters.`);
    if (!cover || cover.tripId !== tripId || (cover.reviewState ?? "included") !== "included") throw new ConvexError("Choose a usable cover photograph before sharing.");
    if (!trip.recipientPreviewedAt) throw new ConvexError("Preview the recipient experience before sharing.");
    if (photo === null || days.length === 0 || moments.length === 0) throw new ConvexError("Finish reconstructing this journey before sharing.");
    if (trip.published && trip.shareToken) {
      const active = existingLinks.find((link) => link.token === trip.shareToken && link.revokedAt === undefined);
      if (active) return active.token;
    }
    const now = Date.now();
    for (const link of existingLinks) {
      if (link.revokedAt === undefined) await ctx.db.patch(link._id, { revokedAt: now });
    }
    const shareToken = crypto.randomUUID();
    await ctx.db.insert("shareLinks", { tripId, token: shareToken, createdAt: now });
    await ctx.db.patch(tripId, { title: cleanTitle, published: true, shareToken, processingStatus: "ready", updatedAt: now });
    return shareToken;
  },
});

export const unpublish = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    const [links, accessRecords] = await Promise.all([
      ctx.db.query("shareLinks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("shareAccess").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const now = Date.now();
    for (const link of links) {
      if (link.revokedAt === undefined) await ctx.db.patch(link._id, { revokedAt: now });
    }
    for (const record of accessRecords) await ctx.db.delete(record._id);
    await ctx.db.patch(tripId, { published: false, shareToken: undefined, updatedAt: now });
  },
});

async function requireActiveShare(ctx: QueryCtx | MutationCtx, token: string) {
  const viewerId = await requireUserId(ctx);
  const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
  if (link === null || link.revokedAt !== undefined) return null;
  const trip = await ctx.db.get(link.tripId);
  if (trip === null || trip.deletedAt !== undefined || !trip.published || trip.shareToken !== token) return null;
  return { viewerId, link, trip };
}

export const getShared = query({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const access = await requireActiveShare(ctx, shareToken);
    if (access === null) return null;
    const trip = await hydratedTrip(ctx, access.trip);
    const visibleDays = trip.days.filter((day) => day.stops.some((stop) => stop.moments.length > 0) || day.moments.length > 0);
    const selectedCover = trip.photos.find((photo) => photo._id === trip.coverPhotoId) ?? null;
    const sharedMoment = (moment: typeof trip.moments[number]) => ({
      startTime: moment.startTime,
      memory: moment.memory,
      recommendation: moment.recommendation,
      warning: moment.warning,
      detail: moment.detail,
      representativePhoto: moment.representativePhoto ? {
        url: moment.representativePhoto.url,
        fileName: moment.representativePhoto.fileName,
        width: moment.representativePhoto.width,
        height: moment.representativePhoto.height,
      } : null,
      photos: moment.photos.map((photo) => ({
        url: photo.url,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
      })),
    });
    return {
      title: journeyTitle(trip.title),
      destination: trip.destination ?? journeyTitle(trip.title),
      startDate: trip.startDate,
      endDate: trip.endDate,
      photoCount: trip.photoCount,
      groupedPhotoCount: trip.groupedPhotoCount,
      cover: selectedCover ? {
        url: selectedCover.displayUrl,
        fileName: selectedCover.fileName,
        width: selectedCover.width,
        height: selectedCover.height,
      } : null,
      days: visibleDays.map((day) => ({
        dayNumber: day.dayNumber,
        displayDate: day.displayDate,
        stops: day.stops.length
          ? day.stops.filter((stop) => stop.moments.length > 0).map((stop) => ({
            label: stop.label || "Place name unavailable",
            placeSource: stop.placeSource,
            confidence: stop.confidence,
            latitude: stop.latitude,
            longitude: stop.longitude,
            moments: stop.moments.map(sharedMoment),
          }))
          : [{
            label: day.place || "Location unknown",
            placeSource: day.placeSource === "missing" ? "unknown" as const : day.placeSource,
            confidence: day.placeSource === "missing" ? "low" as const : "high" as const,
            latitude: day.representativeLatitude,
            longitude: day.representativeLongitude,
            moments: day.moments.map(sharedMoment),
          }],
      })),
    };
  },
});

export const getSharePreview = query({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", shareToken)).unique();
    if (!link || link.revokedAt !== undefined) return null;
    const trip = await ctx.db.get(link.tripId);
    if (!trip || trip.deletedAt !== undefined || !trip.published || trip.shareToken !== shareToken) return null;
    const owner = await ctx.db.get(trip.ownerId);
    const cover = trip.coverPhotoId ? await ctx.db.get(trip.coverPhotoId) : null;
    return {
      creatorName: owner?.name?.trim() || "A Postcard traveller",
      destination: trip.destination ?? journeyTitle(trip.title),
      title: journeyTitle(trip.title),
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverUrl: cover ? await photoRoleUrl(ctx, cover.displayStorageId ?? cover.storageId) : null,
    };
  },
});

export const recordShareAccess = mutation({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const access = await requireActiveShare(ctx, shareToken);
    if (access === null) throw new ConvexError("This journey is private.");
    if (access.trip.ownerId === access.viewerId) return;
    const existing = await ctx.db.query("shareAccess").withIndex("by_link_viewer", (q) => q.eq("shareLinkId", access.link._id).eq("viewerId", access.viewerId)).unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { lastViewedAt: now });
    else await ctx.db.insert("shareAccess", {
      tripId: access.trip._id,
      shareLinkId: access.link._id,
      viewerId: access.viewerId,
      firstViewedAt: now,
      lastViewedAt: now,
    });
  },
});
