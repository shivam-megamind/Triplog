"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { canRetryProcessing, journeyEntryView, shouldOfferReconstructionRetry } from "@/lib/trip";
import { JourneyWorkspace } from "./journey-workspace";
import { JourneysHome } from "./journeys-home";
import { JourneySetup } from "./journey-setup";
import { PhotoOnboarding } from "./photo-onboarding";

export function TripEditor() {
  const trips = useQuery(api.trips.listMine);
  const sharedTrips = useQuery(api.trips.listSharedWithMe);
  const deletedTrips = useQuery(api.trips.listDeleted);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const queueProcessing = useMutation(api.trips.queueProcessing);
  const [selectedId, setSelectedId] = useState<Id<"trips"> | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const [managingPhotos, setManagingPhotos] = useState(false);
  const [previewTripId, setPreviewTripId] = useState<Id<"trips"> | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const openedEmailLink = useRef(false);
  const activeId = startingNew ? undefined : selectedId ?? undefined;
  const trip = useQuery(api.trips.getOne, activeId ? { tripId: activeId } : "skip");

  useEffect(() => {
    if (!trips || openedEmailLink.current) return;
    openedEmailLink.current = true;
    const requested = new URLSearchParams(window.location.search).get("journey");
    const match = trips.find((item) => item._id === requested);
    if (!match) return;
    const timer = window.setTimeout(() => setSelectedId(match._id), 0);
    return () => window.clearTimeout(timer);
  }, [trips]);

  async function leaveTriplog() {
    try {
      await signOut();
    } finally {
      window.location.replace("/");
    }
  }

  async function retryReconstruction(tripId: Id<"trips">) {
    setRetrying(true);
    setRetryError("");
    try {
      await queueProcessing({ tripId });
    } catch {
      setRetryError("Reconstruction could not be restarted. Your saved photos are safe; try again.");
    } finally {
      setRetrying(false);
    }
  }

  if (trips === undefined || sharedTrips === undefined || deletedTrips === undefined) return <div className="center-message">Opening your private trips…</div>;

  if (startingNew) {
    return <JourneySetup onCancel={() => setStartingNew(false)} onCreated={(tripId) => { setSelectedId(tripId); setStartingNew(false); }} />;
  }

  if (selectedId === null) {
    return (
      <JourneysHome
        trips={trips}
        sharedTrips={sharedTrips}
        deletedTrips={deletedTrips}
        onContinue={setSelectedId}
        onOpenShared={(shareToken) => router.push(`/share/${shareToken}`)}
        onCreate={() => setStartingNew(true)}
        onSignOut={() => void leaveTriplog()}
      />
    );
  }

  if (trip === undefined) return <div className="center-message">Opening this journey…</div>;

  if (!trip) return <div className="center-message">This trip could not be opened.</div>;

  const entryView = journeyEntryView({
    photoCount: trip.photoCount,
    momentCount: trip.momentCount,
    processingStatus: trip.processingStatus,
    managingPhotos,
  });

  if (entryView === "photos") {
    return (
      <PhotoOnboarding
        existingTripId={trip._id}
        existingPhotoCount={trip.photoCount}
        reconstructionNeeded={shouldOfferReconstructionRetry(trip.photoCount, trip.processingStatus, trip.momentCount)}
        onComplete={(tripId) => { setSelectedId(tripId); setManagingPhotos(false); }}
        onCancel={() => { if (trip.photoCount) setManagingPhotos(false); else setSelectedId(null); }}
        initialError={trip.processingStatus === "error"
          ? trip.photoCount > 0
            ? "Triplog could not finish the first draft. Your saved photographs are safe; continue reconstruction to try again."
            : "The previous upload could not save its first photograph. Choose the trip photos again to restart safely."
          : undefined}
      />
    );
  }

  if (entryView === "processing") {
    return (
      <main className="processing-shell core-product">
        <section className="processing-card" aria-live="polite">
          <p className="timeline-label">Reconstructing your timeline</p>
          <h1>{trip.title}</h1>
          <p>Triplog is organising {trip.photoCount} saved photo{trip.photoCount === 1 ? "" : "s"} into dates, stops, and moments.</p>
          <progress max={Math.max(1, trip.photoCount)} value={Math.min(trip.processedPhotoCount ?? 0, trip.photoCount)}>{trip.processedPhotoCount ?? 0} of {trip.photoCount}</progress>
          <p>This page will open the timeline automatically when reconstruction is ready. Your saved photos will not be uploaded again.</p>
          {retryError ? <p className="form-error" role="alert">{retryError}</p> : null}
          <div className="processing-actions">
            {canRetryProcessing(trip.processingStatus) ? <button className="primary-button" type="button" disabled={retrying} onClick={() => void retryReconstruction(trip._id)}>{retrying ? "Restarting…" : "Retry reconstruction"}</button> : null}
            <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>Back to Your journeys</button>
          </div>
        </section>
      </main>
    );
  }

  if (entryView === "error") {
    return (
      <main className="processing-shell core-product">
        <section className="processing-card" aria-live="polite">
          <p className="timeline-label">Reconstruction stopped</p>
          <h1>{trip.title}</h1>
          <p>Triplog could not finish this timeline. All {trip.photoCount} saved photo{trip.photoCount === 1 ? " is" : "s are"} still safe.</p>
          {retryError ? <p className="form-error" role="alert">{retryError}</p> : null}
          <div className="processing-actions">
            <button className="primary-button" type="button" disabled={retrying} onClick={() => void retryReconstruction(trip._id)}>{retrying ? "Restarting…" : "Retry reconstruction"}</button>
            <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>Back to Your journeys</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <JourneyWorkspace
      key={trip._id}
      trip={trip}
      onNew={() => setStartingNew(true)}
      onHome={() => { setPreviewTripId(null); setSelectedId(null); }}
      onManagePhotos={() => setManagingPhotos(true)}
      onSignOut={() => void leaveTriplog()}
      recipientPreview={previewTripId === trip._id}
      onRecipientPreviewChange={(open) => setPreviewTripId(open ? trip._id : null)}
    />
  );
}
