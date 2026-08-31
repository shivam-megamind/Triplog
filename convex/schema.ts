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
  geocodeCache: defineTable({
    coordinateKey: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    place: v.string(),
    provider: v.literal("nominatim"),
    createdAt: v.number(),
  }).index("by_coordinate", ["coordinateKey"]),
});
