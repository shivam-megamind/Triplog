import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  trips: defineTable({
    ownerId: v.id("users"),
    creationRequestId: v.optional(v.string()),
    destination: v.optional(v.string()),
    title: v.string(),
    titleSource: v.optional(v.union(v.literal("default"), v.literal("user"))),
    dayLabel: v.optional(v.string()),
    place: v.optional(v.string()),
    memory: v.optional(v.string()),
    published: v.boolean(),
    shareToken: v.optional(v.string()),
    processingStatus: v.optional(v.union(
      v.literal("selecting"),
      v.literal("queued"),
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
    titleConfirmed: v.optional(v.boolean()),
    coverPhotoId: v.optional(v.id("photos")),
    coverConfirmed: v.optional(v.boolean()),
    recipientPreviewedAt: v.optional(v.number()),
    completionLevel: v.optional(v.union(
      v.literal("automatic"),
      v.literal("usable"),
      v.literal("enriched"),
    )),
    deletedAt: v.optional(v.number()),
    purgeAt: v.optional(v.number()),
    readyEmailQueuedAt: v.optional(v.number()),
    readyEmailSentAt: v.optional(v.number()),
    readyEmailId: v.optional(v.string()),
    readyEmailError: v.optional(v.string()),
    readyEmailAttempts: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_request", ["ownerId", "creationRequestId"])
    .index("by_share_token", ["shareToken"]),
  photos: defineTable({
    tripId: v.id("trips"),
    storageId: v.id("_storage"),
    storageLayout: v.optional(v.literal("single_optimized_v1")),
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
    uploadKey: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    displayStorageId: v.optional(v.id("_storage")),
    largeStorageId: v.optional(v.id("_storage")),
    reviewState: v.optional(v.union(
      v.literal("included"),
      v.literal("possibly_unrelated"),
      v.literal("unplaced"),
      v.literal("removed"),
    )),
    placementConfidence: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    placementConfirmed: v.optional(v.boolean()),
    quality: v.optional(v.union(v.literal("clear"), v.literal("dark"), v.literal("blurry"), v.literal("dark_blurry"))),
  }).index("by_trip", ["tripId"]),
  uploadItems: defineTable({
    tripId: v.id("trips"),
    ownerId: v.id("users"),
    uploadKey: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    order: v.number(),
    status: v.union(v.literal("pending"), v.literal("uploading"), v.literal("uploaded"), v.literal("failed")),
    attempts: v.number(),
    photoId: v.optional(v.id("photos")),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_trip", ["tripId"])
    .index("by_trip_key", ["tripId", "uploadKey"])
    .index("by_owner", ["ownerId"]),
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
  stops: defineTable({
    tripId: v.id("trips"),
    dayId: v.id("days"),
    key: v.string(),
    dateKey: v.string(),
    sortOrder: v.number(),
    label: v.string(),
    placeSource: v.union(v.literal("gps"), v.literal("manual"), v.literal("unknown")),
    confidence: v.union(v.literal("high"), v.literal("low")),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    photoIds: v.array(v.id("photos")),
  })
    .index("by_trip", ["tripId"])
    .index("by_day", ["dayId"])
    .index("by_trip_key", ["tripId", "key"]),
  moments: defineTable({
    tripId: v.id("trips"),
    dayId: v.id("days"),
    stopId: v.optional(v.id("stops")),
    key: v.string(),
    dateKey: v.string(),
    sortOrder: v.number(),
    startTime: v.optional(v.number()),
    photoIds: v.array(v.id("photos")),
    representativePhotoId: v.optional(v.id("photos")),
    representativeSource: v.optional(v.union(v.literal("system"), v.literal("user"))),
    placementSource: v.optional(v.union(v.literal("system"), v.literal("user"))),
    manuallyAdded: v.optional(v.boolean()),
    removed: v.optional(v.boolean()),
    promptSkipped: v.optional(v.boolean()),
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
    .index("by_trip", ["tripId"])
    .index("by_viewer", ["viewerId"]),
});
