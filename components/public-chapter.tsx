"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Chapter } from "./chapter";

export function PublicChapter({ token }: { token: string }) {
  const trip = useQuery(api.trips.getPublic, { shareToken: token });
  if (trip === undefined) return <main className="center-message">Opening this chapter…</main>;
  if (trip === null) return <main className="not-found"><p className="wordmark">Triplog</p><h1>This trip is private.</h1><p>The owner may have unpublished it, or the link may be incomplete.</p></main>;
  return <main className="public-shell"><p className="public-brand">A journey preserved with <span>Triplog</span></p><Chapter {...trip} /><p className="osm-attribution public-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p></main>;
}
