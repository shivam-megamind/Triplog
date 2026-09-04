"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  chapterProblem,
  dateInputTimestamp,
  enrichmentError,
  journeyDetailsChanged,
  journeyDetailsErrors,
  journeyDetailsInput,
  journeyTitle,
  MAX_ENRICHMENT_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_TITLE_LENGTH,
  timelineAvailability,
  type EnrichmentFields,
  type JourneyDetailsErrors,
  type JourneyDetailsInput,
} from "@/lib/trip";
import { formatCaptureTime } from "@/lib/reconstruction";
import { shouldOfferLocationSuggestion } from "@/lib/title-suggestion";
import { DayNavigation, dayAnchorId, JourneyOverview, stopAnchorId } from "./journey-overview";
import { JourneyTimeline } from "./journey-timeline";

type Trip = FunctionReturnType<typeof api.trips.getOne>;
type TripDay = Trip["days"][number];
type TripStop = TripDay["stops"][number];
type TripMoment = Trip["moments"][number];

function dateRange(startDate?: number, endDate?: number) {
  if (startDate === undefined || endDate === undefined) return "Dates to confirm";
  const format = (value: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function PhotoEvidence({ photo }: { photo: Trip["photos"][number] }) {
  const [open, setOpen] = useState(false);
  const copies = useQuery(api.trips.getPhotoCopies, open ? { photoId: photo._id } : "skip");
  return <details className="photo-evidence" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Photo details</summary><p>Captured {photo.capturedAt ? new Date(photo.capturedAt).toLocaleString() : "time unknown"} · GPS {photo.hasGpsMetadata ? `${photo.latitude?.toFixed(4)}, ${photo.longitude?.toFixed(4)}` : "not found"} · {photo.placementConfidence} confidence</p>{copies === undefined ? <p>Opening saved image…</p> : copies?.storageLayout === "single_optimized_v1" ? <><div>{copies.savedImageUrl ? <a href={copies.savedImageUrl} target="_blank" rel="noreferrer">Saved web image</a> : null}</div><p>The original was processed on this device and was not stored by Postcard.</p></> : copies ? <div><a href={copies.originalUrl ?? "#"} target="_blank" rel="noreferrer">Original</a><a href={copies.thumbnailUrl ?? "#"} target="_blank" rel="noreferrer">Thumbnail</a><a href={copies.displayUrl ?? "#"} target="_blank" rel="noreferrer">Display</a><a href={copies.largeUrl ?? "#"} target="_blank" rel="noreferrer">Large</a></div> : <p>Saved images are unavailable.</p>}</details>;
}

function EnrichmentContent({ values }: { values: EnrichmentFields }) {
  const items = [
    values.memory ? { label: "Memory", value: values.memory, kind: "memory" } : null,
    values.detail ? { label: "Useful detail", value: values.detail, kind: "detail" } : null,
    values.recommendation ? { label: "Recommendation", value: values.recommendation, kind: "recommendation" } : null,
    values.warning ? { label: "Warning", value: values.warning, kind: "warning" } : null,
  ].filter((item): item is { label: string; value: string; kind: string } => item !== null);
  if (!items.length) return null;
  return <div className="moment-notes">{items.map((item) => <section className={`moment-note ${item.kind}`} key={item.kind}><strong>{item.label}</strong><p>{item.value}</p></section>)}</div>;
}

function MomentPhotos({ moment, editing, busy, onChooseMain }: { moment: TripMoment; editing: boolean; busy: boolean; onChooseMain: (photoId: Trip["photos"][number]["_id"]) => void }) {
  const [showAll, setShowAll] = useState(false);
  const representative = moment.representativePhoto;
  const photos = [
    ...(representative ? [representative] : []),
    ...moment.photos.filter((photo) => photo._id !== representative?._id),
  ];
  const visible = showAll ? photos : photos.slice(0, 5);
  if (!photos.length) return null;
  return <div className="moment-gallery"><div className={`moment-photo-grid photo-count-${Math.min(visible.length, 5)}`}>{visible.map((photo, index) => photo.url ? <figure className={index === 0 ? "primary-photo" : ""} key={photo._id}><Image src={photo.url} alt={photo.fileName} fill sizes={index === 0 ? "(max-width: 760px) 94vw, 660px" : "(max-width: 760px) 45vw, 260px"} />{editing ? <figcaption><button className="photo-choice" type="button" disabled={busy || photo._id === moment.representativePhotoId} onClick={() => onChooseMain(photo._id)}>{photo._id === moment.representativePhotoId ? "Main photo" : "Make main"}</button></figcaption> : null}</figure> : null)}</div>{photos.length > 5 ? <button className="quiet-action" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer photos" : `View all ${photos.length} photos`}</button> : null}</div>;
}

function MomentEditor({ moment, stopOptions, onReorder, canMoveEarlier, canMoveLater }: { moment: TripMoment; stopOptions: Array<{ stopId: TripStop["_id"]; label: string; date: string }>; onReorder: (direction: -1 | 1) => void; canMoveEarlier: boolean; canMoveLater: boolean }) {
  const saveMoment = useMutation(api.trips.saveMoment);
  const setRepresentative = useMutation(api.trips.setRepresentativePhoto);
  const removeMoment = useMutation(api.trips.removeMoment);
  const moveMoment = useMutation(api.trips.moveMoment);
  const saved = { memory: moment.memory, detail: moment.detail, recommendation: moment.recommendation, warning: moment.warning };
  const [draft, setDraft] = useState<EnrichmentFields>(saved);
  const [editing, setEditing] = useState(false);
  const [targetStopId, setTargetStopId] = useState(moment.stopId ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"" | "saved" | "error">("");
  const [actionError, setActionError] = useState("");
  const saveLock = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const validationError = enrichmentError(draft);

  async function save() {
    if (saveLock.current || busy || !dirty || validationError) return;
    saveLock.current = true;
    setBusy(true); setStatus("");
    try { await saveMoment({ momentId: moment._id, ...draft }); setStatus("saved"); setEditing(false); }
    catch { setStatus("error"); }
    finally { setBusy(false); saveLock.current = false; }
  }

  function cancel() { setDraft(saved); setEditing(false); setStatus(""); }

  async function changePlacement() {
    if (!targetStopId || targetStopId === moment.stopId || busy) return;
    setBusy(true); setActionError("");
    try { await moveMoment({ momentId: moment._id, stopId: targetStopId as TripStop["_id"] }); }
    catch { setActionError("This moment could not be moved. Try again."); }
    finally { setBusy(false); }
  }

  async function removeFromTimeline() {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await removeMoment({ momentId: moment._id }); }
    catch { setActionError("This moment could not be removed. Try again."); setBusy(false); }
  }

  return (
    <article className="timeline-moment-card">
      <MomentPhotos moment={moment} editing={editing} busy={busy} onChooseMain={(photoId) => void setRepresentative({ momentId: moment._id, photoId })} />
      <div className="timeline-moment-content">
        <header className="moment-heading-row"><div><p>{formatCaptureTime(moment.startTime)}</p><h4>{moment.photos.length ? `${moment.photos.length} photo${moment.photos.length === 1 ? "" : "s"}` : "Unphotographed memory"}</h4></div><details className="moment-menu"><summary>More</summary><div><label>Move to<select value={targetStopId} onChange={(event) => setTargetStopId(event.target.value)}>{stopOptions.map((option) => <option key={option.stopId} value={option.stopId}>{option.date} · {option.label}</option>)}</select></label><button className="secondary-button" disabled={busy || !targetStopId || targetStopId === moment.stopId} onClick={() => void changePlacement()}>Move moment</button><div className="moment-order-controls"><button className="quiet-action" disabled={!canMoveEarlier || busy} onClick={() => onReorder(-1)}>Earlier</button><button className="quiet-action" disabled={!canMoveLater || busy} onClick={() => onReorder(1)}>Later</button></div><button className="quiet-action danger-action" disabled={busy} onClick={() => void removeFromTimeline()}>Remove from timeline</button><small>The saved photo stays in this journey.</small></div></details></header>
        {!editing ? <><EnrichmentContent values={saved} /><button className="quiet-action enrichment-action" type="button" onClick={() => { setDraft(saved); setEditing(true); setStatus(""); }}>{Object.values(saved).some(Boolean) ? "Edit memory and tips" : "Add memory or recommendation"}</button>{status === "saved" ? <p className="save-success" role="status">Saved</p> : null}</> : (
          <section className="enrichment-editor" aria-label="Edit memory and recommendations">
            <div className="prompt-fields">{(["memory", "detail", "recommendation", "warning"] as const).map((field) => <label key={field}>{field === "detail" ? "Useful detail" : field.charAt(0).toUpperCase() + field.slice(1)}<textarea value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} rows={3} maxLength={MAX_ENRICHMENT_LENGTH} placeholder={field === "memory" ? "What do you remember about this moment?" : field === "detail" ? "Add only what you know happened." : "Optional"} /><span>{draft[field].length.toLocaleString("en")} / {MAX_ENRICHMENT_LENGTH.toLocaleString("en")}</span></label>)}</div>
            {validationError ? <p className="inline-error" role="alert">{validationError}</p> : null}
            {status === "error" ? <p className="inline-error" role="alert">Your words are still here. The server did not save them.</p> : null}
            <div className="edit-actions"><button className="secondary-button" type="button" disabled={busy} onClick={cancel}>Cancel</button><button className="primary-button" type="button" disabled={busy || !dirty || Boolean(validationError)} onClick={() => void save()}>{busy ? "Saving…" : status === "error" ? "Retry" : "Save"}</button></div>
          </section>
        )}
        {actionError ? <p className="inline-error" role="alert">{actionError}</p> : null}
        {moment.representativePhoto ? <PhotoEvidence photo={moment.representativePhoto} /> : null}
      </div>
    </article>
  );
}

function StopEditor({ stop, day, stopNumber, stopOptions, onReorder, momentIndexes, momentTotal, active }: { stop: TripStop; day: TripDay; stopNumber: number; stopOptions: Array<{ stopId: TripStop["_id"]; label: string; date: string }>; onReorder: (momentId: TripMoment["_id"], direction: -1 | 1) => void; momentIndexes: Map<string, number>; momentTotal: number; active: boolean }) {
  const saveStop = useMutation(api.trips.saveStop);
  const addMoment = useMutation(api.trips.addMoment);
  const [editingLocation, setEditingLocation] = useState(false);
  const [label, setLabel] = useState(stop.label || "Location unknown");
  const [locationStatus, setLocationStatus] = useState<"" | "saved" | "error">("");
  const [addingMemory, setAddingMemory] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [memoryStatus, setMemoryStatus] = useState<"" | "saved" | "error">("");
  const [busy, setBusy] = useState(false);
  const locationLock = useRef(false);
  const memoryLock = useRef(false);
  const memoryRequestId = useRef(crypto.randomUUID());

  async function changeLocation() {
    if (locationLock.current || busy || !label.trim() || label.trim() === stop.label || label.trim().length > MAX_LOCATION_LENGTH) return;
    locationLock.current = true; setBusy(true); setLocationStatus("");
    try { await saveStop({ stopId: stop._id, label }); setLocationStatus("saved"); setEditingLocation(false); }
    catch { setLocationStatus("error"); }
    finally { setBusy(false); locationLock.current = false; }
  }

  async function addMemory() {
    if (memoryLock.current || busy || !newMemory.trim()) return;
    memoryLock.current = true; setBusy(true); setMemoryStatus("");
    try { await addMoment({ tripId: day.tripId, dayId: day._id, stopId: stop._id, memory: newMemory, requestId: memoryRequestId.current }); setNewMemory(""); setAddingMemory(false); setMemoryStatus("saved"); memoryRequestId.current = crypto.randomUUID(); }
    catch { setMemoryStatus("error"); }
    finally { setBusy(false); memoryLock.current = false; }
  }

  return (
    <section className={active ? "timeline-stop-card active" : "timeline-stop-card"} id={stopAnchorId(stop._id)}>
      <header className="timeline-stop-heading"><span className={`stop-number ${stop.placeSource}`}>{stopNumber}</span><div><h3>{stop.label || "Place name unavailable"}</h3><p>{stop.placeSource === "manual" ? "Location confirmed by you" : stop.placeSource === "gps" ? "Suggested from photo GPS" : "Location unknown · no usable GPS"}</p></div><button className="quiet-action" type="button" onClick={() => { setLabel(stop.label || "Location unknown"); setEditingLocation(true); setLocationStatus(""); }}>Edit location</button></header>
      {editingLocation ? <section className="inline-editor location-editor"><label>Location name<input value={label} maxLength={MAX_LOCATION_LENGTH} onChange={(event) => setLabel(event.target.value)} /><span>{label.length} / {MAX_LOCATION_LENGTH}</span></label>{locationStatus === "error" ? <p className="inline-error" role="alert">The location was not saved. Your change is still here.</p> : null}<div className="edit-actions"><button className="secondary-button" disabled={busy} onClick={() => { setEditingLocation(false); setLabel(stop.label || "Location unknown"); setLocationStatus(""); }}>Cancel</button><button className="primary-button" disabled={busy || !label.trim() || label.trim() === stop.label} onClick={() => void changeLocation()}>{busy ? "Saving…" : locationStatus === "error" ? "Retry" : "Save"}</button></div></section> : locationStatus === "saved" ? <p className="save-success stop-save-success" role="status">Location saved</p> : null}
      <div className="timeline-stop-moments">{stop.moments.map((moment) => { const index = momentIndexes.get(moment._id) ?? 0; return <MomentEditor key={moment._id} moment={moment} stopOptions={stopOptions} onReorder={(direction) => onReorder(moment._id, direction)} canMoveEarlier={index > 0} canMoveLater={index < momentTotal - 1} />; })}</div>
      {!addingMemory ? <div className="manual-memory-action"><button className="quiet-action" type="button" onClick={() => { setAddingMemory(true); setMemoryStatus(""); }}>Add an unphotographed memory</button>{memoryStatus === "saved" ? <p className="save-success" role="status">Memory added</p> : null}</div> : <section className="inline-editor manual-memory"><label>What happened here?<textarea rows={3} value={newMemory} maxLength={MAX_ENRICHMENT_LENGTH} onChange={(event) => setNewMemory(event.target.value)} placeholder="Add only what you remember." /><span>{newMemory.length.toLocaleString("en")} / {MAX_ENRICHMENT_LENGTH.toLocaleString("en")}</span></label>{memoryStatus === "error" ? <p className="inline-error" role="alert">The memory was not saved. Your words are still here.</p> : null}<div className="edit-actions"><button className="secondary-button" disabled={busy} onClick={() => { setAddingMemory(false); setNewMemory(""); setMemoryStatus(""); memoryRequestId.current = crypto.randomUUID(); }}>Cancel</button><button className="primary-button" disabled={busy || !newMemory.trim()} onClick={() => void addMemory()}>{busy ? "Saving…" : memoryStatus === "error" ? "Retry" : "Save"}</button></div></section>}
    </section>
  );
}

function UnplacedPhoto({ photo, onConfirm }: { photo: Trip["photos"][number]; onConfirm: (photoId: Trip["photos"][number]["_id"], dateKey: string) => void }) {
  const [dateKey, setDateKey] = useState(photo.dateKey === "undated" ? "" : photo.dateKey ?? "");
  return <article className="review-photo-card">{photo.thumbnailUrl ? <Image src={photo.thumbnailUrl} alt={photo.fileName} width={160} height={120} /> : null}<div><strong>{photo.fileName}</strong><p>No reliable capture date. Choose the correct date; its location will remain unknown until you correct it.</p><label>Date<input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} /></label><button className="secondary-button" disabled={!dateKey} onClick={() => onConfirm(photo._id, dateKey)}>Place on this date</button></div></article>;
}

export function JourneyWorkspace({ trip, onNew, onHome, onSignOut, onManagePhotos, recipientPreview = false, onRecipientPreviewChange }: { trip: Trip; onNew: () => void; onHome: () => void; onSignOut: () => void; onManagePhotos: () => void; recipientPreview?: boolean; onRecipientPreviewChange?: (open: boolean) => void }) {
  const mode = recipientPreview ? "recipient" : "timeline";
  const setMode = (next: "timeline" | "recipient") => onRecipientPreviewChange?.(next === "recipient");
  const confirmTitleAndCover = useMutation(api.trips.confirmTitleAndCover);
  const updateDetails = useMutation(api.trips.updateDetails);
  const markRecipientPreviewed = useMutation(api.trips.markRecipientPreviewed);
  const setPhotoReviewState = useMutation(api.trips.setPhotoReviewState);
  const confirmPhotoPlacement = useMutation(api.trips.confirmPhotoPlacement);
  const queueProcessing = useMutation(api.trips.queueProcessing);
  const reorderMoments = useMutation(api.trips.reorderMoments);
  const publish = useMutation(api.trips.publish);
  const unpublish = useMutation(api.trips.unpublish);
  const photos = trip.photos ?? [];
  const moments = trip.moments ?? [];
  const stops = trip.stops ?? [];
  const days = (trip.days ?? []).map((day) => ({ ...day, moments: day.moments ?? [], stops: (day.stops ?? []).map((stop) => ({ ...stop, moments: stop.moments ?? [] })) }));
  const review = trip.review ?? { possiblyUnrelated: photos.filter((photo) => photo.reviewState === "possibly_unrelated"), unplaced: photos.filter((photo) => photo.reviewState === "unplaced"), lowQuality: photos.filter((photo) => photo.quality !== "clear" && photo.reviewState !== "removed") };
  const hasSuggestedTitle = shouldOfferLocationSuggestion(trip.title, trip.titleSource, trip.suggestedTitle);
  const initialTitle = journeyTitle(hasSuggestedTitle && trip.suggestedTitle ? trip.suggestedTitle : trip.title);
  const initialCoverId = trip.coverPhotoId ?? photos.find((photo) => photo.reviewState === "included")?._id;
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [coverPhotoId, setCoverPhotoId] = useState(initialCoverId);
  const [identityStatus, setIdentityStatus] = useState<"" | "saved" | "error">("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsInput, setDetailsInput] = useState<JourneyDetailsInput>(() => journeyDetailsInput({ destination: trip.destination ?? trip.title, startDate: trip.startDate, endDate: trip.endDate }));
  const [detailsErrors, setDetailsErrors] = useState<JourneyDetailsErrors>({});
  const [detailsStatus, setDetailsStatus] = useState<"" | "error">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeDayId, setActiveDayId] = useState<string | undefined>(days[0]?._id);
  const [activeStopId, setActiveStopId] = useState<string | undefined>(days[0]?.stops[0]?._id);
  const actionLock = useRef(false);
  const displayTitle = journeyTitle(title);
  const selectedCover = photos.find((photo) => photo._id === coverPhotoId) ?? null;
  const problem = chapterProblem({ destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, title: displayTitle, coverPhotoId: selectedCover?.reviewState === "included" ? selectedCover._id : undefined, recipientPreviewedAt: trip.recipientPreviewedAt, photoCount: trip.photoCount, days, moments });
  const shareUrl = trip.shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${trip.shareToken}` : "";
  const momentIndexes = new Map(moments.map((moment, index) => [moment._id, index]));
  const stopOptions = days.flatMap((day) => day.stops.map((stop) => ({ stopId: stop._id, label: stop.label || "Place name unavailable", date: day.displayDate || `Day ${day.dayNumber}` })));
  const visibleDays = days.filter((day) => day.stops.some((stop) => stop.moments.length > 0));
  const visibleMomentCount = visibleDays.reduce((total, day) => total + day.stops.reduce((stopTotal, stop) => stopTotal + stop.moments.length, 0), 0);
  const reviewPhotoCount = new Set([...review.possiblyUnrelated, ...review.unplaced].map((photo) => photo._id)).size;
  const availability = timelineAvailability({ visibleMomentCount, reviewPhotoCount, needsTimelineRebuild: trip.needsTimelineRebuild ?? false });
  const [unrelatedReviewOpen, setUnrelatedReviewOpen] = useState(availability === "needs_review");
  const [unplacedReviewOpen, setUnplacedReviewOpen] = useState(availability === "needs_review" && review.possiblyUnrelated.length === 0);

  async function guarded(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try { await action(); } finally { setBusy(false); actionLock.current = false; }
  }

  async function saveIdentity() {
    if (!coverPhotoId || displayTitle.length > MAX_TITLE_LENGTH) return;
    setIdentityStatus(""); setError("");
    await guarded(async () => { try { await confirmTitleAndCover({ tripId: trip._id, title: displayTitle, coverPhotoId }); setIdentityStatus("saved"); setEditingIdentity(false); } catch { setIdentityStatus("error"); } });
  }

  async function saveTripDetails() {
    const values = { destination: detailsInput.destination, startDate: dateInputTimestamp(detailsInput.startDate), endDate: dateInputTimestamp(detailsInput.endDate) };
    const nextErrors = journeyDetailsErrors(values); setDetailsErrors(nextErrors); setDetailsStatus("");
    if (Object.keys(nextErrors).length) return;
    await guarded(async () => { try { await updateDetails({ tripId: trip._id, destination: detailsInput.destination.trim(), startDate: values.startDate!, endDate: values.endDate! }); setEditingDetails(false); } catch { setDetailsStatus("error"); } });
  }

  async function openRecipientPreview() { setError(""); await guarded(async () => { try { await markRecipientPreviewed({ tripId: trip._id }); onRecipientPreviewChange?.(true); } catch { setError("The recipient preview could not be opened."); } }); }
  async function rebuildTimeline() { setError(""); setMessage(""); await guarded(async () => { try { await queueProcessing({ tripId: trip._id }); setMessage("Timeline reconstruction started from the saved photos."); } catch { setError("The timeline could not be restarted. Your uploaded photos are safe."); } }); }
  async function restorePhotos(photoIds: Trip["photos"][number]["_id"][]) { setError(""); await guarded(async () => { try { await setPhotoReviewState({ tripId: trip._id, photoIds, reviewState: "included" }); await queueProcessing({ tripId: trip._id }); setMessage(`${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} restored.`); } catch { setError("Those photos could not be restored."); } }); }
  async function placePhoto(photoId: Trip["photos"][number]["_id"], dateKey: string) { setError(""); await guarded(async () => { try { await confirmPhotoPlacement({ photoId, dateKey }); await queueProcessing({ tripId: trip._id }); setMessage("Photo placed on the selected date under Location unknown."); } catch { setError("Choose a valid date for this photo."); } }); }
  async function reorderMoment(momentId: TripMoment["_id"], direction: -1 | 1) { const index = moments.findIndex((moment) => moment._id === momentId); const target = index + direction; if (index < 0 || target < 0 || target >= moments.length) return; const ids = moments.map((moment) => moment._id); [ids[index], ids[target]] = [ids[target], ids[index]]; try { await reorderMoments({ tripId: trip._id, orderedMomentIds: ids }); } catch { setError("The moment order could not be changed."); } }
  async function changeSharing() { setMessage(""); setError(""); await guarded(async () => { try { if (trip.published) { await unpublish({ tripId: trip._id }); setMessage("Sharing stopped. The old journey link no longer opens."); } else { if (problem) throw new Error(problem); await publish({ tripId: trip._id, title: displayTitle }); setMessage("Journey shared. Recipients must sign in to see the full timeline."); } } catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "Sharing could not be changed."); } }); }
  async function copyShareLink() { try { await navigator.clipboard.writeText(shareUrl); setMessage("Link copied."); } catch { setError("The browser could not copy the link. Select it and copy it manually."); } }

  if (mode === "recipient") return <div className="journey-shell core-product"><header className="journey-bar"><button className="back-action" type="button" onClick={() => setMode("timeline")}>← Back to timeline</button><p className="journey-bar-title">Recipient preview</p><button className="secondary-button compact-button" type="button" onClick={onHome}>Your journeys</button></header><main className="timeline-preview-screen"><div className="preview-toolbar"><div><p className="timeline-label">Recipient preview</p><h1>This is what a signed-in recipient sees.</h1><p>Unplaced and possibly unrelated photos stay excluded.</p></div></div><JourneyTimeline title={displayTitle} destination={trip.destination ?? displayTitle} startDate={trip.startDate} endDate={trip.endDate} photoCount={trip.photoCount} days={visibleDays} cover={selectedCover} readOnly /><section className="sharing-panel"><div><h2>{trip.published ? "This journey is shared" : "Share this journey"}</h2><p>The link is unlisted. Recipients must sign in, and they cannot edit your content.</p></div><button className={trip.published ? "secondary-button" : "primary-button"} disabled={busy || (!trip.published && problem !== null)} onClick={() => void changeSharing()}>{trip.published ? "Stop sharing" : "Publish and create link"}</button>{!trip.published && problem ? <p className="sharing-guidance">{problem}</p> : null}{trip.published && shareUrl ? <label className="share-link">Read-only link<input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><span><button className="quiet-action" onClick={() => void copyShareLink()}>Copy link</button><a href={shareUrl} target="_blank" rel="noreferrer">Open link</a></span></label> : null}</section>{error ? <p className="form-error book-message" role="alert">{error}</p> : null}{message ? <p className="form-success book-message" role="status">{message}</p> : null}</main></div>;

  return (
    <div className="journey-shell core-product">
      <header className="journey-bar"><button className="back-action" type="button" onClick={onHome}>← <span className="desktop-label">Your journeys</span><span className="mobile-label">Journeys</span></button><p className="journey-bar-title">{trip.title}</p><div className="journey-bar-actions"><button className="secondary-button compact-button" type="button" onClick={onManagePhotos}><span className="desktop-label">Add photos</span><span className="mobile-label">Add</span></button><button className="primary-button compact-button" type="button" onClick={() => void openRecipientPreview()}><span className="desktop-label">Preview and share</span><span className="mobile-label">Preview</span></button><details className="workspace-menu"><summary aria-label="More journey actions">…</summary><div><button type="button" onClick={() => { setEditingIdentity(true); setIdentityStatus(""); }}>Edit title and main photo</button><button type="button" onClick={() => { setDetailsInput(journeyDetailsInput({ destination: trip.destination ?? trip.title, startDate: trip.startDate, endDate: trip.endDate })); setDetailsErrors({}); setDetailsStatus(""); setEditingDetails(true); }}>Edit trip details</button><button type="button" onClick={onNew}>New journey</button><button type="button" onClick={onSignOut}>Sign out</button></div></details></div></header>
      <main className="timeline-workspace">
        <header className="compact-journey-header"><div><div className="privacy-pill"><span className={trip.published ? "status-dot published" : "status-dot"} />{trip.published ? "Shared by link" : "Private to you"}</div><h1>{trip.title}</h1><p>{trip.destination} · {dateRange(trip.startDate, trip.endDate)}</p><div className="journey-facts"><span>{trip.photoCount} photo{trip.photoCount === 1 ? "" : "s"}</span><span>{visibleDays.length} day{visibleDays.length === 1 ? "" : "s"}</span><span>{stops.length} stop{stops.length === 1 ? "" : "s"}</span></div></div>{selectedCover?.url ? <figure><Image src={selectedCover.url} alt={`Main photo for ${trip.title}`} fill priority sizes="(max-width: 760px) 38vw, 260px" /></figure> : null}</header>
        {error ? <p className="form-error page-message" role="alert">{error}</p> : null}{message ? <p className="form-success page-message" role="status">{message}</p> : null}
        {editingIdentity ? <section className="workspace-edit-panel" aria-label="Edit journey title and main photo"><div><h2>Edit title and main photo</h2><p>Saved changes appear in this journey and its shared view.</p></div><div className="identity-controls"><label>Journey title<input value={title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => setTitle(event.target.value)} /><span>{title.length} / {MAX_TITLE_LENGTH}{hasSuggestedTitle && trip.suggestedTitle ? ` · GPS suggestion: ${trip.suggestedTitle}` : ""}</span></label><label>Main photo<select value={coverPhotoId ?? ""} onChange={(event) => setCoverPhotoId(event.target.value as Trip["photos"][number]["_id"])}><option value="">Choose a photo</option>{photos.filter((photo) => photo.reviewState === "included").map((photo) => <option key={photo._id} value={photo._id}>{photo.fileName}</option>)}</select></label></div>{identityStatus === "error" ? <p className="inline-error" role="alert">The title and main photo were not saved. Your changes are still here.</p> : null}<div className="edit-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => { setTitle(initialTitle); setCoverPhotoId(trip.coverPhotoId ?? initialCoverId); setEditingIdentity(false); setIdentityStatus(""); }}>Cancel</button><button className="primary-button" type="button" disabled={busy || !coverPhotoId || displayTitle.length > MAX_TITLE_LENGTH || (displayTitle === journeyTitle(trip.title) && coverPhotoId === trip.coverPhotoId)} onClick={() => void saveIdentity()}>{busy ? "Saving…" : identityStatus === "error" ? "Retry" : "Save"}</button></div></section> : identityStatus === "saved" ? <p className="save-success workspace-save-success" role="status">Title and main photo saved</p> : null}
        {editingDetails ? <section className="workspace-edit-panel" aria-label="Edit trip details"><div><h2>Edit trip details</h2><p>Saving rechecks the saved photos. It does not upload them again.</p></div><div className="trip-details-fields"><label>Destination or trip region<input value={detailsInput.destination} maxLength={160} onChange={(event) => { setDetailsInput((current) => ({ ...current, destination: event.target.value })); setDetailsErrors((current) => ({ ...current, destination: undefined })); }} />{detailsErrors.destination ? <span className="field-error">{detailsErrors.destination}</span> : null}</label><label>Start date<input type="date" value={detailsInput.startDate} onChange={(event) => setDetailsInput((current) => ({ ...current, startDate: event.target.value }))} />{detailsErrors.startDate ? <span className="field-error">{detailsErrors.startDate}</span> : null}</label><label>End date<input type="date" value={detailsInput.endDate} onChange={(event) => setDetailsInput((current) => ({ ...current, endDate: event.target.value }))} />{detailsErrors.endDate ? <span className="field-error">{detailsErrors.endDate}</span> : null}</label></div>{detailsStatus === "error" ? <p className="inline-error" role="alert">The trip details were not saved. Your changes are still here.</p> : null}<div className="edit-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => { setEditingDetails(false); setDetailsStatus(""); }}>Cancel</button><button className="primary-button" type="button" disabled={busy || !journeyDetailsChanged({ destination: trip.destination ?? trip.title, startDate: trip.startDate, endDate: trip.endDate }, detailsInput)} onClick={() => void saveTripDetails()}>{busy ? "Saving…" : detailsStatus === "error" ? "Retry" : "Save and reconstruct"}</button></div></section> : null}
        {trip.needsTimelineRebuild ? <section className="rebuild-notice"><div><h2>Update this journey to the new timeline</h2><p>Your saved photos stay unchanged.</p></div><button className="primary-button" disabled={busy} onClick={() => void rebuildTimeline()}>{busy ? "Rebuilding…" : "Rebuild timeline"}</button></section> : null}
        <JourneyOverview days={visibleDays} activeStopId={activeStopId} onSelectStop={setActiveStopId} />
        <DayNavigation days={visibleDays} activeDayId={activeDayId} onSelectDay={setActiveDayId} />
        {availability !== "visible" ? <section className="timeline-empty-state" aria-live="polite"><p className="timeline-label">Timeline review</p><h2>{availability === "needs_review" ? "No photos are shown in the timeline yet." : availability === "needs_rebuild" ? "This older journey needs a timeline update." : "No timeline moments are available yet."}</h2><p>{availability === "needs_review" ? "Your saved photos need confirmation before Postcard can show them by date and place." : availability === "needs_rebuild" ? "Use Rebuild timeline above. Your saved photos stay unchanged." : "Your saved photos are safe. Add photos, or retry reconstruction only if it did not finish."}</p>{availability === "needs_review" ? <a className="primary-button" href="#photo-review">Check these photos</a> : null}</section> : null}
        {(review.possiblyUnrelated.length || review.unplaced.length || review.lowQuality.length) ? <section id="photo-review" className="review-queue" aria-labelledby="review-heading"><div><p className="timeline-label">Check these photos</p><h2 id="review-heading">Some evidence may need your help.</h2></div>{review.possiblyUnrelated.length ? <details open={unrelatedReviewOpen} onToggle={(event) => setUnrelatedReviewOpen(event.currentTarget.open)}><summary>Possibly unrelated <span>{review.possiblyUnrelated.length}</span></summary><p>These photo dates fall outside the entered journey dates. They stay stored and remain outside the timeline until you restore them.</p><button className="secondary-button" disabled={busy} onClick={() => void restorePhotos(review.possiblyUnrelated.map((photo) => photo._id))}>Restore all</button><div className="review-photo-grid">{review.possiblyUnrelated.slice(0, 40).map((photo) => <article className="review-photo-card" key={photo._id}>{photo.thumbnailUrl ? <Image src={photo.thumbnailUrl} alt={photo.fileName} width={160} height={120} /> : null}<div><strong>{photo.fileName}</strong><p>{photo.capturedAt ? new Date(photo.capturedAt).toLocaleString() : "Capture date not found"}</p><button className="quiet-action" onClick={() => void restorePhotos([photo._id])}>Restore photo</button></div></article>)}</div></details> : null}{review.unplaced.length ? <details open={unplacedReviewOpen} onToggle={(event) => setUnplacedReviewOpen(event.currentTarget.open)}><summary>Unplaced photos <span>{review.unplaced.length}</span></summary><p>These photos have no reliable date. Choose a date to add them to a Location unknown stop.</p><div className="review-photo-grid">{review.unplaced.slice(0, 40).map((photo) => <UnplacedPhoto key={photo._id} photo={photo} onConfirm={(photoId, dateKey) => void placePhoto(photoId, dateKey)} />)}</div></details> : null}{review.lowQuality.length ? <details><summary>Dark or blurry photos <span>{review.lowQuality.length}</span></summary><p>These remain stored and available. Postcard never deletes them automatically.</p></details> : null}</section> : null}
        <div className="editable-timeline">{visibleDays.map((day) => <section className="timeline-day" id={dayAnchorId(day._id)} key={day._id}><header className="timeline-day-heading"><span>{day.dayNumber}</span><div><p>Day {day.dayNumber}</p><h2>{day.displayDate || "Date to confirm"}</h2><small>{day.stops.length} stop{day.stops.length === 1 ? "" : "s"} · {day.moments.length} moment{day.moments.length === 1 ? "" : "s"}</small></div></header><div className="timeline-day-stops">{day.stops.map((stop) => <StopEditor key={stop._id} stop={stop} day={day} stopNumber={stops.findIndex((item) => item._id === stop._id) + 1} stopOptions={stopOptions} onReorder={(momentId, direction) => void reorderMoment(momentId, direction)} momentIndexes={momentIndexes} momentTotal={moments.length} active={activeStopId === stop._id} />)}</div></section>)}</div>
        <p className="osm-attribution">Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Postcard sends coordinates, never photos.</p>
      </main>
    </div>
  );
}
