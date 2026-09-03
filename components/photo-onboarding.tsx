"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { DragEvent, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createPhotoVariants, readPhotoMetadata } from "@/lib/photo-metadata";
import { MAX_PHOTOS } from "@/lib/trip";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type LocalStatus = "ready" | "preparing" | "uploading" | "saved" | "failed";
type SelectedPhoto = { key: string; file: File; preview: string; status: LocalStatus; error?: string };
function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
function fileSignature(file: Pick<File, "name" | "size">) {
  return `${file.name}:${file.size}`;
}

async function storeBlob(uploadUrl: string, blob: Blob) {
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
  if (!response.ok) throw new Error("The connection stopped while saving this photo.");
  return (await response.json() as { storageId: Id<"_storage"> }).storageId;
}

export function PhotoOnboarding({ existingTripId, existingPhotoCount = 0, reconstructionNeeded = false, onComplete, onCancel, initialError = "" }: {
  existingTripId: Id<"trips">;
  existingPhotoCount?: number;
  reconstructionNeeded?: boolean;
  onComplete: (tripId: Id<"trips">) => void;
  onCancel?: () => void;
  onStart?: () => void;
  initialError?: string;
}) {
  const uploadItems = useQuery(api.trips.listUploadItems, { tripId: existingTripId });
  const beginUpload = useMutation(api.trips.beginUpload);
  const generateUploadUrl = useMutation(api.trips.generateUploadUrl);
  const markUploadAttempt = useMutation(api.trips.markUploadAttempt);
  const markUploadFailed = useMutation(api.trips.markUploadFailed);
  const addPhoto = useMutation(api.trips.addPhoto);
  const queueProcessing = useMutation(api.trips.queueProcessing);
  const [selected, setSelected] = useState<SelectedPhoto[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(initialError);
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(existingPhotoCount);
  const previews = useRef<string[]>([]);
  const uploadLock = useRef(false);

  useEffect(() => () => { for (const preview of previews.current) URL.revokeObjectURL(preview); }, []);

  const persistedByKey = new Map((uploadItems ?? []).map((item) => [item.uploadKey, item]));
  const uploadedSignatures = new Set((uploadItems ?? []).filter((item) => item.status === "uploaded").map((item) => fileSignature({ name: item.fileName, size: item.fileSize })));
  const unfinished = (uploadItems ?? []).filter((item) => item.status !== "uploaded");
  const uploadedCount = Math.max((uploadItems ?? []).filter((item) => item.status === "uploaded").length, existingPhotoCount);
  const failedCount = (uploadItems ?? []).filter((item) => item.status === "failed").length;

  function addFiles(files: File[]) {
    if (uploadItems === undefined) {
      setNotice("Triplog is still checking the photographs already saved. Try selecting them again in a moment.");
      return;
    }
    setError("");
    const accepted: SelectedPhoto[] = [];
    const rejected: string[] = [];
    const currentKeys = new Set(selected.map((photo) => photo.key));
    const incomingNewKeys = new Set(files.map(fileKey).filter((key) => !persistedByKey.has(key) && !currentKeys.has(key)));
    const currentNewCount = selected.filter((photo) => !persistedByKey.has(photo.key)).length;
    if (Math.max(uploadItems?.length ?? 0, existingPhotoCount) + currentNewCount + incomingNewKeys.size > MAX_PHOTOS) {
      setNotice(`This selection would take the journey above ${MAX_PHOTOS} photos. Nothing was added. Choose fewer photos and try again.`);
      return;
    }
    for (const file of files) {
      const key = fileKey(file);
      const looksLikeHeic = /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
      if (looksLikeHeic) { rejected.push(`${file.name} is a HEIC or HEIF photo. Triplog cannot prepare this format in V1. Export it as JPEG, PNG, or WebP and select it again.`); continue; }
      if (!SUPPORTED_TYPES.has(file.type)) { rejected.push(`${file.name} is not a supported JPEG, PNG, or WebP photo. Videos are not supported in V1.`); continue; }
      if (file.size > MAX_FILE_SIZE) { rejected.push(`${file.name} is larger than 50 MB.`); continue; }
      if (persistedByKey.get(key)?.status === "uploaded" || uploadedSignatures.has(fileSignature(file))) { rejected.push(`${file.name} is already safely uploaded.`); continue; }
      if (currentKeys.has(key) || accepted.some((photo) => photo.key === key)) continue;
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      accepted.push({ key, file, preview, status: "ready" });
    }
    if (accepted.length) setSelected((current) => [...current, ...accepted]);
    setNotice(rejected.slice(0, 4).join(" "));
  }

  function drop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }
  function remove(key: string) {
    setSelected((current) => {
      const removed = current.find((photo) => photo.key === key);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((photo) => photo.key !== key);
    });
  }
  function updateLocal(key: string, patch: Partial<SelectedPhoto>) {
    setSelected((current) => current.map((photo) => photo.key === key ? { ...photo, ...patch } : photo));
  }

  async function queueDraft(navigate = true) {
    await queueProcessing({ tripId: existingTripId });
    if (navigate) onComplete(existingTripId);
  }

  async function uploadSelected(onlyKey?: string) {
    const candidates = selected.filter((photo) => photo.status !== "saved" && (!onlyKey || photo.key === onlyKey));
    if (!candidates.length || uploading || uploadLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    setError("");
    setNotice("");
    const firstNewOrder = Math.max(uploadItems?.length ?? 0, existingPhotoCount);
    try {
      const reservations = candidates.map((photo, index) => ({
        uploadKey: photo.key,
        fileName: photo.file.name,
        fileType: photo.file.type,
        fileSize: photo.file.size,
        order: persistedByKey.get(photo.key)?.order ?? firstNewOrder + index,
      }));
      for (let index = 0; index < reservations.length; index += 100) await beginUpload({ tripId: existingTripId, items: reservations.slice(index, index + 100) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This upload could not start.");
      setUploading(false);
      uploadLock.current = false;
      return;
    }

    let saved = uploadedCount;
    let failures = 0;
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < candidates.length) {
        const index = nextIndex++;
        const photo = candidates[index];
        try {
          updateLocal(photo.key, { status: "preparing", error: undefined });
          await markUploadAttempt({ tripId: existingTripId, uploadKey: photo.key });
          const [metadata, variants] = await Promise.all([readPhotoMetadata(photo.file), createPhotoVariants(photo.file)]);
          updateLocal(photo.key, { status: "uploading" });
          const urls = await Promise.all(Array.from({ length: 4 }, () => generateUploadUrl({ tripId: existingTripId })));
          const [storageId, thumbnailStorageId, displayStorageId, largeStorageId] = await Promise.all([
            storeBlob(urls[0], photo.file), storeBlob(urls[1], variants.thumbnail), storeBlob(urls[2], variants.display), storeBlob(urls[3], variants.large),
          ]);
          await addPhoto({ tripId: existingTripId, uploadKey: photo.key, storageId, thumbnailStorageId, displayStorageId, largeStorageId, fileName: photo.file.name, order: persistedByKey.get(photo.key)?.order ?? firstNewOrder + index, ...metadata });
          saved += 1;
          setCompleted(saved);
          updateLocal(photo.key, { status: "saved" });
        } catch (caught) {
          failures += 1;
          const message = caught instanceof Error && caught.message ? caught.message : "This photo could not be saved.";
          updateLocal(photo.key, { status: "failed", error: message });
          await markUploadFailed({ tripId: existingTripId, uploadKey: photo.key, error: message }).catch(() => undefined);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, () => worker()));
    const newlySaved = saved - uploadedCount;
    const remainingOnDevice = selected.filter((photo) => photo.status !== "saved" && !candidates.some((candidate) => candidate.key === photo.key)).length;
    if (newlySaved > 0) {
      try {
        const shouldNavigate = failures === 0 && remainingOnDevice === 0;
        await queueDraft(shouldNavigate);
        if (!shouldNavigate) setNotice(`${newlySaved} new photo${newlySaved === 1 ? "" : "s"} saved. ${failures} file${failures === 1 ? "" : "s"} still need${failures === 1 ? "s" : ""} Retry.`);
        setUploading(false);
        uploadLock.current = false;
      }
      catch {
        setError("Your originals are safe, but Triplog could not queue the draft. Try again when the connection is stable.");
        setUploading(false);
        uploadLock.current = false;
      }
    } else {
      setError(`${failures} photo${failures === 1 ? "" : "s"} could not be saved. Reselect or retry only the failed items.`);
      setUploading(false);
      uploadLock.current = false;
    }
  }

  async function resumeReconstruction() {
    if (!existingPhotoCount) return;
    setError("");
    try { await queueDraft(); }
    catch {
      setError("Your saved photographs are safe, but the draft could not be queued. Try again when the connection is stable.");
    }
  }

  return (
    <main className="onboarding-shell core-product">
      <header className="onboarding-header"><p className="wordmark">Triplog</p><p><span className="status-dot" />Private to you</p>{onCancel ? <button className="text-button" type="button" onClick={onCancel}>Back to journey</button> : null}</header>
      <section className="onboarding-intro" aria-labelledby="onboarding-title">
        <p className="eyebrow">{existingPhotoCount ? `${existingPhotoCount} already saved` : "Start with what you already have"}</p><h1 id="onboarding-title">{existingPhotoCount ? "Add only the new photographs." : "Choose the photographs from this trip."}</h1>
        <p>Triplog saves the unchanged original and makes three smaller viewing copies. It is not a replacement for your phone or cloud backup.</p>
      </section>
      <section className="selection-workspace" aria-label="Choose trip photographs">
        <label className="photo-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input type="file" disabled={uploadItems === undefined} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
          <span className="dropzone-title">{uploadItems === undefined ? "Checking saved photos…" : "Choose trip photos"}</span><span>or drag JPEG, PNG, and WebP images here</span>
        </label>
        <div className="upload-overview" aria-live="polite">
          <div><strong>{uploadedCount}</strong><span>saved</span></div><div><strong>{unfinished.length}</strong><span>unfinished</span></div><div><strong>{failedCount}</strong><span>failed</span></div><div><strong>{selected.length}</strong><span>ready here</span></div>
        </div>
        {(uploadItems?.length ?? 0) > 0 ? <progress className="real-progress" max={uploadItems!.length} value={uploadedCount}>{uploadedCount} of {uploadItems!.length}</progress> : null}
        {unfinished.length ? (
          <section className="unfinished-uploads"><p className="eyebrow">Still needs this device</p><h2>Reselect unfinished photos to continue them.</h2><p>Successfully uploaded photos will be skipped. Choose the same files again and Triplog will match them by name, size, and last changed time.</p>
            <ul>{unfinished.slice(0, 12).map((item) => <li key={item._id}><span>{item.fileName}</span><strong>{item.status === "failed" ? "Failed — retry" : "Unfinished"}</strong>{item.error ? <small>{item.error}</small> : null}</li>)}</ul>
            {unfinished.length > 12 ? <p>And {unfinished.length - 12} more unfinished photos.</p> : null}</section>
        ) : null}
        {notice ? <p className="form-error" role="alert">{notice}</p> : null}
        {selected.length ? (
          <ul className="selection-grid upload-selection-grid" aria-label="Photos selected on this device">
            {selected.map((photo, index) => <li key={photo.key} data-status={photo.status}><Image src={photo.preview} alt={`Selected photo ${index + 1}: ${photo.file.name}`} width={220} height={165} unoptimized /><div><span>{photo.status === "ready" ? String(index + 1).padStart(2, "0") : photo.status}</span>{!uploading && photo.status !== "saved" ? <button type="button" onClick={() => remove(photo.key)} aria-label={`Remove ${photo.file.name}`}>Remove</button> : null}</div>{photo.error ? <small><strong>{photo.file.name}</strong>: {photo.error}</small> : null}{photo.status === "failed" ? <button className="retry-photo-button" type="button" disabled={uploading} onClick={() => void uploadSelected(photo.key)}>Retry {photo.file.name}</button> : null}</li>)}
          </ul>
        ) : <div className="selection-empty">Your selected photographs will appear here before anything is uploaded.</div>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="selection-action"><p>{uploading ? `${completed} originals saved. Failed items will not stop the others.` : "Choose the photos that best tell this trip. Unsupported formats, videos, and files above 50 MB are rejected before upload."}</p><div>
          {reconstructionNeeded && existingPhotoCount > 0 && !selected.length ? <button className="secondary-button" disabled={uploading} onClick={() => void resumeReconstruction()}>Continue reconstruction</button> : null}
          <button className="primary-button" disabled={!selected.some((photo) => photo.status !== "saved") || uploading} onClick={() => void uploadSelected()}>{uploading ? "Uploading…" : selected.length ? `Upload ${selected.filter((photo) => photo.status !== "saved").length} selected photo${selected.filter((photo) => photo.status !== "saved").length === 1 ? "" : "s"}` : "Choose photos to continue"}</button>
        </div></div>
      </section>
    </main>
  );
}
