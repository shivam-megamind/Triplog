"use client";

import Image from "next/image";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateInputTimestamp, journeyDetailsChanged, journeyDetailsErrors, journeyDetailsInput, MAX_DESTINATION_LENGTH, MAX_TITLE_LENGTH, type JourneyDetailsErrors, type JourneyDetailsInput } from "@/lib/trip";

type TripSummary = FunctionReturnType<typeof api.trips.listMine>[number];
type SharedTripSummary = FunctionReturnType<typeof api.trips.listSharedWithMe>[number];
type DeletedTripSummary = FunctionReturnType<typeof api.trips.listDeleted>[number];

function updatedLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

function tripDates(startDate?: number, endDate?: number) {
  if (startDate === undefined || endDate === undefined) return "Dates to confirm";
  const format = (value: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function processingLabel(status: TripSummary["processingStatus"]) {
  if (status === "error") return "Failed — your saved photos are safe";
  if (status === "ready") return "Ready";
  if (status === "selecting") return "Waiting for photos";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function JourneysHome({
  trips,
  sharedTrips,
  deletedTrips,
  onContinue,
  onOpenShared,
  onCreate,
  onSignOut,
}: {
  trips: TripSummary[];
  sharedTrips: SharedTripSummary[];
  deletedTrips: DeletedTripSummary[];
  onContinue: (tripId: Id<"trips">) => void;
  onOpenShared: (shareToken: string) => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  const updateTitle = useMutation(api.trips.updateTitle);
  const updateDetails = useMutation(api.trips.updateDetails);
  const deleteTrip = useMutation(api.trips.deleteTrip);
  const restoreTrip = useMutation(api.trips.restoreTrip);
  const permanentlyDeleteTrip = useMutation(api.trips.permanentlyDeleteTrip);
  const [view, setView] = useState<"mine" | "shared" | "deleted">("mine");
  const [renamingId, setRenamingId] = useState<Id<"trips"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"trips"> | null>(null);
  const [editingDetailsId, setEditingDetailsId] = useState<Id<"trips"> | null>(null);
  const [title, setTitle] = useState("");
  const [detailsInput, setDetailsInput] = useState<JourneyDetailsInput>({ destination: "", startDate: "", endDate: "" });
  const [detailsErrors, setDetailsErrors] = useState<JourneyDetailsErrors>({});
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<{ tripId: Id<"trips">; text: string; error?: boolean } | null>(null);
  const actionLock = useRef(false);

  function beginRename(trip: TripSummary) {
    setRenamingId(trip._id);
    setDeletingId(null);
    setEditingDetailsId(null);
    setTitle(trip.title);
    setFeedback(null);
  }

  function beginDetailsEdit(trip: TripSummary) {
    setEditingDetailsId(trip._id);
    setRenamingId(null);
    setDeletingId(null);
    setDetailsInput(journeyDetailsInput({ destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate }));
    setDetailsErrors({});
    setFeedback(null);
  }

  function cancelDetailsEdit() {
    setEditingDetailsId(null);
    setDetailsErrors({});
  }

  async function saveDetails(trip: TripSummary) {
    if (actionLock.current) return;
    const values = {
      destination: detailsInput.destination,
      startDate: dateInputTimestamp(detailsInput.startDate),
      endDate: dateInputTimestamp(detailsInput.endDate),
    };
    const nextErrors = journeyDetailsErrors(values);
    setDetailsErrors(nextErrors);
    setFeedback(null);
    if (Object.keys(nextErrors).length) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await updateDetails({
        tripId: trip._id,
        destination: detailsInput.destination.trim(),
        startDate: values.startDate!,
        endDate: values.endDate!,
      });
      setEditingDetailsId(null);
      setFeedback({ tripId: trip._id, text: "Trip details saved. The timeline is being reconstructed from the same photos." });
    } catch {
      setFeedback({ tripId: trip._id, text: "These trip details could not be saved. Check them and try again.", error: true });
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }

  async function saveRename(tripId: Id<"trips">) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await updateTitle({ tripId, title });
      setRenamingId(null);
      setFeedback({ tripId, text: "Saved" });
    } catch {
      setFeedback({ tripId, text: "Add a title before saving.", error: true });
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }

  async function confirmDelete(tripId: Id<"trips">) {
    setBusy(true);
    setFeedback(null);
    try {
      await deleteTrip({ tripId });
      setDeletingId(null);
    } catch {
      setFeedback({ tripId, text: "This journey could not be deleted. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function restore(tripId: Id<"trips">) {
    setBusy(true);
    try { await restoreTrip({ tripId }); }
    finally { setBusy(false); }
  }

  async function erase(tripId: Id<"trips">, title: string) {
    if (!window.confirm(`Permanently delete “${title}”? This erases originals, viewing copies, memories, and sharing access. It cannot be undone.`)) return;
    setBusy(true);
    try { await permanentlyDeleteTrip({ tripId }); }
    finally { setBusy(false); }
  }

  return (
    <main className="journeys-home core-product">
      <header className="journeys-home-header">
        <p className="wordmark">Triplog</p>
        <button className="text-button" onClick={onSignOut}>Sign out</button>
      </header>
      <section className="journeys-home-intro" aria-labelledby="journeys-title">
        <div>
          <p className="eyebrow">Your trips</p>
          <h1 id="journeys-title">Your journeys</h1>
          <p>Continue a trip in progress or revisit a finished timeline.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>Create journey</button>
      </section>

      <div className="journey-library-tabs" role="tablist" aria-label="Journey library">
        <button role="tab" aria-selected={view === "mine"} className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>My journeys <span>{trips.length}</span></button>
        <button role="tab" aria-selected={view === "shared"} className={view === "shared" ? "active" : ""} onClick={() => setView("shared")}>Shared with me <span>{sharedTrips.length}</span></button>
        <button role="tab" aria-selected={view === "deleted"} className={view === "deleted" ? "active" : ""} onClick={() => setView("deleted")}>Recently Deleted <span>{deletedTrips.length}</span></button>
      </div>

      {view === "mine" ? (
        <section className="journey-library" role="tabpanel" aria-label="My journeys">
          {trips.length ? trips.map((trip) => (
            <article className="journey-library-item" key={trip._id}>
              <div className="journey-library-cover">
                {trip.coverUrl ? <Image src={trip.coverUrl} alt={`Cover photograph for ${trip.title}`} fill sizes="(max-width: 700px) 100vw, 38vw" /> : <div className="journey-cover-empty">Your first photograph will become the cover.</div>}
                <span className={`journey-status ${trip.status}`}>{trip.status === "complete" ? "Complete" : "Draft"}</span>
              </div>
              <div className="journey-library-body">
                <div className="journey-library-heading">
                  <div>
                    <p className="journey-destination">{trip.destination}</p>
                    <h2>{trip.title}</h2>
                    <p>{trip.photoCount} photo{trip.photoCount === 1 ? "" : "s"} · {tripDates(trip.startDate, trip.endDate)} · Updated {updatedLabel(trip.updatedAt)}</p>
                    <p className="journey-processing">{processingLabel(trip.processingStatus)}</p>
                  </div>
                  <details className="journey-actions">
                    <summary aria-label={`Actions for ${trip.title}`}>…</summary>
                    <div>
                      <button type="button" onClick={() => beginRename(trip)}>Rename</button>
                      <button type="button" onClick={() => beginDetailsEdit(trip)}>Edit trip details</button>
                      <button type="button" className="danger-action" onClick={() => { setDeletingId(trip._id); setRenamingId(null); setEditingDetailsId(null); setFeedback(null); }}>Delete</button>
                    </div>
                  </details>
                </div>
                {renamingId === trip._id ? (
                  <section className="journey-card-panel" aria-label={`Rename ${trip.title}`}>
                    <label>Journey title<input value={title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => setTitle(event.target.value)} autoFocus /><span>{title.length} / {MAX_TITLE_LENGTH}</span></label>
                    <div><button className="text-button" disabled={busy} onClick={() => setRenamingId(null)}>Cancel</button><button className="secondary-button" disabled={busy || !title.trim() || title.trim() === trip.title} onClick={() => void saveRename(trip._id)}>{busy ? "Saving…" : feedback?.error ? "Retry" : "Save"}</button></div>
                  </section>
                ) : null}
                {editingDetailsId === trip._id ? (
                  <section className="journey-card-panel trip-details-panel" aria-labelledby={`details-${trip._id}`}>
                    <div>
                      <h3 id={`details-${trip._id}`}>Edit trip details</h3>
                      <p>Currently saved: {trip.destination} · {tripDates(trip.startDate, trip.endDate)}</p>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); void saveDetails(trip); }} noValidate>
                      <label>
                        Destination or trip region
                        <input value={detailsInput.destination} maxLength={MAX_DESTINATION_LENGTH} onChange={(event) => { setDetailsInput((current) => ({ ...current, destination: event.target.value })); setDetailsErrors((current) => ({ ...current, destination: undefined })); }} aria-invalid={Boolean(detailsErrors.destination)} />
                        {detailsErrors.destination ? <span className="field-error">{detailsErrors.destination}</span> : null}
                      </label>
                      <div className="trip-details-dates">
                        <label>
                          Start date
                          <input type="date" value={detailsInput.startDate} onChange={(event) => { setDetailsInput((current) => ({ ...current, startDate: event.target.value })); setDetailsErrors((current) => ({ ...current, startDate: undefined, endDate: undefined })); }} aria-invalid={Boolean(detailsErrors.startDate)} />
                          {detailsErrors.startDate ? <span className="field-error">{detailsErrors.startDate}</span> : null}
                        </label>
                        <label>
                          End date
                          <input type="date" value={detailsInput.endDate} onChange={(event) => { setDetailsInput((current) => ({ ...current, endDate: event.target.value })); setDetailsErrors((current) => ({ ...current, endDate: undefined })); }} aria-invalid={Boolean(detailsErrors.endDate)} />
                          {detailsErrors.endDate ? <span className="field-error">{detailsErrors.endDate}</span> : null}
                        </label>
                      </div>
                      <p>Saving rechecks the existing saved photos and reconstructs the timeline. Nothing is uploaded again.</p>
                      <div className="trip-details-actions"><button className="text-button" type="button" disabled={busy} onClick={cancelDetailsEdit}>Cancel</button><button className="secondary-button" disabled={busy || !journeyDetailsChanged({ destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate }, detailsInput)}>{busy ? "Saving…" : "Save and reconstruct"}</button></div>
                    </form>
                  </section>
                ) : null}
                {deletingId === trip._id ? (
                  <section className="journey-card-panel delete-confirmation" role="alertdialog" aria-labelledby={`delete-${trip._id}`} aria-describedby={`delete-copy-${trip._id}`}>
                    <h3 id={`delete-${trip._id}`}>Move “{trip.title}” to Recently Deleted?</h3>
                    <p id={`delete-copy-${trip._id}`}>Sharing will stop immediately. You can restore this journey for 30 days.</p>
                    <div><button className="text-button" disabled={busy} onClick={() => setDeletingId(null)}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void confirmDelete(trip._id)}>{busy ? "Moving…" : "Move to Recently Deleted"}</button></div>
                  </section>
                ) : null}
                {feedback?.tripId === trip._id ? <p className={feedback.error ? "inline-error" : "inline-success"} role="status">{feedback.text}</p> : null}
                <button className="primary-button continue-journey" onClick={() => onContinue(trip._id)}>{trip.photoCount ? "Continue journey" : "Add photos"}</button>
              </div>
            </article>
          )) : (
            <div className="journey-empty-state">
              <p className="eyebrow">Nothing here yet</p>
              <h2>Your first journey starts with a completed trip.</h2>
              <p>Add its destination and dates, then choose the photographs already waiting in your camera roll.</p>
              <button className="primary-button" onClick={onCreate}>Create your first journey</button>
            </div>
          )}
        </section>
      ) : view === "shared" ? (
        <section className="journey-library" role="tabpanel" aria-label="Shared with me">
          {sharedTrips.length ? sharedTrips.map((trip) => (
            <article className="journey-library-item shared-journey-card" key={trip._id}>
              <div className="journey-library-cover">
                {trip.coverUrl ? <Image src={trip.coverUrl} alt={`Cover photograph for ${trip.title}`} fill sizes="(max-width: 700px) 100vw, 38vw" /> : <div className="journey-cover-empty">Shared journey</div>}
                <span className="journey-status shared">Read only</span>
              </div>
              <div className="journey-library-body">
                <div>
                  <p className="journey-destination">{trip.destination}</p>
                  <h2>{trip.title}</h2>
                  <p>{tripDates(trip.startDate, trip.endDate)} · Last opened {updatedLabel(trip.lastViewedAt)}</p>
                </div>
                <button className="primary-button continue-journey" onClick={() => onOpenShared(trip.shareToken)}>Open shared journey</button>
              </div>
            </article>
          )) : (
            <div className="journey-empty-state">
              <p className="eyebrow">Shared with me</p>
              <h2>No journeys have been shared with this account.</h2>
              <p>When you open an active Triplog link while signed in, it will appear here for later.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="journey-library deleted-library" role="tabpanel" aria-label="Recently Deleted">
          {deletedTrips.length ? deletedTrips.map((trip) => {
            const daysLeft = Math.max(0, Math.ceil((trip.purgeAt - openedAt) / (24 * 60 * 60 * 1000)));
            return <article className="deleted-journey" key={trip._id}><div><p className="eyebrow">Deletes in {daysLeft} day{daysLeft === 1 ? "" : "s"}</p><h2>{trip.title}</h2><p>{trip.destination}</p></div><div><button className="secondary-button" disabled={busy} onClick={() => void restore(trip._id)}>Restore journey</button><button className="danger-button" disabled={busy} onClick={() => void erase(trip._id, trip.title)}>Delete permanently</button></div></article>;
          }) : <div className="journey-empty-state"><p className="eyebrow">Recently Deleted</p><h2>No journeys are waiting for deletion.</h2><p>Deleted journeys stay recoverable here for 30 days.</p></div>}
        </section>
      )}
    </main>
  );
}
