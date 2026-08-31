"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { canAddPhotos, chapterProblem, MAX_PHOTOS } from "@/lib/trip";
import { readPhotoMetadata } from "@/lib/photo-metadata";
import { Chapter } from "./chapter";

export function TripEditor() {
  const trips = useQuery(api.trips.listMine);
  const createTrip = useMutation(api.trips.create);
  const { signOut } = useAuthActions();
  const [selectedId, setSelectedId] = useState<Id<"trips"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeId = selectedId ?? trips?.[0]?._id;
  const trip = useQuery(api.trips.getOne, activeId ? { tripId: activeId } : "skip");

  if (trips === undefined || (activeId && trip === undefined)) return <div className="center-message">Opening your private trips…</div>;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const title = String(new FormData(event.currentTarget).get("title") ?? "");
    try { const tripId = await createTrip({ title }); setSelectedId(tripId); setCreating(false); setBusy(false); } catch { setError("Give this completed trip a name."); setBusy(false); }
  }

  if (!trips.length || creating || !trip) {
    return <div className="new-trip-shell"><header className="topbar"><p className="wordmark">Triplog</p><div className="topbar-actions">{trips.length ? <button className="text-button" onClick={() => { setCreating(false); setError(""); }}>Cancel</button> : null}<button className="text-button" onClick={() => void signOut()}>Sign out</button></div></header><form className="new-trip-card" onSubmit={create}><p className="eyebrow">A completed journey</p><h1>Which trip would you like to remember?</h1><label>Trip name<input name="title" placeholder="For example, Kyoto in the rain" autoFocus required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-button" disabled={busy}>{busy ? "Starting…" : "Start this travel book"}</button></form></div>;
  }
  return <Editor key={trip._id} trip={trip} trips={trips} onSelect={setSelectedId} onNew={() => setCreating(true)} onSignOut={() => void signOut()} />;
}

type Trip = FunctionReturnType<typeof api.trips.getOne>;
type TripSummary = FunctionReturnType<typeof api.trips.listMine>[number];
type TripDay = Trip["days"][number];

function Editor({ trip, trips, onSelect, onNew, onSignOut }: { trip: Trip; trips: TripSummary[]; onSelect: (id: Id<"trips">) => void; onNew: () => void; onSignOut: () => void }) {
  const generateUploadUrl = useMutation(api.trips.generateUploadUrl);
  const addPhoto = useMutation(api.trips.addPhoto);
  const updatePhotoMetadata = useMutation(api.trips.updatePhotoMetadata);
  const rebuildDays = useMutation(api.trips.rebuildDays);
  const resolvePlaces = useAction(api.trips.resolvePlaces);
  const publish = useMutation(api.trips.publish);
  const unpublish = useMutation(api.trips.unpublish);
  const updateTitle = useMutation(api.trips.updateTitle);
  const [title, setTitle] = useState(trip.title);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const recoveryAttempt = useRef("");
  const recoveryInFlight = useRef(false);
  const daysForBook = trip.days.map((day) => ({ ...day, photos: trip.photos.filter((photo) => (photo.dateKey ?? "undated") === day.dateKey) }));
  const problem = chapterProblem({ title, photoCount: trip.photos.length, days: trip.days });
  const recoveryKey = trip.photos.map((photo) => `${photo._id}:${photo.dateKey ?? "missing"}`).join("|");

  useEffect(() => {
    if (busy || !trip.photos.length || recoveryInFlight.current || (trip.days.length > 0 && trip.photos.every((photo) => photo.dateKey !== undefined)) || recoveryAttempt.current === recoveryKey) return;
    recoveryAttempt.current = recoveryKey;
    recoveryInFlight.current = true;
    let cancelled = false;
    async function recoverSavedPhotos() {
      setRecovering(true); setError("");
      try {
        for (const photo of trip.photos) {
          if (photo.dateKey !== undefined) continue;
          if (!photo.url) throw new Error("missing-photo-url");
          const response = await fetch(photo.url);
          if (!response.ok) throw new Error("photo-read-failed");
          const blob = await response.blob();
          const metadata = await readPhotoMetadata(new File([blob], photo.fileName, { type: blob.type }));
          await updatePhotoMetadata({ photoId: photo._id, ...metadata });
        }
        await rebuildDays({ tripId: trip._id });
        await resolvePlaces({ tripId: trip._id });
        if (!cancelled) setMessage("Saved photographs reconstructed. Review the dates and places below.");
      } catch {
        if (!cancelled) setError("Saved photos were found, but Triplog could not reconstruct them. Reload once or try uploading again.");
      } finally {
        recoveryInFlight.current = false;
        if (!cancelled) setRecovering(false);
      }
    }
    void recoverSavedPhotos();
    return () => { cancelled = true; };
  }, [busy, rebuildDays, recoveryKey, resolvePlaces, trip._id, trip.days.length, trip.photos, updatePhotoMetadata]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setMessage(""); setError("");
    if (!canAddPhotos(trip.photos.length, files.length)) { setError(`Choose no more than ${MAX_PHOTOS - trip.photos.length} more photo${MAX_PHOTOS - trip.photos.length === 1 ? "" : "s"}.`); return; }
    setBusy(true);
    let savedAny = false;
    try {
      const prepared = await Promise.all(Array.from(files).map(async (file) => ({ file, metadata: await readPhotoMetadata(file) })));
      for (const { file, metadata } of prepared.sort((a, b) => (a.metadata.capturedAt ?? Number.MAX_SAFE_INTEGER) - (b.metadata.capturedAt ?? Number.MAX_SAFE_INTEGER))) {
        if (!file.type.startsWith("image/")) throw new Error("not-image");
        const uploadUrl = await generateUploadUrl({ tripId: trip._id });
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error("upload");
        const { storageId } = await response.json() as { storageId: Id<"_storage"> };
        await addPhoto({ tripId: trip._id, storageId, fileName: file.name, ...metadata });
        savedAny = true;
      }
      await rebuildDays({ tripId: trip._id });
      const result = await resolvePlaces({ tripId: trip._id });
      setMessage(`Reconstructed ${result.groups || 1} day${result.groups === 1 ? "" : "s"} from photo metadata. Check the suggestions below.`);
    } catch (caught) {
      if (savedAny) {
        await rebuildDays({ tripId: trip._id });
        await resolvePlaces({ tripId: trip._id });
      }
      setError(caught instanceof Error && caught.message === "not-image" ? "Choose image files only." : "A photo could not be processed. Any earlier photos were saved and reconstructed; try the failed photo again.");
    } finally { setBusy(false); }
  }

  async function changePrivacy() {
    setBusy(true); setMessage(""); setError("");
    try {
      if (trip.published) { await unpublish({ tripId: trip._id }); setMessage("Trip is private again. The old link no longer opens it."); }
      else { if (problem) throw new Error(problem); await publish({ tripId: trip._id }); setMessage("Published. Anyone with the link can read this trip."); }
    } catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "Privacy could not be changed. Try again."); }
    finally { setBusy(false); }
  }

  async function saveTitle() {
    setBusy(true); setMessage(""); setError("");
    try { await updateTitle({ tripId: trip._id, title }); setMessage("Trip name saved."); }
    catch { setError("Give this trip a name, then try again."); }
    finally { setBusy(false); }
  }

  const shareUrl = trip.shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${trip.shareToken}` : "";
  return <div className="editor-shell"><header className="topbar"><div><p className="wordmark">Triplog</p><p className="privacy-note"><span className={trip.published ? "status-dot published" : "status-dot"} />{trip.published ? "Shared by link" : "Private to you"}</p></div><div className="trip-nav"><label>Current trip<select value={trip._id} onChange={(event) => onSelect(event.target.value as Id<"trips">)}>{trips.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}</select></label><button className="secondary-button compact-button" onClick={onNew}>New trip</button><button className="text-button" onClick={onSignOut}>Sign out</button></div></header><div className="editor-grid"><aside className="editor-panel" aria-labelledby="editor-title"><p className="eyebrow">Reconstruct your journey</p><section className="trip-title-editor"><label>Trip name<input id="editor-title" value={title} onChange={(event) => setTitle(event.target.value)} /></label><button className="secondary-button" disabled={busy || title.trim() === trip.title} onClick={() => void saveTitle()}>Save name</button></section><p className="panel-intro">Triplog reads capture dates and GPS from your photos, then gives you a draft to correct. It never invents your memories.</p><section className="editor-section"><div className="section-heading"><span>1</span><div><h2>Photographs</h2><p>{trip.photos.length} of {MAX_PHOTOS} saved · ordered by capture time</p></div></div><label className={`upload-control ${busy || recovering || trip.photos.length >= MAX_PHOTOS ? "disabled" : ""}`}><span>{busy || recovering ? "Reading and reconstructing…" : "Choose photos"}</span><input type="file" accept="image/*" multiple disabled={busy || recovering || trip.photos.length >= MAX_PHOTOS} onChange={(event) => void upload(event.target.files)} /></label><p className="metadata-note">Dates and GPS are read on this device. For each day, only one coordinate—not the photo—is sent to OpenStreetMap for a place suggestion.</p></section>{recovering ? <section className="empty-reconstruction" aria-live="polite"><h2>Reading your saved photographs…</h2><p>Triplog is recovering their dates, order, and places. This screen will update automatically.</p></section> : trip.days.length ? <section className="reconstructed-days" aria-label="Reconstructed days">{trip.days.map((day) => <DayEditor key={`${day._id}-${day.place}-${day.displayDate}-${day.memory}`} day={day} />)}</section> : <section className="empty-reconstruction"><h2>Your reconstructed days will appear here.</h2><p>If a photo has no date or GPS, Triplog will ask only for the missing detail.</p></section>}{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="form-success" role="status">{message}</p> : null}<div className="action-row"><button className="secondary-button" disabled={busy || recovering || (!trip.published && problem !== null)} onClick={() => void changePrivacy()}>{trip.published ? "Make private" : "Publish link"}</button></div>{trip.published && shareUrl ? <div className="share-box"><label>Public read-only link<input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} /></label><a href={shareUrl} target="_blank" rel="noreferrer">Open public trip</a></div> : null}<p className="osm-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p></aside><section className="preview-panel" aria-label="Finished trip preview"><Chapter title={title} days={daysForBook} draft /></section></div></div>;
}

function DayEditor({ day }: { day: TripDay }) {
  const saveDay = useMutation(api.trips.saveDay);
  const [displayDate, setDisplayDate] = useState(day.displayDate);
  const [place, setPlace] = useState(day.place);
  const [memory, setMemory] = useState(day.memory);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); setStatus(""); try { await saveDay({ dayId: day._id, displayDate, place, memory }); setStatus("Day saved."); } catch { setStatus("Confirm the date and place, then try again."); } finally { setBusy(false); } }
  return <section className="day-editor"><div className="section-heading"><span>{day.dayNumber}</span><div><h2>Day {day.dayNumber}</h2><p>{day.photos.length} photo{day.photos.length === 1 ? "" : "s"} grouped together</p></div></div><label>Date<input value={displayDate} onChange={(event) => setDisplayDate(event.target.value)} placeholder="Date missing — enter it here" />{day.displayDate ? <span>Read from photo capture data. Correct it if needed.</span> : <span>No EXIF date was found. Enter the date manually.</span>}</label><label>Place<input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="GPS missing — enter the place here" />{day.placeSource === "gps" ? <span>Suggested from one GPS coordinate for this day. Correct it if needed.</span> : day.placeSource === "missing" ? <span>No usable GPS place was found. Enter it manually.</span> : <span>Manually corrected.</span>}</label><label>Your memory<textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={5} placeholder="What happened here that the photo cannot show?" /></label><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save this day"}</button>{status ? <p className={status === "Day saved." ? "inline-success" : "inline-error"} role="status">{status}</p> : null}</section>;
}
