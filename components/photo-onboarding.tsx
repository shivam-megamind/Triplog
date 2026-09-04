"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { DragEvent, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createOptimizedPhoto, readPhotoMetadata } from "@/lib/photo-metadata";
import { canonicalPhotoMimeType, createTaskLimiter, photoFileError } from "@/lib/photo-upload";
import { MAX_PHOTOS } from "@/lib/trip";

type LocalStatus = "ready" | "preparing" | "uploading" | "saved" | "failed";
type SelectedPhoto = { key: string; file: File; preview: string; status: LocalStatus; error?: string };
type RejectedPhoto = { id: string; name: string; error: string };
type SelectionReceipt = { total: number; accepted?: number; rejected?: number; preparing: boolean };
type BatchProgress = { total: number; finished: number; failures: number; stage: "preparing" | "uploading" };

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

async function waitForVisiblePaint() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function localStatusLabel(status: LocalStatus, index: number) {
  if (status === "ready") return `Ready ${String(index + 1).padStart(2, "0")}`;
  return status[0].toUpperCase() + status.slice(1);
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
  const reconcileSingleImageUpload = useMutation(api.trips.reconcileSingleImageUpload);
  const queueProcessing = useMutation(api.trips.queueProcessing);
  const [selected, setSelected] = useState<SelectedPhoto[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(initialError);
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectionReceipt, setSelectionReceipt] = useState<SelectionReceipt>();
  const [rejected, setRejected] = useState<RejectedPhoto[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>();
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
      setNotice("Postcard is still checking the photographs already saved. Try selecting them again in a moment.");
      return { accepted: 0, rejected: files.length };
    }
    setError("");
    const accepted: SelectedPhoto[] = [];
    const rejectedFiles: RejectedPhoto[] = [];
    const currentKeys = new Set(selected.map((photo) => photo.key));
    const incomingNewKeys = new Set(files.map(fileKey).filter((key) => !persistedByKey.has(key) && !currentKeys.has(key)));
    const currentNewCount = selected.filter((photo) => !persistedByKey.has(photo.key)).length;
    if (Math.max(uploadItems?.length ?? 0, existingPhotoCount) + currentNewCount + incomingNewKeys.size > MAX_PHOTOS) {
      const message = `This selection would take the journey above ${MAX_PHOTOS} photos. Nothing was added. Choose fewer photos and try again.`;
      setNotice(message);
      setRejected(files.map((file, index) => ({ id: `${fileKey(file)}:${index}`, name: file.name, error: message })));
      return { accepted: 0, rejected: files.length };
    }
    for (const [index, file] of files.entries()) {
      const key = fileKey(file);
      const validationError = photoFileError(file);
      const rejectionId = `${key}:${index}`;
      if (validationError) { rejectedFiles.push({ id: rejectionId, name: file.name, error: validationError }); continue; }
      if (persistedByKey.get(key)?.status === "uploaded" || uploadedSignatures.has(fileSignature(file))) { rejectedFiles.push({ id: rejectionId, name: file.name, error: `${file.name} is already safely uploaded.` }); continue; }
      if (currentKeys.has(key)) { rejectedFiles.push({ id: rejectionId, name: file.name, error: `${file.name} is already selected on this device.` }); continue; }
      if (accepted.some((photo) => photo.key === key)) { rejectedFiles.push({ id: rejectionId, name: file.name, error: `${file.name} was selected more than once.` }); continue; }
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      accepted.push({ key, file, preview, status: "ready" });
    }
    if (accepted.length) setSelected((current) => [...current, ...accepted]);
    setRejected(rejectedFiles);
    setNotice(rejectedFiles.length ? `${countLabel(rejectedFiles.length, "file")} need attention below. No file was silently skipped.` : "");
    return { accepted: accepted.length, rejected: rejectedFiles.length };
  }

  async function receiveFiles(files: File[]) {
    if (!files.length || selecting || uploading) return;
    setSelecting(true);
    setRejected([]);
    setNotice("");
    setSelectionReceipt({ total: files.length, preparing: true });
    await waitForVisiblePaint();
    const result = addFiles(files);
    setSelectionReceipt({ total: files.length, ...result, preparing: false });
    setSelecting(false);
  }

  function drop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); void receiveFiles(Array.from(event.dataTransfer.files)); }
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
    setBatchProgress({ total: candidates.length, finished: 0, failures: 0, stage: "preparing" });
    setError("");
    setNotice("");
    const firstNewOrder = Math.max(uploadItems?.length ?? 0, existingPhotoCount);
    try {
      const reservations = candidates.map((photo, index) => ({
        uploadKey: photo.key,
        fileName: photo.file.name,
        fileType: canonicalPhotoMimeType(photo.file)!,
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
    const preparePhoto = createTaskLimiter(1);
    const uploadBlob = createTaskLimiter(2);

    function finishPhoto(failed: boolean) {
      setBatchProgress((current) => current ? {
        ...current,
        finished: current.finished + 1,
        failures: current.failures + (failed ? 1 : 0),
      } : current);
    }

    async function worker() {
      while (nextIndex < candidates.length) {
        const index = nextIndex++;
        const photo = candidates[index];
        let uploadedStorageId: Id<"_storage"> | undefined;
        try {
          await markUploadAttempt({ tripId: existingTripId, uploadKey: photo.key });
          const { metadata, optimized } = await preparePhoto(async () => {
            updateLocal(photo.key, { status: "preparing", error: undefined });
            await waitForVisiblePaint();
            const metadata = await readPhotoMetadata(photo.file);
            const optimized = await createOptimizedPhoto(photo.file);
            return { metadata, optimized };
          });
          updateLocal(photo.key, { status: "uploading" });
          setBatchProgress((current) => current ? { ...current, stage: "uploading" } : current);
          const uploadUrl = await generateUploadUrl({ tripId: existingTripId });
          uploadedStorageId = await uploadBlob(() => storeBlob(uploadUrl, optimized.blob));
          await addPhoto({ tripId: existingTripId, uploadKey: photo.key, storageId: uploadedStorageId, fileName: photo.file.name, order: persistedByKey.get(photo.key)?.order ?? firstNewOrder + index, ...metadata });
          saved += 1;
          updateLocal(photo.key, { status: "saved" });
          finishPhoto(false);
        } catch (caught) {
          const message = caught instanceof Error && caught.message ? caught.message : "This photo could not be saved.";
          let failureRecorded = false;
          if (uploadedStorageId) {
            const reconciliation = await reconcileSingleImageUpload({ tripId: existingTripId, uploadKey: photo.key, storageId: uploadedStorageId, error: message }).catch(() => undefined);
            failureRecorded = reconciliation !== undefined;
            if (reconciliation?.saved) {
              saved += 1;
              updateLocal(photo.key, { status: "saved", error: undefined });
              finishPhoto(false);
              continue;
            }
          }
          failures += 1;
          updateLocal(photo.key, { status: "failed", error: message });
          finishPhoto(true);
          if (!failureRecorded) await markUploadFailed({ tripId: existingTripId, uploadKey: photo.key, error: message }).catch(() => undefined);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, () => worker()));
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
        setError("Your saved photos are safe, but Postcard could not queue the draft. Try again when the connection is stable.");
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
      <header className="onboarding-header"><p className="wordmark">Postcard</p><p><span className="status-dot" />Private to you</p>{onCancel ? <button className="text-button" type="button" onClick={onCancel}>Back to journey</button> : null}</header>
      <section className="onboarding-intro" aria-labelledby="onboarding-title">
        <p className="eyebrow">{existingPhotoCount ? `${existingPhotoCount} already saved` : "Start with what you already have"}</p><h1 id="onboarding-title">{existingPhotoCount ? "Add only the new photographs." : "Choose the photographs from this trip."}</h1>
        <p>Postcard reads the original on this device, then saves one web-ready copy for your journey. Keep your originals in your phone or cloud backup.</p>
      </section>
      <section className="selection-workspace" aria-label="Choose trip photographs">
        <label className="photo-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input type="file" disabled={uploadItems === undefined || selecting || uploading} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ""; void receiveFiles(files); }} />
          <span className="dropzone-title">{uploadItems === undefined ? "Checking saved photos…" : selecting ? "Preparing photo list…" : "Choose trip photos"}</span><span>or drag JPEG, PNG, WebP, HEIC, and HEIF images here — videos are excluded</span>
        </label>
        {selectionReceipt ? <div className="upload-activity selection-receipt" role="status" aria-live="polite"><strong>{countLabel(selectionReceipt.total, "photo")} selected</strong><span>{selectionReceipt.preparing ? "Preparing your photo list…" : `${countLabel(selectionReceipt.accepted ?? 0, "photo")} ready · ${countLabel(selectionReceipt.rejected ?? 0, "file")} need attention`}</span></div> : null}
        {batchProgress ? <div className="upload-activity batch-progress" role="status" aria-live="polite"><strong>{batchProgress.stage === "preparing" ? `Preparing ${countLabel(batchProgress.total, "photo")}` : `Uploading ${batchProgress.finished} of ${batchProgress.total}`}</strong><span>{batchProgress.failures ? `${countLabel(batchProgress.failures, "file")} failed and can be retried below.` : "Failed items will not stop the remaining photos."}</span><progress max={batchProgress.total} value={batchProgress.finished}>{batchProgress.finished} of {batchProgress.total}</progress></div> : null}
        <div className="upload-overview" aria-live="polite">
          <div><strong>{uploadedCount}</strong><span>saved</span></div><div><strong>{unfinished.length}</strong><span>unfinished</span></div><div><strong>{failedCount}</strong><span>failed</span></div><div><strong>{selected.length}</strong><span>on this device</span></div>
        </div>
        {(uploadItems?.length ?? 0) > 0 ? <progress className="real-progress" max={uploadItems!.length} value={uploadedCount}>{uploadedCount} of {uploadItems!.length}</progress> : null}
        {unfinished.length ? (
          <section className="unfinished-uploads"><p className="eyebrow">Still needs this device</p><h2>Reselect unfinished photos to continue them.</h2><p>Successfully uploaded photos will be skipped. Choose the same files again and Postcard will match them by name, size, and last changed time.</p>
            <ul>{unfinished.slice(0, 12).map((item) => <li key={item._id}><span>{item.fileName}</span><strong>{item.status === "failed" ? "Failed — retry" : "Unfinished"}</strong>{item.error ? <small>{item.error}</small> : null}</li>)}</ul>
            {unfinished.length > 12 ? <p>And {unfinished.length - 12} more unfinished photos.</p> : null}</section>
        ) : null}
        {notice ? <p className="form-error" role="alert">{notice}</p> : null}
        {rejected.length ? <section className="rejected-files" aria-labelledby="rejected-files-title"><h2 id="rejected-files-title">Files that need attention</h2><ul>{rejected.map((item) => <li key={item.id}><strong>{item.name}</strong><span>{item.error}</span></li>)}</ul></section> : null}
        {selected.length ? (
          <ul className="selection-grid upload-selection-grid" aria-label="Photos selected on this device">
            {selected.map((photo, index) => <li key={photo.key} data-status={photo.status}><Image src={photo.preview} alt={`Selected photo ${index + 1}: ${photo.file.name}`} width={220} height={165} loading="lazy" decoding="async" unoptimized /><div><span>{localStatusLabel(photo.status, index)}</span>{!uploading && photo.status !== "saved" ? <button type="button" onClick={() => remove(photo.key)} aria-label={`Remove ${photo.file.name}`}>Remove</button> : null}</div>{photo.error ? <small><strong>{photo.file.name}</strong>: {photo.error}</small> : null}{photo.status === "failed" ? <button className="retry-photo-button" type="button" disabled={uploading} onClick={() => void uploadSelected(photo.key)}>Retry {photo.file.name}</button> : null}</li>)}
          </ul>
        ) : <div className="selection-empty">Your selected photographs will appear here before anything is uploaded.</div>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="selection-action"><p>{uploading && batchProgress ? (batchProgress.stage === "preparing" ? `Preparing ${countLabel(batchProgress.total, "photo")} without blocking the page.` : `Uploading ${batchProgress.finished} of ${batchProgress.total}.`) : "Choose the photos that best tell this trip. Unsupported formats, videos, and files above 50 MB are rejected before upload."}</p><div>
          {reconstructionNeeded && existingPhotoCount > 0 && !selected.length ? <button className="secondary-button" disabled={uploading} onClick={() => void resumeReconstruction()}>Continue reconstruction</button> : null}
          <button className="primary-button" disabled={!selected.some((photo) => photo.status !== "saved") || uploading || selecting} onClick={() => void uploadSelected()}>{uploading ? (batchProgress?.stage === "preparing" ? "Preparing photos…" : `Uploading ${batchProgress?.finished ?? 0} of ${batchProgress?.total ?? 0}`) : selected.length ? `Upload ${selected.filter((photo) => photo.status !== "saved").length} selected photo${selected.filter((photo) => photo.status !== "saved").length === 1 ? "" : "s"}` : "Choose photos to continue"}</button>
        </div></div>
      </section>
    </main>
  );
}
