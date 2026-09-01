"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type TripSummary = FunctionReturnType<typeof api.trips.listMine>[number];

function updatedLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

export function JourneysHome({
  trips,
  onContinue,
  onCreate,
  onSignOut,
}: {
  trips: TripSummary[];
  onContinue: (tripId: Id<"trips">) => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="journeys-home">
      <header className="journeys-home-header">
        <p className="wordmark">Triplog</p>
        <button className="text-button" onClick={onSignOut}>Sign out</button>
      </header>
      <section className="journeys-home-intro" aria-labelledby="journeys-title">
        <div>
          <p className="eyebrow">Your private travel library</p>
          <h1 id="journeys-title">Your journeys</h1>
          <p>Return to a trip you have already shaped, or begin with another camera roll.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>Create a new trip</button>
      </section>
      <section className="journey-library" aria-label="Saved journeys">
        {trips.map((trip) => (
          <article className="journey-library-item" key={trip._id}>
            <div className="journey-library-status">
              <span className={trip.published ? "status-dot published" : "status-dot"} />
              {trip.published ? "Shared by link" : "Private to you"}
            </div>
            <div>
              <h2>{trip.title}</h2>
              <p>{trip.photoCount} photo{trip.photoCount === 1 ? "" : "s"} · Updated {updatedLabel(trip.updatedAt)}</p>
            </div>
            <button className="secondary-button" onClick={() => onContinue(trip._id)}>Continue this journey</button>
          </article>
        ))}
      </section>
    </main>
  );
}
