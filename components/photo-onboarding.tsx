"use client";

import Image from "next/image";
import { useAction, useMutation } from "convex/react";
import { DragEvent, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { readPhotoMetadata } from "@/lib/photo-metadata";
import { MAX_PHOTOS } from "@/lib/trip";

const BATCH_SIZE = 3;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type SelectedPhoto = {
  id: string;
  file: File;
  preview: string;
};

type ProcessingStep = "reading" | "ordering" | "grouping" | "shaping" | "ready";

const PROCESSING_STEPS: Array<{ key: ProcessingStep; label: string }> = [
  { key: "reading", label: "Reading capture dates and locations" },
  { key: "ordering", label: "Putting photos in order" },
  { key: "grouping", label: "Grouping similar moments" },
  { key: "shaping", label: "Finding the shape of your journey" },
  { key: "ready", label: "Your first draft is ready" },
];

function ProcessingExperience({ step, completed, total }: { step: ProcessingStep; completed: number; total: number }) {
  const activeIndex = PROCESSING_STEPS.findIndex((item) => item.key === step);
  return (
    <main className="processing-shell" aria-labelledby="processing-title" aria-live="polite">
      <p className="wordmark">Triplog</p>
      <section className="processing-copy">
        <p className="eyebrow">Built from your photos. Told in your voice.</p>
        <h1 id="processing-title">Making the first draft.</h1>
        <p>Triplog is reading what your photographs can tell us. Your own memories stay yours to add.</p>
      </section>
      <ol className="processing-list">
        {PROCESSING_STEPS.map((item, index) => (
          <li className={index < activeIndex ? "complete" : index === activeIndex ? "active" : "waiting"} key={item.key}>
            <span aria-hidden="true">{index < activeIndex ? "✓" : String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{item.label}</strong>
              {item.key === "reading" && index === activeIndex ? <small>{completed} of {total} photos securely saved</small> : null}
            </div>
          </li>
        ))}
      </ol>
      {step === "reading" ? <progress className="real-progress" max={Math.max(total, 1)} value={completed}>{completed} of {total}</progress> : null}
    </main>
  );
}

export function PhotoOnboarding({
  existingTripId,
  existingPhotoCount = 0,
  onComplete,
  onCancel,
  onStart,
  initialError = "",
}: {
  existingTripId?: Id<"trips">;
  existingPhotoCount?: number;
  onComplete: (tripId: Id<"trips">) => void;
  onCancel?: () => void;
  onStart?: () => void;
  initialError?: string;
}) {
  const createTrip = useMutation(api.trips.create);
  const generateUploadUrl = useMutation(api.trips.generateUploadUrl);
  const addPhoto = useMutation(api.trips.addPhoto);
  const setProcessingStatus = useMutation(api.trips.setProcessingStatus);
  const rebuildDays = useMutation(api.trips.rebuildDays);
  const rebuildMoments = useMutation(api.trips.rebuildMoments);
  const resolvePlaces = useAction(api.trips.resolvePlaces);
  const [selected, setSelected] = useState<SelectedPhoto[]>([]);
  const [unsupported, setUnsupported] = useState("");
  const [error, setError] = useState(initialError);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<ProcessingStep>("reading");
  const [completed, setCompleted] = useState(existingPhotoCount);
  const previews = useRef<string[]>([]);

  useEffect(() => () => {
    for (const preview of previews.current) URL.revokeObjectURL(preview);
  }, []);

  function addFiles(files: File[]) {
    setError("");
    const accepted: SelectedPhoto[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!SUPPORTED_TYPES.has(file.type)) {
        rejected.push(`${file.name} is not a JPEG, PNG, or WebP image.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} is larger than 50 MB.`);
        continue;
      }
      if (selected.length + accepted.length >= MAX_PHOTOS) {
        rejected.push(`A trip can hold up to ${MAX_PHOTOS} photos.`);
        break;
      }
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      accepted.push({ id: crypto.randomUUID(), file, preview });
    }
    if (accepted.length) setSelected((current) => [...current, ...accepted]);
    setUnsupported(rejected.slice(0, 3).join(" "));
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  }

  function remove(photoId: string) {
    setSelected((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((photo) => photo.id !== photoId);
    });
  }

  async function reconstruct(tripId: Id<"trips">) {
    setStep("ordering");
    await setProcessingStatus({ tripId, status: "ordering", processedPhotoCount: completed || existingPhotoCount });
    await rebuildDays({ tripId });
    setStep("grouping");
    await setProcessingStatus({ tripId, status: "grouping" });
    await rebuildMoments({ tripId });
    setStep("shaping");
    await setProcessingStatus({ tripId, status: "shaping" });
    await resolvePlaces({ tripId });
    setStep("ready");
    await setProcessingStatus({ tripId, status: "ready" });
    onComplete(tripId);
  }

  async function uploadAndReconstruct() {
    if (!selected.length && !existingPhotoCount) return;
    onStart?.();
    setProcessing(true);
    setError("");
    setStep("reading");
    let tripId = existingTripId;
    let saved = existingPhotoCount;
    try {
      if (!tripId) tripId = await createTrip({});
      await setProcessingStatus({ tripId, status: "reading", processedPhotoCount: saved });
      for (let start = 0; start < selected.length; start += BATCH_SIZE) {
        const batch = selected.slice(start, start + BATCH_SIZE);
        const prepared = await Promise.all(batch.map(async (photo, batchIndex) => ({
          photo,
          order: existingPhotoCount + start + batchIndex,
          metadata: await readPhotoMetadata(photo.file),
        })));
        for (const item of prepared) {
          const uploadUrl = await generateUploadUrl({ tripId });
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": item.photo.file.type },
            body: item.photo.file,
          });
          if (!response.ok) throw new Error(`upload:${item.photo.file.name}`);
          const { storageId } = await response.json() as { storageId: Id<"_storage"> };
          await addPhoto({
            tripId,
            storageId,
            fileName: item.photo.file.name,
            order: item.order,
            ...item.metadata,
          });
          saved += 1;
          setCompleted(saved);
          await setProcessingStatus({ tripId, status: "reading", processedPhotoCount: saved });
        }
      }
      await reconstruct(tripId);
    } catch (caught) {
      if (tripId) await setProcessingStatus({ tripId, status: "error", processedPhotoCount: saved }).catch(() => undefined);
      const failedFile = caught instanceof Error && caught.message.startsWith("upload:") ? caught.message.slice(7) : "one photograph";
      setError(`${saved} photo${saved === 1 ? " was" : "s were"} saved, but ${failedFile} stopped the process. Your saved originals are safe.`);
      setProcessing(false);
    }
  }

  async function resumeExisting() {
    if (!existingTripId || !existingPhotoCount) return;
    setProcessing(true);
    setCompleted(existingPhotoCount);
    setError("");
    try {
      await reconstruct(existingTripId);
    } catch {
      await setProcessingStatus({ tripId: existingTripId, status: "error", processedPhotoCount: existingPhotoCount }).catch(() => undefined);
      setError("Your saved photographs are safe, but Triplog could not finish the first draft. Try again when the connection is stable.");
      setProcessing(false);
    }
  }

  if (processing) return <ProcessingExperience step={step} completed={completed} total={existingPhotoCount + selected.length} />;

  if (existingPhotoCount > 0 && selected.length === 0) {
    return (
      <main className="onboarding-shell">
        <header className="onboarding-header"><p className="wordmark">Triplog</p>{onCancel ? <button className="text-button" onClick={onCancel}>Back to trips</button> : null}</header>
        <section className="resume-card">
          <p className="eyebrow">Your originals are safe</p>
          <h1>Finish the first draft.</h1>
          <p>{existingPhotoCount} saved photo{existingPhotoCount === 1 ? " is" : "s are"} waiting to be ordered into days and moments.</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" onClick={() => void resumeExisting()}>Continue reconstruction</button>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <p className="wordmark">Triplog</p>
        <p><span className="status-dot" />Private to you</p>
        {onCancel ? <button className="text-button" onClick={onCancel}>Back to trips</button> : null}
      </header>
      <section className="onboarding-intro" aria-labelledby="onboarding-title">
        <p className="eyebrow">Start with what you already have</p>
        <h1 id="onboarding-title">A trip is already waiting in your camera roll.</h1>
        <p>Choose photos from one completed journey. Triplog will make the first draft; you will make it yours.</p>
      </section>

      <section className="selection-workspace" aria-label="Choose trip photographs">
        <label className="photo-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
          <span className="dropzone-title">Choose trip photos</span>
          <span>or drag JPEG, PNG, and WebP images here</span>
        </label>
        <div className="selection-summary">
          <strong>{selected.length} photo{selected.length === 1 ? "" : "s"} selected</strong>
          <span>Add up to 500 photos. Your trip stays private until you choose to share it.</span>
        </div>
        {unsupported ? <p className="form-error" role="alert">{unsupported}</p> : null}
        {selected.length ? (
          <ul className="selection-grid" aria-label="Selected photographs">
            {selected.map((photo, index) => (
              <li key={photo.id}>
                <Image src={photo.preview} alt={`Selected photo ${index + 1}: ${photo.file.name}`} width={220} height={165} unoptimized />
                <div><span>{String(index + 1).padStart(2, "0")}</span><button type="button" onClick={() => remove(photo.id)} aria-label={`Remove ${photo.file.name}`}>Remove</button></div>
              </li>
            ))}
          </ul>
        ) : <div className="selection-empty">Your selected photographs will appear here before anything is uploaded.</div>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="selection-action">
          <p>Nothing is stored until you continue.</p>
          <button className="primary-button" disabled={!selected.length} onClick={() => void uploadAndReconstruct()}>
            {selected.length ? `Upload ${selected.length} photo${selected.length === 1 ? "" : "s"} and make first draft` : "Choose photos to continue"}
          </button>
        </div>
      </section>
    </main>
  );
}
