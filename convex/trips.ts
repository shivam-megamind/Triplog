import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_PHOTOS = 6;

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

async function hydratedTrip(ctx: QueryCtx, trip: Doc<"trips">) {
  const [photos, days] = await Promise.all([
    ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
  ]);
  const sortedPhotos = photos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
  return {
    ...trip,
    days: days.sort((a, b) => a.dayNumber - b.dayNumber).map((day) => ({
      ...day,
      photos: sortedPhotos.filter((photo) => (photo.dateKey ?? "undated") === day.dateKey),
    })),
    photos: await Promise.all(sortedPhotos.map(async (photo) => ({ ...photo, url: await ctx.storage.getUrl(photo.storageId) }))),
  };
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const trips = await ctx.db.query("trips").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
    return await Promise.all(trips.sort((a, b) => b.updatedAt - a.updatedAt).map(async (trip) => {
      const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect();
      return { _id: trip._id, title: trip.title, published: trip.published, updatedAt: trip.updatedAt, photoCount: photos.length };
    }));
  },
});

export const getOne = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => await hydratedTrip(ctx, await requireOwnedTrip(ctx, tripId)),
});

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const trip = await ctx.db.query("trips").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first();
    if (trip === null) return null;
    return await hydratedTrip(ctx, trip);
  },
});

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    const userId = await requireUserId(ctx);
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new ConvexError("Give this trip a name.");
    return await ctx.db.insert("trips", { ownerId: userId, title: cleanTitle, published: false, updatedAt: Date.now() });
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

export const generateUploadUrl = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect();
    if (photos.length >= MAX_PHOTOS) throw new ConvexError("This first trip can hold up to six photos.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const addPhoto = mutation({
  args: {
    tripId: v.id("trips"), storageId: v.id("_storage"), fileName: v.string(),
    capturedAt: v.optional(v.number()), dateKey: v.string(),
    latitude: v.optional(v.number()), longitude: v.optional(v.number()),
    hasDateMetadata: v.boolean(), hasGpsMetadata: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireOwnedTrip(ctx, args.tripId);
    const photos = await ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", args.tripId)).collect();
    if (photos.length >= MAX_PHOTOS) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("This first trip can hold up to six photos.");
    }
    await ctx.db.insert("photos", { ...args, fileName: args.fileName.slice(0, 160), order: photos.length });
  },
});

export const updatePhotoMetadata = mutation({
  args: {
    photoId: v.id("photos"), capturedAt: v.optional(v.number()), dateKey: v.string(),
    latitude: v.optional(v.number()), longitude: v.optional(v.number()),
    hasDateMetadata: v.boolean(), hasGpsMetadata: v.boolean(),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (photo === null) throw new ConvexError("Photo not found.");
    await requireOwnedTrip(ctx, photo.tripId);
    await ctx.db.patch(photo._id, {
      capturedAt: args.capturedAt, dateKey: args.dateKey,
      latitude: args.latitude, longitude: args.longitude,
      hasDateMetadata: args.hasDateMetadata, hasGpsMetadata: args.hasGpsMetadata,
    });
  },
});

export const rebuildDays = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await requireOwnedTrip(ctx, tripId);
    const [photos, existingDays] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    const sorted = photos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
    const dateKeys = [...new Set(sorted.map((photo) => photo.dateKey ?? "undated"))];
    for (const [index, dateKey] of dateKeys.entries()) {
      const groupPhotos = sorted.filter((photo) => (photo.dateKey ?? "undated") === dateKey);
      const representative = groupPhotos.find((photo) => photo.latitude !== undefined && photo.longitude !== undefined);
      const existing = existingDays.find((day) => day.dateKey === dateKey);
      const displayDate = dateKey === "undated" ? "" : new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`));
      if (existing === undefined) {
        await ctx.db.insert("days", {
          tripId, dateKey, dayNumber: index + 1, displayDate, place: "", placeSource: "missing", memory: "",
          representativeLatitude: representative?.latitude, representativeLongitude: representative?.longitude,
        });
      } else {
        const coordinateChanged = existing.representativeLatitude !== representative?.latitude || existing.representativeLongitude !== representative?.longitude;
        await ctx.db.patch(existing._id, {
          dayNumber: index + 1,
          representativeLatitude: representative?.latitude,
          representativeLongitude: representative?.longitude,
          ...(coordinateChanged && existing.placeSource === "gps" ? { place: "", placeSource: "missing" as const } : {}),
        });
      }
    }
  },
});

export const saveDay = mutation({
  args: { dayId: v.id("days"), displayDate: v.string(), place: v.string(), memory: v.string() },
  handler: async (ctx, args) => {
    const day = await ctx.db.get(args.dayId);
    if (day === null) throw new ConvexError("Day not found.");
    await requireOwnedTrip(ctx, day.tripId);
    const displayDate = args.displayDate.trim();
    const place = args.place.trim();
    if (!displayDate || !place) throw new ConvexError("Confirm the date and place.");
    await ctx.db.patch(day._id, { displayDate, place, memory: args.memory.trim(), placeSource: place === day.place ? day.placeSource : "manual" });
    await ctx.db.patch(day.tripId, { updatedAt: Date.now() });
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
  const parts = [address.neighbourhood ?? address.suburb ?? address.city_district, address.city ?? address.town ?? address.village ?? address.county, address.country].filter(Boolean);
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
      url.searchParams.set("format", "jsonv2"); url.searchParams.set("lat", String(latitude)); url.searchParams.set("lon", String(longitude)); url.searchParams.set("zoom", "14"); url.searchParams.set("addressdetails", "1");
      const response = await fetch(url, { headers: { "User-Agent": `Triplog/0.1 (${process.env.SITE_URL ?? "development"})`, "Accept-Language": "en" } });
      networkRequests += 1;
      if (!response.ok) continue;
      const place = placeFromNominatim(await response.json());
      if (place) await ctx.runMutation(internal.trips.cacheAndApplyPlace, { dayId: day._id, coordinateKey, latitude, longitude, place });
    }
    return { groups: days.length, networkRequests };
  },
});

export const publish = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const trip = await requireOwnedTrip(ctx, tripId);
    const [photo, days] = await Promise.all([
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", tripId)).first(),
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", tripId)).collect(),
    ]);
    if (photo === null || days.length === 0 || days.some((day) => !day.displayDate || !day.place || !day.memory)) throw new ConvexError("Complete every day before publishing.");
    const shareToken = trip.shareToken ?? crypto.randomUUID();
    await ctx.db.patch(tripId, { published: true, shareToken, updatedAt: Date.now() });
    return shareToken;
  },
});

export const unpublish = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => { await requireOwnedTrip(ctx, tripId); await ctx.db.patch(tripId, { published: false, updatedAt: Date.now() }); },
});

export const getPublic = query({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const trip = await ctx.db.query("trips").withIndex("by_share_token", (q) => q.eq("shareToken", shareToken)).unique();
    if (trip === null || !trip.published) return null;
    const [days, photos] = await Promise.all([
      ctx.db.query("days").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
      ctx.db.query("photos").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect(),
    ]);
    if (days.length === 0 || days.some((day) => !day.displayDate || !day.place || !day.memory)) return null;
    const sortedPhotos = photos.sort((a, b) => photoTime(a) - photoTime(b) || a.order - b.order);
    return {
      title: trip.title,
      days: await Promise.all(days.sort((a, b) => a.dayNumber - b.dayNumber).map(async (day) => ({
        dayNumber: day.dayNumber, displayDate: day.displayDate, place: day.place, memory: day.memory,
        photos: await Promise.all(sortedPhotos.filter((photo) => (photo.dateKey ?? "undated") === day.dateKey).map(async (photo) => ({ url: await ctx.storage.getUrl(photo.storageId), alt: `${day.place} — ${photo.fileName}` }))),
      }))),
    };
  },
});
