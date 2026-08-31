import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  trips: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    dayLabel: v.optional(v.string()),
    place: v.optional(v.string()),
    memory: v.optional(v.string()),
    published: v.boolean(),
    shareToken: v.optional(v.string()),
    processingStatus: v.optional(v.union(
      v.literal("selecting"),
      v.literal("reading"),
      v.literal("ordering"),
      v.literal("grouping"),
      v.literal("shaping"),
      v.literal("ready"),
      v.literal("error"),
    )),
    photoCount: v.optional(v.number()),
    processedPhotoCount: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_share_token", ["shareToken"]),
  photos: defineTable({
    tripId: v.id("trips"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    order: v.number(),
    capturedAt: v.optional(v.number()),
    dateKey: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    hasDateMetadata: v.optional(v.boolean()),
    hasGpsMetadata: v.optional(v.boolean()),
    orientation: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    exactHash: v.optional(v.string()),
    visualHash: v.optional(v.string()),
  }).index("by_trip", ["tripId"]),
  days: defineTable({
    tripId: v.id("trips"),
    dateKey: v.string(),
    dayNumber: v.number(),
    displayDate: v.string(),
    place: v.string(),
    placeSource: v.union(v.literal("gps"), v.literal("manual"), v.literal("missing")),
    representativeLatitude: v.optional(v.number()),
    representativeLongitude: v.optional(v.number()),
    memory: v.string(),
  })
    .index("by_trip", ["tripId"])
    .index("by_trip_date", ["tripId", "dateKey"]),
  moments: defineTable({
    tripId: v.id("trips"),
    dayId: v.id("days"),
    key: v.string(),
    dateKey: v.string(),
    sortOrder: v.number(),
    startTime: v.optional(v.number()),
    photoIds: v.array(v.id("photos")),
    representativePhotoId: v.id("photos"),
    memory: v.string(),
    recommendation: v.string(),
    warning: v.string(),
    detail: v.string(),
  })
    .index("by_trip", ["tripId"])
    .index("by_trip_key", ["tripId", "key"]),
  geocodeCache: defineTable({
    coordinateKey: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    place: v.string(),
    provider: v.literal("nominatim"),
    createdAt: v.number(),
  }).index("by_coordinate", ["coordinateKey"]),
  shareLinks: defineTable({
    tripId: v.id("trips"),
    token: v.string(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_trip", ["tripId"])
    .index("by_token", ["token"]),
  shareAccess: defineTable({
    tripId: v.id("trips"),
    shareLinkId: v.id("shareLinks"),
    viewerId: v.id("users"),
    firstViewedAt: v.number(),
    lastViewedAt: v.number(),
  })
    .index("by_link_viewer", ["shareLinkId", "viewerId"])
    .index("by_trip", ["tripId"]),
});
