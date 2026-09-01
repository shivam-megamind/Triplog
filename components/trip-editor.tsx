"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { JourneyWorkspace } from "./journey-workspace";
import { JourneysHome } from "./journeys-home";
import { PhotoOnboarding } from "./photo-onboarding";

export function TripEditor() {
  const trips = useQuery(api.trips.listMine);
  const { signOut } = useAuthActions();
  const [selectedId, setSelectedId] = useState<Id<"trips"> | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const activeId = startingNew ? undefined : selectedId ?? undefined;
  const trip = useQuery(api.trips.getOne, activeId ? { tripId: activeId } : "skip");

  async function leaveTriplog() {
    try {
      await signOut();
    } finally {
      window.location.replace("/");
    }
  }

  if (trips === undefined) return <div className="center-message">Opening your private trips…</div>;

  if (!trips.length || startingNew) {
    return (
      <PhotoOnboarding
        onComplete={(tripId) => { setSelectedId(tripId); setStartingNew(false); }}
        onCancel={trips.length ? () => setStartingNew(false) : undefined}
        onStart={() => setStartingNew(true)}
      />
    );
  }

  if (selectedId === null) {
    return (
      <JourneysHome
        trips={trips}
        onContinue={setSelectedId}
        onCreate={() => setStartingNew(true)}
        onSignOut={() => void leaveTriplog()}
      />
    );
  }

  if (trip === undefined) return <div className="center-message">Opening this journey…</div>;

  if (!trip) return <div className="center-message">This trip could not be opened.</div>;

  if (trip.photoCount === 0 || trip.momentCount === 0 || trip.processingStatus === "error") {
    return (
      <PhotoOnboarding
        existingTripId={trip._id}
        existingPhotoCount={trip.photoCount}
        onComplete={setSelectedId}
        onCancel={trips.length > 1 ? () => setSelectedId(trips.find((item) => item._id !== trip._id)?._id ?? trip._id) : undefined}
        initialError={trip.processingStatus === "error"
          ? trip.photoCount > 0
            ? "Triplog could not finish the first draft. Your saved photographs are safe; continue reconstruction to try again."
            : "The previous upload could not save its first photograph. Choose the trip photos again to restart safely."
          : undefined}
      />
    );
  }

  return (
    <JourneyWorkspace
      key={trip._id}
      trip={trip}
      trips={trips}
      onSelect={setSelectedId}
      onNew={() => setStartingNew(true)}
      onHome={() => setSelectedId(null)}
      onSignOut={() => void leaveTriplog()}
    />
  );
}
