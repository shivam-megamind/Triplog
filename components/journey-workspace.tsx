"use client";

import Image from "next/image";
import { useMutation } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { chapterProblem } from "@/lib/trip";
import { formatCaptureTime } from "@/lib/reconstruction";
import { Chapter } from "./chapter";

type Trip = FunctionReturnType<typeof api.trips.getOne>;
type TripDay = Trip["days"][number];
type TripMoment = Trip["moments"][number];
type TripSummary = FunctionReturnType<typeof api.trips.listMine>[number];

function travellerText(moment: TripMoment) {
  return moment.memory || moment.detail || moment.recommendation || moment.warning;
}

function MomentEditor({ moment, place }: { moment: TripMoment; place: string }) {
  const saveMoment = useMutation(api.trips.saveMoment);
  const [memory, setMemory] = useState(moment.memory);
  const [recommendation, setRecommendation] = useState(moment.recommendation);
  const [warning, setWarning] = useState(moment.warning);
  const [detail, setDetail] = useState(moment.detail);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const representative = moment.representativePhoto;

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      await saveMoment({ momentId: moment._id, memory, recommendation, warning, detail });
      setStatus("Your words are saved.");
    } catch {
      setStatus("These words could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="moment-card">
      <div className="moment-image">
        {representative?.url ? <Image src={representative.url} alt={representative.fileName} fill sizes="(max-width: 720px) 100vw, 44vw" /> : <div className="photo-empty">Photograph unavailable</div>}
        <p>{formatCaptureTime(moment.startTime)}</p>
      </div>
      <div className="moment-body">
        <div className="moment-heading">
          <div>
            <p className="moment-place">{place || "Location to confirm"}</p>
            <h3>{moment.photos.length > 1 ? `${moment.photos.length} similar photos grouped` : "One photograph, one moment"}</h3>
          </div>
          <span>{formatCaptureTime(moment.startTime)}</span>
        </div>
        {travellerText(moment) ? <p className="saved-memory">“{travellerText(moment)}”</p> : <p className="memory-empty">The photograph holds the scene. Add the part only you know.</p>}

        {moment.photos.length > 1 ? (
          <details className="photo-group">
            <summary>View all {moment.photos.length}</summary>
            <div className="moment-photo-grid">
              {moment.photos.map((photo, index) => photo.url ? (
                <figure key={photo._id}>
                  <Image src={photo.url} alt={`${photo.fileName}, photo ${index + 1} in this moment`} fill sizes="(max-width: 720px) 45vw, 16vw" />
                </figure>
              ) : null)}
            </div>
            <p>No originals were deleted. Triplog chose the first image as the representative for this draft.</p>
          </details>
        ) : null}

        <details className="moment-prompts" open={!travellerText(moment)}>
          <summary>Add what only you know</summary>
          <div className="prompt-fields">
            <label>What made this stop memorable?<textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={3} placeholder="Write it as you would tell a friend." /></label>
            <label>What is the one detail this photo cannot show?<textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={3} placeholder="A sound, a small moment, what happened next…" /></label>
            <details className="extra-prompts">
              <summary>Add a recommendation or warning</summary>
              <label>Would you recommend this place to a friend?<textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} rows={3} placeholder="Leave blank if you would rather not say." /></label>
              <label>Anything worth avoiding?<textarea value={warning} onChange={(event) => setWarning(event.target.value)} rows={3} placeholder="Only add what you experienced yourself." /></label>
            </details>
            <div className="prompt-action">
              <span />
              <button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save this moment"}</button>
            </div>
          </div>
        </details>
        {status ? <p className={status === "Your words are saved." ? "inline-success" : "inline-error"} role="status" aria-live="polite">{status}</p> : null}
      </div>
    </article>
  );
}

function DaySection({ day }: { day: TripDay }) {
  const saveDay = useMutation(api.trips.saveDay);
  const [date, setDate] = useState(day.displayDate);
  const [place, setPlace] = useState(day.place);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      await saveDay({ dayId: day._id, displayDate: date, place });
      setStatus("Day details saved.");
    } catch {
      setStatus("Day details could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="timeline-day">
      <header className="timeline-day-heading">
        <p>Day {String(day.dayNumber).padStart(2, "0")}</p>
        <div>
          <span>{day.displayDate || "Date to confirm"}</span>
          <h2>{day.place || "Location to confirm"}</h2>
          <small>{day.moments.length} moment{day.moments.length === 1 ? "" : "s"} · {day.photos.length} photo{day.photos.length === 1 ? "" : "s"}</small>
        </div>
        <details className="day-correction">
          <summary>Edit day or location</summary>
          <div>
            <label>Date<input value={date} onChange={(event) => setDate(event.target.value)} placeholder="Date could not be read" /><span>{day.dateKey === "undated" ? "No usable capture date was found. Selected order is preserved." : "Read from local photo capture time. Correct it if needed."}</span></label>
            <label>Location<input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Add location" /><span>{day.placeSource === "gps" ? "Suggested from one GPS coordinate for this day." : "No location is invented when GPS is missing."}</span></label>
            <button className="secondary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save day details"}</button>
            {status ? <p className={status === "Day details saved." ? "inline-success" : "inline-error"} role="status">{status}</p> : null}
          </div>
        </details>
      </header>
      <div className="moments-list">
        {day.moments.map((moment) => <MomentEditor key={moment._id} moment={moment} place={day.place} />)}
      </div>
    </section>
  );
}

export function JourneyWorkspace({
  trip,
  trips,
  onSelect,
  onNew,
  onSignOut,
}: {
  trip: Trip;
  trips: TripSummary[];
  onSelect: (tripId: Id<"trips">) => void;
  onNew: () => void;
  onSignOut: () => void;
}) {
  const updateTitle = useMutation(api.trips.updateTitle);
  const publish = useMutation(api.trips.publish);
  const unpublish = useMutation(api.trips.unpublish);
  const [mode, setMode] = useState<"timeline" | "book">("timeline");
  const [title, setTitle] = useState(trip.title);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const problem = chapterProblem({
    title,
    photoCount: trip.photoCount,
    days: trip.days,
    moments: trip.moments,
  });
  const shareUrl = trip.shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${trip.shareToken}` : "";

  async function saveTitle() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await updateTitle({ tripId: trip._id, title });
      setMessage("Trip name saved.");
    } catch {
      setError("Give this trip a name, then try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changeSharing() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (trip.published) {
        await unpublish({ tripId: trip._id });
        setMessage("Sharing revoked. The old link no longer opens this journey.");
      } else {
        if (problem) throw new Error(problem);
        await publish({ tripId: trip._id });
        setMessage("Journey shared. Anyone with the link must sign in to read it.");
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Sharing could not be changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="journey-shell">
      <header className="workspace-topbar">
        <div><p className="wordmark">Triplog</p><p className="privacy-note"><span className={trip.published ? "status-dot published" : "status-dot"} />{trip.published ? "Shared by link" : "Private to you"}</p></div>
        <nav aria-label="Journey workspace">
          <button className={mode === "timeline" ? "workspace-tab active" : "workspace-tab"} onClick={() => setMode("timeline")}>Journey draft</button>
          <button className={mode === "book" ? "workspace-tab active" : "workspace-tab"} onClick={() => setMode("book")}>Preview book</button>
        </nav>
        <div className="trip-nav">
          <label>Current trip<select value={trip._id} onChange={(event) => onSelect(event.target.value as Id<"trips">)}>{trips.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}</select></label>
          <button className="secondary-button compact-button" onClick={onNew}>New trip</button>
          <button className="text-button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {mode === "book" ? (
        <main className="book-workspace">
          <div className="book-toolbar">
            <div><p className="eyebrow">Private preview</p><h1>Your journey, bound together.</h1></div>
            <button className="secondary-button" onClick={() => setMode("timeline")}>Return to journey draft</button>
          </div>
          <Chapter title={title} startDate={trip.startDate} endDate={trip.endDate} days={trip.days} draft />
          <section className="sharing-panel">
            <div><p className="eyebrow">Whole-journey sharing</p><h2>{trip.published ? "This journey has one read-only link." : "Keep it private, or share the complete book."}</h2><p>Recipients must create an account or sign in. They can read, but never edit, your journey.</p></div>
            <button className={trip.published ? "secondary-button" : "primary-button"} disabled={busy || (!trip.published && problem !== null)} onClick={() => void changeSharing()}>{trip.published ? "Revoke shared link" : "Share this journey"}</button>
            {!trip.published && problem ? <p className="sharing-guidance">{problem}</p> : null}
            {trip.published && shareUrl ? <label className="share-link">Read-only link<input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><a href={shareUrl} target="_blank" rel="noreferrer">Open shared journey</a></label> : null}
          </section>
          {error ? <p className="form-error book-message" role="alert">{error}</p> : null}
          {message ? <p className="form-success book-message" role="status">{message}</p> : null}
        </main>
      ) : (
        <main className="timeline-workspace">
          <header className="journey-reveal">
            <div className="reveal-copy">
              <p className="eyebrow">Your first draft is ready</p>
              <h1>We found the shape of your trip.</h1>
              <p>{trip.photoCount} photos · {trip.days.length} days · {trip.momentCount} moments · {trip.groupedPhotoCount} similar photos grouped</p>
            </div>
            <div className="trip-title-editor">
              <label>Trip title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <button className="secondary-button" disabled={busy || title.trim() === trip.title} onClick={() => void saveTitle()}>Save title</button>
            </div>
            <button className="primary-button" onClick={() => setMode("book")}>Preview private book</button>
          </header>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="form-success" role="status">{message}</p> : null}
          <div className="timeline-days">{trip.days.map((day) => <DaySection key={day._id} day={day} />)}</div>
          <p className="osm-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Triplog sends one coordinate per day, never your photos.</p>
        </main>
      )}
    </div>
  );
}
