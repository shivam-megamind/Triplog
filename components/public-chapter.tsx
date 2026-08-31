"use client";

import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { AuthForm } from "./auth-form";
import { Chapter } from "./chapter";

function SharedReader({ token }: { token: string }) {
  const trip = useQuery(api.trips.getShared, { shareToken: token });
  const recordAccess = useMutation(api.trips.recordShareAccess);
  const canRecord = trip !== undefined && trip !== null;

  useEffect(() => {
    if (!canRecord) return;
    void recordAccess({ shareToken: token });
  }, [canRecord, recordAccess, token]);

  if (trip === undefined) return <main className="center-message">Opening this journey…</main>;
  if (trip === null) return <main className="not-found"><p className="wordmark">Triplog</p><h1>This journey is private.</h1><p>The owner may have revoked the link, or the address may be incomplete.</p></main>;
  return (
    <main className="public-shell">
      <p className="public-brand">A journey preserved with <span>Triplog</span> · Read only</p>
      <Chapter {...trip} />
      <p className="osm-attribution public-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
    </main>
  );
}

export function PublicChapter({ token }: { token: string }) {
  return (
    <>
      <AuthLoading><main className="center-message">Checking this private link…</main></AuthLoading>
      <Unauthenticated><AuthForm context="share" /></Unauthenticated>
      <Authenticated><SharedReader token={token} /></Authenticated>
    </>
  );
}
