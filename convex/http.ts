import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { PHOTO_DELIVERY_PATH } from "../lib/photo-storage";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: PHOTO_DELIVERY_PATH,
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const storageId = new URL(request.url).searchParams.get("storageId") as Id<"_storage"> | null;
    if (storageId === null) return new Response("Photo storage ID is missing.", { status: 400 });
    try {
      const blob = await ctx.storage.get(storageId);
      if (blob === null) return new Response("Photo not found.", { status: 404 });
      return new Response(blob, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": blob.type || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Photo not found.", { status: 404 });
    }
  }),
});

export default http;
