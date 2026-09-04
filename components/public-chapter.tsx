"use client";

import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { JourneyTimeline } from "./journey-timeline";
import { AuthForm } from "./auth-form";
import { StoredPhotoImage as Image } from "./stored-photo-image";

function previewDates(startDate?: number, endDate?: number) {
  if (startDate === undefined || endDate === undefined) return "Trip dates";
  const format = (value: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function SignedOutPreview({ token }: { token: string }) {
  const preview = useQuery(api.trips.getSharePreview, { shareToken: token });
  if (preview === undefined) return <main className="center-message">Opening the shared preview…</main>;
  if (preview === null) return <main className="not-found"><p className="wordmark">Postcard</p><h1>This journey is private.</h1><p>The owner may have stopped sharing it.</p></main>;
  return <main className="share-gate"><section className="limited-preview">{preview.coverUrl ? <Image src={preview.coverUrl} alt={`Cover for ${preview.title}`} fill priority sizes="100vw" /> : null}<div><p className="eyebrow">A journey shared by {preview.creatorName}</p><h1>{preview.title}</h1><p>{preview.destination} · {previewDates(preview.startDate, preview.endDate)}</p><span>Sign in to open the complete read-only journey.</span></div></section><AuthForm context="share" initialMode="signIn" /></main>;
}

function SharedReader({ token }: { token: string }) {
  const router = useRouter();
  const trip = useQuery(api.trips.getShared, { shareToken: token });
  const recordAccess = useMutation(api.trips.recordShareAccess);
  const canRecord = trip !== undefined && trip !== null;

  useEffect(() => {
    if (!canRecord) return;
    void recordAccess({ shareToken: token });
  }, [canRecord, recordAccess, token]);

  if (trip === undefined) return <main className="center-message">Opening this journey…</main>;
  if (trip === null) return <main className="not-found"><p className="wordmark">Postcard</p><h1>This journey is private.</h1><p>The owner may have revoked the link, or the address may be incomplete.</p></main>;
  return (
    <main className="public-shell core-product">
      <header className="journey-bar shared-journey-bar"><button className="back-action" type="button" onClick={() => router.push("/book")}>← Your journeys</button><p className="journey-bar-title">Postcard · Read only</p><span /></header>
      <JourneyTimeline {...trip} readOnly />
      <p className="osm-attribution public-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
    </main>
  );
}

export function PublicChapter({ token }: { token: string }) {
  return (
    <>
      <AuthLoading><main className="center-message">Checking this private link…</main></AuthLoading>
      <Unauthenticated><SignedOutPreview token={token} /></Unauthenticated>
      <Authenticated><SharedReader token={token} /></Authenticated>
    </>
  );
}
