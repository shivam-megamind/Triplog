"use client";

import { useMutation } from "convex/react";
import { FormEvent, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { journeyDetailsErrors, MAX_DESTINATION_LENGTH, type JourneyDetailsErrors } from "@/lib/trip";

function dateValue(value: string) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

export function JourneySetup({ onCreated, onCancel }: { onCreated: (tripId: Id<"trips">) => void; onCancel: () => void }) {
  const createTrip = useMutation(api.trips.create);
  const requestId = useRef(crypto.randomUUID());
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<JourneyDetailsErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = { destination, startDate: dateValue(startDate), endDate: dateValue(endDate) };
    const nextErrors = journeyDetailsErrors(values);
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    try {
      const tripId = await createTrip({
        destination: destination.trim(),
        startDate: values.startDate!,
        endDate: values.endDate!,
        creationRequestId: requestId.current,
      });
      onCreated(tripId);
    } catch {
      setFormError("This journey could not be created. Check the details and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell core-product">
      <header className="onboarding-header">
        <p className="wordmark">Postcard</p>
        <p><span className="status-dot" />Private to you</p>
        <button className="text-button" type="button" onClick={onCancel}>Back to journeys</button>
      </header>
      <section className="journey-setup" aria-labelledby="journey-setup-title">
        <div>
          <p className="eyebrow">Create a journey</p>
          <h1 id="journey-setup-title">Start with the shape of the trip.</h1>
          <p>Give Postcard just enough context to recognise the photographs. You can correct every suggestion later.</p>
        </div>
        <form className="journey-setup-form" onSubmit={submit} noValidate>
          <label>
            Destination or trip region
            <input value={destination} maxLength={MAX_DESTINATION_LENGTH} onChange={(event) => { setDestination(event.target.value); setErrors((current) => ({ ...current, destination: undefined })); }} aria-invalid={Boolean(errors.destination)} aria-describedby={errors.destination ? "destination-error" : undefined} autoComplete="off" />
            {errors.destination ? <span className="field-error" id="destination-error">{errors.destination}</span> : <span>A city, region, country, or a multi-country trip · {destination.length} / {MAX_DESTINATION_LENGTH}</span>}
          </label>
          <div className="journey-date-fields">
            <label>
              Approximate start date
              <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setErrors((current) => ({ ...current, startDate: undefined, endDate: undefined })); }} aria-invalid={Boolean(errors.startDate)} aria-describedby={errors.startDate ? "start-date-error" : undefined} />
              {errors.startDate ? <span className="field-error" id="start-date-error">{errors.startDate}</span> : null}
            </label>
            <label>
              Approximate end date
              <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setErrors((current) => ({ ...current, endDate: undefined })); }} aria-invalid={Boolean(errors.endDate)} aria-describedby={errors.endDate ? "end-date-error" : undefined} />
              {errors.endDate ? <span className="field-error" id="end-date-error">{errors.endDate}</span> : null}
            </label>
          </div>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <div className="journey-setup-actions">
            <button className="text-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
            <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Continue to photos"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
