import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { MAX_PHOTOS } from "../lib/trip";
import { groupPhotosIntoMoments, groupedPhotoCount } from "../lib/reconstruction";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const processingStatus = v.union(
  v.literal("selecting"),
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

async function hydratedTrip(ctx: QueryCtx, trip: Doc<"trips">) {
  const [photos, days, moments] = await Promise.all([
    ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
  ]);
  const sortedPhotos = photos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
  const hydratedPhotos = await Promise.all(sortedPhotos.map(async (photo) => ({
    ...photo,
    url: await ctx.storage.getUrl(photo.storageId),
  })));
  const photoById = new Map(hydratedPhotos.map((photo) => [photo._id, photo]));
  const hydratedMoments = moments.sort((a, b) => a.sortOrder - b.sortOrder).map((moment) => ({
    ...moment,
    photos: moment.photoIds.flatMap((photoId) => {
      const photo = photoById.get(photoId);
      return photo ? [photo] : [];
    }),
    representativePhoto: photoById.get(moment.representativePhotoId) ?? null,
  }));
  const momentsByDay = new Map<Id<"days">, typeof hydratedMoments>();
  for (const moment of hydratedMoments) {
    const current = momentsByDay.get(moment.dayId);
    if (current) current.push(moment);
    else momentsByDay.set(moment.dayId, [moment]);
  }
  const sortedDays = days.sort((a, b) => a.dayNumber - b.dayNumber).map((day) => ({
    ...day,
    photos: hydratedPhotos.filter((photo) => (photo.dateKey ?? "undated") === day.dateKey),
    moments: momentsByDay.get(day._id) ?? [],
  }));
  return {
    ...trip,
    photoCount: hydratedPhotos.length,
    momentCount: hydratedMoments.length,
    groupedPhotoCount: groupedPhotoCount(hydratedMoments.map((moment) => ({
      key: moment.key,
      dateKey: moment.dateKey,
      photoIds: moment.photoIds,
      representativePhotoId: moment.representativePhotoId,
      startTime: moment.startTime,
    }))),
    days: sortedDays,
    moments: hydratedMoments,
    photos: hydratedPhotos,
  };
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const trips = await ctx.db.query("trips").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    return await Promise.all(trips.sort((a, b) => b.updatedAt - a.updatedAt).map(async (trip) => {
      const photoCount = trip.photoCount ?? (await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect()).length;
      return { _id: trip._id, title: trip.title, published: trip.published, updatedAt: trip.updatedAt, photoCount };
    }));
  },
});

export const getOne = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => await hydratedTrip(ctx, await requireOwnedTrip(ctx, tripId)),
});

export const create = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    const userId = await requireUserId(ctx);
    const cleanTitle = title?.trim() || "Untitled journey";
    return await ctx.db.insert("trips", {
      ownerId: userId,
      title: cleanTitle,
      published: false,
      processingStatus: "selecting",
      photoCount: 0,
      processedPhotoCount: 0,
      updatedAt: Date.now(),
    });
  },
});

export const updateTitle = mutation({
  args: { tripId: v.id("trips"), title: v.string() },
  handler: async (ctx, { tripId, title }) => {
    await requireOwnedTrip(ctx, tripId);
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new ConvexError("Give this trip a name.");
    await ctx.db.patch(tripId, { title: cleanTitle, updatedAt: Date.now() });
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
};

export const addPhoto = mutation({
  args: {
    tripId: v.id("trips"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    order: v.number(),
    ...photoMetadataArgs,
  },
  handler: async (ctx, args) => {
    const trip = await requireOwnedTrip(ctx, args.tripId);
    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", args.tripId)).collect();
    if (photos.length >= MAX_PHOTOS || args.order < 0 || args.order >= MAX_PHOTOS || args.fileSize > MAX_FILE_SIZE) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError(args.fileSize > MAX_FILE_SIZE ? "This photo is larger than 50 MB." : `A trip can hold up to ${MAX_PHOTOS} photos.`);
    }
    await ctx.db.insert("photos", { ...args, fileName: args.fileName.slice(0, 160) });
    await ctx.db.patch(trip._id, { photoCount: photos.length + 1, processedPhotoCount: photos.length + 1, updatedAt: Date.now() });
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
    const sorted = photos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
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
    const captured = sorted.flatMap((photo) => photo.capturedAt === undefined ? [] : [photo.capturedAt]);
    await ctx.db.patch(trip._id, {
      processingStatus: "grouping",
      startDate: captured.length ? Math.min(...captured) : undefined,
      endDate: captured.length ? Math.max(...captured) : undefined,
      photoCount: photos.length,
      updatedAt: Date.now(),
    });
    return { days: dateKeys.length, missingDates: photos.filter((photo) => !photo.hasDateMetadata).length };
  },
});

export const rebuildMoments = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const [photos, days, existingMoments] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const reconstructed = groupPhotosIntoMoments(photos.map((photo) => ({
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
    })));
    const dayByDate = new Map(days.map((day) => [day.dateKey, day]));
    const existingByKey = new Map(existingMoments.map((moment) => [moment.key, moment]));
    const retained = new Set<Id<"moments">>();
    for (const [index, moment] of reconstructed.entries()) {
      const day = dayByDate.get(moment.dateKey);
      if (!day) throw new ConvexError("A reconstructed day is missing.");
      const photoIds = moment.photoIds as Id<"photos">[];
      const representativePhotoId = moment.representativePhotoId as Id<"photos">;
      const existing = existingByKey.get(moment.key);
      if (existing) {
        retained.add(existing._id);
        await ctx.db.patch(existing._id, {
          dayId: day._id,
          sortOrder: index,
          startTime: moment.startTime,
          photoIds,
          representativePhotoId,
        });
      } else {
        const momentId = await ctx.db.insert("moments", {
          tripId,
          dayId: day._id,
          key: moment.key,
          dateKey: moment.dateKey,
          sortOrder: index,
          startTime: moment.startTime,
          photoIds,
          representativePhotoId,
          memory: "",
          recommendation: "",
          warning: "",
          detail: "",
        });
        retained.add(momentId);
      }
    }
    for (const moment of existingMoments) {
      if (!retained.has(moment._id)) await ctx.db.delete(moment._id);
    }
    await ctx.db.patch(trip._id, { processingStatus: "shaping", updatedAt: Date.now() });
    return { moments: reconstructed.length, groupedPhotos: groupedPhotoCount(reconstructed) };
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
    await ctx.db.patch(moment._id, {
      memory: args.memory.trim().slice(0, 2_000),
      recommendation: args.recommendation.trim().slice(0, 2_000),
      warning: args.warning.trim().slice(0, 2_000),
      detail: args.detail.trim().slice(0, 2_000),
    });
    await ctx.db.patch(moment.tripId, { updatedAt: Date.now() });
  },
});

export const pendingGeocodes = internalQuery({
  args: { tripId: v.id("trips"), ownerId: v.id("users") },
  handler: async (ctx, { tripId, ownerId }) => {
    const trip = await ctx.db.get(tripId);
    if (trip === null || trip.ownerId !== ownerId) return [];
    const days = await ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    return days.filter((day) => !day.place && day.representativeLatitude !== undefined && day.representativeLongitude !== undefined).sort((a, b) => a.dayNumber - b.dayNumber);
  },
});

export const cachedPlace = internalQuery({
  args: { coordinateKey: v.string() },
  handler: async (ctx, { coordinateKey }) => await ctx.db.query("geocodeCache").withIndex("by_coordinate", (q) => q.eq("coordinateKey", coordinateKey)).first(),
});

export const cacheAndApplyPlace = internalMutation({
  args: { dayId: v.id("days"), coordinateKey: v.string(), latitude: v.number(), longitude: v.number(), place: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db.query("geocodeCache").withIndex("by_coordinate", (q) => q.eq("coordinateKey", args.coordinateKey)).first();
    if (cached === null) await ctx.db.insert("geocodeCache", { coordinateKey: args.coordinateKey, latitude: args.latitude, longitude: args.longitude, place: args.place, provider: "nominatim", createdAt: Date.now() });
    const day = await ctx.db.get(args.dayId);
    if (day !== null && !day.place) await ctx.db.patch(day._id, { place: args.place, placeSource: "gps" });
  },
});

export const applyCachedPlace = internalMutation({
  args: { dayId: v.id("days"), place: v.string() },
  handler: async (ctx, { dayId, place }) => {
    const day = await ctx.db.get(dayId);
    if (day !== null && !day.place) await ctx.db.patch(dayId, { place, placeSource: "gps" });
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
    const days: Doc<"days">[] = await ctx.runQuery(internal.trips.pendingGeocodes, { tripId, ownerId: userId });
    let networkRequests = 0;
    for (const day of days) {
      const latitude = day.representativeLatitude;
      const longitude = day.representativeLongitude;
      if (latitude === undefined || longitude === undefined) continue;
      const coordinateKey = keyFor(latitude, longitude);
      const cached = await ctx.runQuery(internal.trips.cachedPlace, { coordinateKey });
      if (cached !== null) {
        await ctx.runMutation(internal.trips.applyCachedPlace, { dayId: day._id, place: cached.place });
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
      });
      networkRequests += 1;
      if (!response.ok) continue;
      const place = placeFromNominatim(await response.json());
      if (place) await ctx.runMutation(internal.trips.cacheAndApplyPlace, { dayId: day._id, coordinateKey, latitude, longitude, place });
    }
    return { groups: days.length, networkRequests };
  },
});

function hasTravellerWords(moment: Doc<"moments">) {
  return [moment.memory, moment.recommendation, moment.warning, moment.detail].some((value) => value.trim());
}

export const publish = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const [photo, days, moments, existingLinks] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).first(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("moments").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("shareLinks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    if (trip.title.trim() === "Untitled journey") throw new ConvexError("Give this trip a name before sharing.");
    if (photo === null || days.length === 0 || moments.length === 0) throw new ConvexError("Finish reconstructing this journey before sharing.");
    if (!moments.some(hasTravellerWords)) throw new ConvexError("Add at least one detail in your own words before sharing.");
    const now = Date.now();
    for (const link of existingLinks) {
      if (link.revokedAt === undefined) await ctx.db.patch(link._id, { revokedAt: now });
    }
    const shareToken = crypto.randomUUID();
    await ctx.db.insert("shareLinks", { tripId, token: shareToken, createdAt: now });
    await ctx.db.patch(tripId, { published: true, shareToken, processingStatus: "ready", updatedAt: now });
    return shareToken;
  },
});

export const unpublish = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    const links = await ctx.db.query("shareLinks").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    const now = Date.now();
    for (const link of links) {
      if (link.revokedAt === undefined) await ctx.db.patch(link._id, { revokedAt: now });
    }
    await ctx.db.patch(tripId, { published: false, shareToken: undefined, updatedAt: now });
  },
});

async function requireActiveShare(ctx: QueryCtx | MutationCtx, token: string) {
  const viewerId = await requireUserId(ctx);
  const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", token)).unique();
  if (link === null || link.revokedAt !== undefined) return null;
  const trip = await ctx.db.get(link.tripId);
  if (trip === null || !trip.published || trip.shareToken !== token) return null;
  return { viewerId, link, trip };
}

export const getShared = query({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const access = await requireActiveShare(ctx, shareToken);
    if (access === null) return null;
    const trip = await hydratedTrip(ctx, access.trip);
    return {
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      photoCount: trip.photoCount,
      groupedPhotoCount: trip.groupedPhotoCount,
      days: trip.days.map((day) => ({
        dayNumber: day.dayNumber,
        displayDate: day.displayDate,
        place: day.place,
        moments: day.moments.map((moment) => ({
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
        })),
      })),
    };
  },
});

export const recordShareAccess = mutation({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const access = await requireActiveShare(ctx, shareToken);
    if (access === null) throw new ConvexError("This journey is private.");
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
