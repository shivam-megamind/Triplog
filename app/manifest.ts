import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Postcard",
    short_name: "Postcard",
    description: "Reconstruct, keep, and privately share a completed journey from your photos.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe5",
    theme_color: "#244336",
    icons: [{ src: "/triplog-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
