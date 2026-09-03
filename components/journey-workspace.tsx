"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { chapterProblem, timelineAvailability } from "@/lib/trip";
import { formatCaptureTime } from "@/lib/reconstruction";
import { shouldOfferLocationSuggestion } from "@/lib/title-suggestion";
import { JourneyTimeline } from "./journey-timeline";

type Trip = FunctionReturnType<typeof api.trips.getOne>;
type TripDay = Trip["days"][number];
type TripStop = TripDay["stops"][number];
type TripMoment = Trip["moments"][number];

function travellerText(moment: TripMoment) {
  return moment.memory || moment.detail || moment.recommendation || moment.warning;
}

function PhotoEvidence({ photo }: { photo: Trip["photos"][number] }) {
  const [open, setOpen] = useState(false);
  const copies = useQuery(api.trips.getPhotoCopies, open ? { photoId: photo._id } : "skip");
  return (
    <details className="photo-evidence" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Photo details</summary>
      <p>Captured {photo.capturedAt ? new Date(photo.capturedAt).toLocaleString() : "time unknown"} · GPS {photo.hasGpsMetadata ? `${photo.latitude?.toFixed(4)}, ${photo.longitude?.toFixed(4)}` : "not found"} · {photo.placementConfidence} confidence</p>
      {copies === undefined ? <p>Opening saved copies…</p> : copies ? <div><a href={copies.originalUrl ?? "#"} target="_blank" rel="noreferrer">Original</a><a href={copies.thumbnailUrl ?? "#"} target="_blank" rel="noreferrer">Thumbnail</a><a href={copies.displayUrl ?? "#"} target="_blank" rel="noreferrer">Display</a><a href={copies.largeUrl ?? "#"} target="_blank" rel="noreferrer">Large</a></div> : <p>Saved copies are unavailable.</p>}
    </details>
  );
}

function MomentEditor({ moment, stopOptions, onReorder, canMoveEarlier, canMoveLater }: {
  moment: TripMoment;
  stopOptions: Array<{ stopId: TripStop["_id"]; label: string; date: string }>;
  onReorder: (direction: -1 | 1) => void;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
}) {
  const saveMoment = useMutation(api.trips.saveMoment);
  const skipPrompt = useMutation(api.trips.skipMomentPrompt);
  const setRepresentative = useMutation(api.trips.setRepresentativePhoto);
  const removeMoment = useMutation(api.trips.removeMoment);
  const moveMoment = useMutation(api.trips.moveMoment);
  const [memory, setMemory] = useState(moment.memory);
  const [recommendation, setRecommendation] = useState(moment.recommendation);
  const [warning, setWarning] = useState(moment.warning);
  const [detail, setDetail] = useState(moment.detail);
  const [targetStopId, setTargetStopId] = useState(moment.stopId ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const lastSaved = useRef(JSON.stringify([moment.memory, moment.recommendation, moment.warning, moment.detail]));
  const representative = moment.representativePhoto;

  async function save() {
    setBusy(true); setStatus("");
    try { await saveMoment({ momentId: moment._id, memory, recommendation, warning, detail }); lastSaved.current = JSON.stringify([memory, recommendation, warning, detail]); setStatus("Saved"); }
    catch { setStatus("These notes could not be saved. Try again."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const current = JSON.stringify([memory, recommendation, warning, detail]);
    if (current === lastSaved.current) return;
    const timer = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(timer);
  // Save follows the editable note fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory, recommendation, warning, detail]);

  async function changePlacement() {
    if (!targetStopId || targetStopId === moment.stopId) return;
    setBusy(true); setStatus("");
    try { await moveMoment({ momentId: moment._id, stopId: targetStopId as TripStop["_id"] }); setStatus("Moment moved. Your placement will be kept."); }
    catch { setStatus("This moment could not be moved."); }
    finally { setBusy(false); }
  }

  async function removeFromTimeline() {
    setBusy(true); setStatus("");
    try { await removeMoment({ momentId: moment._id }); }
    catch { setStatus("This moment could not be removed."); setBusy(false); }
  }

  return (
    <article className="timeline-moment-card">
      {representative?.url ? <figure className="timeline-moment-photo"><Image src={representative.url} alt={representative.fileName} fill sizes="(max-width: 720px) 100vw, 320px" /><figcaption>{formatCaptureTime(moment.startTime)}</figcaption></figure> : null}
      <div className="timeline-moment-content">
        <header><div><p>{formatCaptureTime(moment.startTime)}</p><h4>{moment.photos.length} photo{moment.photos.length === 1 ? "" : "s"}</h4></div><details className="moment-menu"><summary>Move or remove</summary><div><label>Move to<select value={targetStopId} onChange={(event) => setTargetStopId(event.target.value)}>{stopOptions.map((option) => <option key={option.stopId} value={option.stopId}>{option.date} · {option.label}</option>)}</select></label><button className="secondary-button" disabled={busy || !targetStopId || targetStopId === moment.stopId} onClick={() => void changePlacement()}>Move moment</button><div className="moment-order-controls"><button className="text-button" disabled={!canMoveEarlier} onClick={() => onReorder(-1)}>Earlier</button><button className="text-button" disabled={!canMoveLater} onClick={() => onReorder(1)}>Later</button></div><button className="text-button danger-action" disabled={busy} onClick={() => void removeFromTimeline()}>Remove from timeline</button><small>The original photos stay safely uploaded.</small></div></details></header>
        {travellerText(moment) ? <p className="moment-saved-note">{travellerText(moment)}</p> : <p className="moment-empty-note">No personal notes added.</p>}
        {moment.photos.length > 1 ? <details className="photo-group"><summary>View all {moment.photos.length} photos</summary><div className="moment-photo-grid">{moment.photos.map((photo, index) => photo.url ? <figure key={photo._id}><Image src={photo.url} alt={`${photo.fileName}, photo ${index + 1}`} fill sizes="120px" /><figcaption><button className="text-button" disabled={photo._id === moment.representativePhotoId} onClick={() => void setRepresentative({ momentId: moment._id, photoId: photo._id })}>{photo._id === moment.representativePhotoId ? "Selected" : "Use as main photo"}</button></figcaption></figure> : null)}</div></details> : null}
        <details className="moment-prompts"><summary>Add a memory, recommendation, or warning</summary><div className="prompt-fields"><label>Memory<textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={3} placeholder="What do you remember about this stop?" /></label><label>Useful detail<textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={3} placeholder="Add only what you know happened." /></label><label>Recommendation<textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} rows={3} placeholder="Optional" /></label><label>Warning<textarea value={warning} onChange={(event) => setWarning(event.target.value)} rows={3} placeholder="Optional" /></label><div><button className="text-button" disabled={busy} onClick={() => void skipPrompt({ momentId: moment._id })}>{moment.promptSkipped ? "Skipped" : "Skip for now"}</button><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save notes"}</button></div></div></details>
        {status ? <p className={status.includes("could not") ? "inline-error" : "inline-success"} role="status">{status}</p> : null}
        {representative ? <PhotoEvidence photo={representative} /> : null}
      </div>
    </article>
  );
}

function StopEditor({ stop, day, stopOptions, onReorder, momentIndexes, momentTotal }: { stop: TripStop; day: TripDay; stopOptions: Array<{ stopId: TripStop["_id"]; label: string; date: string }>; onReorder: (momentId: TripMoment["_id"], direction: -1 | 1) => void; momentIndexes: Map<string, number>; momentTotal: number }) {
  const saveStop = useMutation(api.trips.saveStop);
  const addMoment = useMutation(api.trips.addMoment);
  const [label, setLabel] = useState(stop.label || "Location unknown");
  const [newMemory, setNewMemory] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function changeLocation() {
    setBusy(true); setStatus("");
    try { await saveStop({ stopId: stop._id, label }); setStatus("Location saved. Your correction will be kept."); }
    catch { setStatus("Add a location name and try again."); }
    finally { setBusy(false); }
  }

  async function addMemory() {
    if (!newMemory.trim()) return;
    setBusy(true); setStatus("");
    try { await addMoment({ tripId: day.tripId, dayId: day._id, stopId: stop._id, memory: newMemory }); setNewMemory(""); setStatus("Memory added."); }
    catch { setStatus("That memory could not be added."); }
    finally { setBusy(false); }
  }

  return (
    <section className="timeline-stop-card">
      <header className="timeline-stop-heading"><span className={`stop-dot ${stop.placeSource}`} /><div><h3>{stop.label || "Place name unavailable"}</h3><p>{stop.placeSource === "manual" ? "Location confirmed by you" : stop.placeSource === "gps" ? "Suggested from photo GPS" : "Location unknown · no usable GPS"}</p></div><details className="stop-edit"><summary>Edit location</summary><div><label>Location name<input value={label} onChange={(event) => setLabel(event.target.value)} /></label><button className="secondary-button" disabled={busy || !label.trim() || label.trim() === stop.label} onClick={() => void changeLocation()}>Save location</button></div></details></header>
      <div className="timeline-stop-moments">{stop.moments.map((moment) => { const index = momentIndexes.get(moment._id) ?? 0; return <MomentEditor key={moment._id} moment={moment} stopOptions={stopOptions} onReorder={(direction) => onReorder(moment._id, direction)} canMoveEarlier={index > 0} canMoveLater={index < momentTotal - 1} />; })}</div>
      <details className="manual-memory"><summary>Add an unphotographed memory</summary><div><label>What happened here?<textarea rows={3} value={newMemory} onChange={(event) => setNewMemory(event.target.value)} placeholder="Add only what you remember." /></label><button className="secondary-button" disabled={busy || !newMemory.trim()} onClick={() => void addMemory()}>Add memory</button></div></details>
      {status ? <p className={status.includes("could not") || status.startsWith("Add a") ? "inline-error" : "inline-success"} role="status">{status}</p> : null}
    </section>
  );
}

function UnplacedPhoto({ photo, onConfirm }: { photo: Trip["photos"][number]; onConfirm: (photoId: Trip["photos"][number]["_id"], dateKey: string) => void }) {
  const [dateKey, setDateKey] = useState(photo.dateKey === "undated" ? "" : photo.dateKey ?? "");
  return <article className="review-photo-card">{photo.thumbnailUrl ? <Image src={photo.thumbnailUrl} alt={photo.fileName} width={160} height={120} /> : null}<div><strong>{photo.fileName}</strong><p>No reliable capture date. Choose the correct date; its location will remain unknown until you correct it.</p><label>Date<input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} /></label><button className="secondary-button" disabled={!dateKey} onClick={() => onConfirm(photo._id, dateKey)}>Place on this date</button></div></article>;
}

export function JourneyWorkspace({ trip, onNew, onHome, onSignOut, onManagePhotos }: { trip: Trip; onNew: () => void; onHome: () => void; onSignOut: () => void; onManagePhotos: () => void }) {
  const updateTitle = useMutation(api.trips.updateTitle);
  const confirmTitleAndCover = useMutation(api.trips.confirmTitleAndCover);
  const markRecipientPreviewed = useMutation(api.trips.markRecipientPreviewed);
  const setPhotoReviewState = useMutation(api.trips.setPhotoReviewState);
  const confirmPhotoPlacement = useMutation(api.trips.confirmPhotoPlacement);
  const queueProcessing = useMutation(api.trips.queueProcessing);
  const reorderMoments = useMutation(api.trips.reorderMoments);
  const publish = useMutation(api.trips.publish);
  const unpublish = useMutation(api.trips.unpublish);
  // Pre-stop journeys and an older cached response may omit newer collections.
  // Normalising once keeps every later `.length`, `.map`, and `.filter` safe.
  const photos = trip.photos ?? [];
  const moments = trip.moments ?? [];
  const stops = trip.stops ?? [];
  const days = (trip.days ?? []).map((day) => ({
    ...day,
    moments: day.moments ?? [],
    stops: (day.stops ?? []).map((stop) => ({ ...stop, moments: stop.moments ?? [] })),
  }));
  const review = trip.review ?? {
    possiblyUnrelated: photos.filter((photo) => photo.reviewState === "possibly_unrelated"),
    unplaced: photos.filter((photo) => photo.reviewState === "unplaced"),
    lowQuality: photos.filter((photo) => photo.quality !== "clear" && photo.reviewState !== "removed"),
  };
  const hasSuggestedTitle = shouldOfferLocationSuggestion(trip.title, trip.titleSource, trip.suggestedTitle);
  const [mode, setMode] = useState<"timeline" | "recipient">("timeline");
  const [title, setTitle] = useState(hasSuggestedTitle && trip.suggestedTitle ? trip.suggestedTitle : trip.title);
  const [coverPhotoId, setCoverPhotoId] = useState(trip.coverPhotoId ?? photos.find((photo) => photo.reviewState === "included")?._id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const problem = chapterProblem({ destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, title, titleConfirmed: trip.titleConfirmed, coverConfirmed: trip.coverConfirmed, recipientPreviewedAt: trip.recipientPreviewedAt, photoCount: trip.photoCount, days, moments });
  const shareUrl = trip.shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${trip.shareToken}` : "";
  const selectedCover = photos.find((photo) => photo._id === coverPhotoId) ?? null;
  const orderedMoments = moments;
  const momentIndexes = new Map(orderedMoments.map((moment, index) => [moment._id, index]));
  const stopOptions = days.flatMap((day) => day.stops.map((stop) => ({ stopId: stop._id, label: stop.label || "Place name unavailable", date: day.displayDate || `Day ${day.dayNumber}` })));

  async function refreshStructure() { await queueProcessing({ tripId: trip._id }); }
  async function rebuildTimeline() { setBusy(true); setError(""); setMessage(""); try { await refreshStructure(); setMessage("Timeline reconstruction started from the saved photos."); } catch { setError("The timeline could not be restarted. Your uploaded photos are safe."); } finally { setBusy(false); } }
  async function saveTitle() { setBusy(true); setError(""); setMessage(""); try { await updateTitle({ tripId: trip._id, title }); setMessage("Title saved."); } catch { setError("Give this journey a title and try again."); } finally { setBusy(false); } }
  async function confirmIdentity() { if (!coverPhotoId) { setError("Choose a cover photo."); return; } setBusy(true); setError(""); setMessage(""); try { await confirmTitleAndCover({ tripId: trip._id, title, coverPhotoId }); setMessage("Title and cover confirmed."); } catch { setError("Title and cover could not be confirmed."); } finally { setBusy(false); } }
  async function openRecipientPreview() { setBusy(true); setError(""); try { await markRecipientPreviewed({ tripId: trip._id }); setMode("recipient"); } catch { setError("The recipient preview could not be opened."); } finally { setBusy(false); } }
  async function restorePhotos(photoIds: Trip["photos"][number]["_id"][]) { setBusy(true); setError(""); try { await setPhotoReviewState({ tripId: trip._id, photoIds, reviewState: "included" }); await refreshStructure(); setMessage(`${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} restored.`); } catch { setError("Those photos could not be restored."); } finally { setBusy(false); } }
  async function placePhoto(photoId: Trip["photos"][number]["_id"], dateKey: string) { setBusy(true); setError(""); try { await confirmPhotoPlacement({ photoId, dateKey }); await refreshStructure(); setMessage("Photo placed on the selected date under Location unknown."); } catch { setError("Choose a valid date for this photo."); } finally { setBusy(false); } }
  async function reorderMoment(momentId: TripMoment["_id"], direction: -1 | 1) { const index = orderedMoments.findIndex((moment) => moment._id === momentId); const target = index + direction; if (index < 0 || target < 0 || target >= orderedMoments.length) return; const ids = orderedMoments.map((moment) => moment._id); [ids[index], ids[target]] = [ids[target], ids[index]]; try { await reorderMoments({ tripId: trip._id, orderedMomentIds: ids }); } catch { setError("The moment order could not be changed."); } }
  async function changeSharing() { setBusy(true); setMessage(""); setError(""); try { if (trip.published) { await unpublish({ tripId: trip._id }); setMessage("Sharing stopped. The old journey link no longer opens."); } else { if (problem) throw new Error(problem); await publish({ tripId: trip._id }); setMessage("Journey shared. Recipients must sign in to see the full timeline."); } } catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "Sharing could not be changed."); } finally { setBusy(false); } }
  async function copyShareLink() { try { await navigator.clipboard.writeText(shareUrl); setMessage("Link copied."); } catch { setError("The browser could not copy the link. Select it and copy it manually."); } }

  const visibleDays = days.filter((day) => day.stops.some((stop) => stop.moments.length > 0));
  const visibleMomentCount = visibleDays.reduce((total, day) => total + day.stops.reduce((stopTotal, stop) => stopTotal + stop.moments.length, 0), 0);
  const reviewPhotoCount = new Set([...review.possiblyUnrelated, ...review.unplaced].map((photo) => photo._id)).size;
  const availability = timelineAvailability({ visibleMomentCount, reviewPhotoCount, needsTimelineRebuild: trip.needsTimelineRebuild ?? false });
  const [unrelatedReviewOpen, setUnrelatedReviewOpen] = useState(availability === "needs_review");
  const [unplacedReviewOpen, setUnplacedReviewOpen] = useState(availability === "needs_review" && review.possiblyUnrelated.length === 0);
  return (
    <div className="journey-shell core-product">
      <header className="workspace-topbar"><div><p className="wordmark">Triplog</p><p className="privacy-note"><span className={trip.published ? "status-dot published" : "status-dot"} />{trip.published ? "Shared by link" : "Private to you"}</p></div><nav aria-label="Journey view"><button className={mode === "timeline" ? "workspace-tab active" : "workspace-tab"} onClick={() => setMode("timeline")}>Timeline</button><button className={mode === "recipient" ? "workspace-tab active" : "workspace-tab"} onClick={() => void openRecipientPreview()}>Recipient preview</button></nav><div className="trip-nav"><button className="secondary-button compact-button" onClick={onHome}>Your journeys</button><button className="secondary-button compact-button" onClick={onNew}>New journey</button><button className="text-button" onClick={onSignOut}>Sign out</button></div></header>
      {mode === "recipient" ? <main className="timeline-preview-screen"><div className="preview-toolbar"><div><p className="timeline-label">Recipient preview</p><h1>This is what a signed-in recipient sees.</h1><p>Unplaced and possibly unrelated photos stay excluded.</p></div><button className="secondary-button" onClick={() => setMode("timeline")}>Back to editing</button></div><JourneyTimeline title={title} destination={trip.destination ?? title} startDate={trip.startDate} endDate={trip.endDate} photoCount={trip.photoCount} days={visibleDays} cover={selectedCover} readOnly /><section className="sharing-panel"><div><h2>{trip.published ? "This journey is shared." : "Share this complete timeline"}</h2><p>The link is unlisted. Recipients must create an account or sign in, and they cannot edit your content.</p></div><button className={trip.published ? "secondary-button" : "primary-button"} disabled={busy || (!trip.published && problem !== null)} onClick={() => void changeSharing()}>{trip.published ? "Stop sharing" : "Publish and create link"}</button>{!trip.published && problem ? <p className="sharing-guidance">{problem}</p> : null}{trip.published && shareUrl ? <label className="share-link">Read-only link<input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><span><button className="text-button" onClick={() => void copyShareLink()}>Copy link</button><a href={shareUrl} target="_blank" rel="noreferrer">Open link</a></span></label> : null}</section>{error ? <p className="form-error book-message" role="alert">{error}</p> : null}{message ? <p className="form-success book-message" role="status">{message}</p> : null}</main> : (
        <main className="timeline-workspace"><header className="timeline-overview"><div><p className="timeline-label">Reconstructed timeline</p><h1>{title}</h1><p>{trip.destination} · {trip.photoCount} photos · {days.length} dates · {stops.length} stops</p></div><div className="overview-actions"><button className="secondary-button" onClick={onManagePhotos}>Add or retry photos</button><button className="primary-button" onClick={() => void openRecipientPreview()}>Preview and share</button></div></header>
          {error ? <p className="form-error page-message" role="alert">{error}</p> : null}{message ? <p className="form-success page-message" role="status">{message}</p> : null}
          {trip.needsTimelineRebuild ? <section className="rebuild-notice"><div><h2>Update this journey to the new timeline</h2><p>Your uploaded originals stay unchanged. Triplog will organise them into dates, places, and moments.</p></div><button className="primary-button" disabled={busy} onClick={() => void rebuildTimeline()}>{busy ? "Rebuilding…" : "Rebuild timeline"}</button></section> : null}
          <section className="timeline-controls"><details><summary>Edit title and cover</summary><div className="identity-controls"><label>Journey title<input value={title} onChange={(event) => setTitle(event.target.value)} />{hasSuggestedTitle && trip.suggestedTitle ? <span>Suggested from GPS evidence: {trip.suggestedTitle}</span> : null}</label><button className="secondary-button" disabled={busy || !title.trim() || title.trim() === trip.title} onClick={() => void saveTitle()}>Save title</button><label>Main photo<select value={coverPhotoId ?? ""} onChange={(event) => setCoverPhotoId(event.target.value as Trip["photos"][number]["_id"])}><option value="">Choose a photo</option>{photos.filter((photo) => photo.reviewState === "included").map((photo) => <option key={photo._id} value={photo._id}>{photo.fileName}</option>)}</select></label><button className="secondary-button" disabled={busy || !title.trim() || !coverPhotoId} onClick={() => void confirmIdentity()}>{trip.titleConfirmed && trip.coverConfirmed ? "Confirm changes" : "Confirm title and main photo"}</button></div></details></section>
          <nav className="route-strip" aria-label="Suggested sequence of stops"><strong>Stop sequence</strong>{visibleDays.flatMap((day) => day.stops.filter((stop) => stop.moments.length).map((stop) => <span key={stop._id}><b>{day.dayNumber}</b>{stop.label || "Place name unavailable"}</span>))}</nav>
          {availability !== "visible" ? <section className="timeline-empty-state" aria-live="polite"><p className="timeline-label">Timeline review</p><h2>{availability === "needs_review" ? "No photos are shown in the timeline yet." : availability === "needs_rebuild" ? "This older journey needs a timeline update." : "No timeline moments are available yet."}</h2><p>{availability === "needs_review" ? "Your saved photos need confirmation before Triplog can show them by date and place." : availability === "needs_rebuild" ? "Use Rebuild timeline above. Your uploaded originals will stay unchanged." : "Your saved photos are safe. Add photos, or retry reconstruction only if it did not finish."}</p>{availability === "needs_review" ? <a className="primary-button" href="#photo-review">Check these photos</a> : null}</section> : null}
          {(review.possiblyUnrelated.length || review.unplaced.length || review.lowQuality.length) ? <section id="photo-review" className="review-queue" aria-labelledby="review-heading"><div><p className="timeline-label">Check these photos</p><h2 id="review-heading">Some evidence may need your help.</h2></div>{review.possiblyUnrelated.length ? <details open={unrelatedReviewOpen} onToggle={(event) => setUnrelatedReviewOpen(event.currentTarget.open)}><summary>Possibly unrelated <span>{review.possiblyUnrelated.length}</span></summary><p>These photo dates fall outside the entered journey dates. The photos remain stored and are not shown in the timeline unless you restore them.</p><button className="secondary-button" disabled={busy} onClick={() => void restorePhotos(review.possiblyUnrelated.map((photo) => photo._id))}>Restore all</button><div className="review-photo-grid">{review.possiblyUnrelated.slice(0, 40).map((photo) => <article className="review-photo-card" key={photo._id}>{photo.thumbnailUrl ? <Image src={photo.thumbnailUrl} alt={photo.fileName} width={160} height={120} /> : null}<div><strong>{photo.fileName}</strong><p>{photo.capturedAt ? new Date(photo.capturedAt).toLocaleString() : "Capture date not found"}</p><button className="text-button" onClick={() => void restorePhotos([photo._id])}>Restore photo</button></div></article>)}</div></details> : null}{review.unplaced.length ? <details open={unplacedReviewOpen} onToggle={(event) => setUnplacedReviewOpen(event.currentTarget.open)}><summary>Unplaced photos <span>{review.unplaced.length}</span></summary><p>These photos have no reliable date. Choose a date to add them to a Location unknown stop.</p><div className="review-photo-grid">{review.unplaced.slice(0, 40).map((photo) => <UnplacedPhoto key={photo._id} photo={photo} onConfirm={(photoId, dateKey) => void placePhoto(photoId, dateKey)} />)}</div></details> : null}{review.lowQuality.length ? <details><summary>Dark or blurry photos <span>{review.lowQuality.length}</span></summary><p>These remain stored and available. Triplog never deletes them automatically.</p></details> : null}</section> : null}
          <div className="editable-timeline">{visibleDays.map((day) => <section className="timeline-day" key={day._id}><header className="timeline-day-heading"><span>{day.dayNumber}</span><div><p>Day {day.dayNumber}</p><h2>{day.displayDate || "Date to confirm"}</h2><small>{day.stops.length} stop{day.stops.length === 1 ? "" : "s"} · {day.moments.length} moment{day.moments.length === 1 ? "" : "s"}</small></div></header><div className="timeline-day-stops">{day.stops.map((stop) => <StopEditor key={stop._id} stop={stop} day={day} stopOptions={stopOptions} onReorder={(momentId, direction) => void reorderMoment(momentId, direction)} momentIndexes={momentIndexes} momentTotal={orderedMoments.length} />)}</div></section>)}</div>
          <p className="osm-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Triplog sends coordinates, never photos.</p>
        </main>)}
    </div>
  );
}
