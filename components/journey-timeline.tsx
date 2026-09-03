"use client";

import Image from "next/image";
import { useState } from "react";
import { formatCaptureTime } from "@/lib/reconstruction";

export type TimelinePhoto = {
  url: string | null;
  fileName?: string;
  width?: number;
  height?: number;
};

export type TimelineMoment = {
  _id?: string;
  startTime?: number;
  memory: string;
  recommendation: string;
  warning: string;
  detail: string;
  representativePhoto: TimelinePhoto | null;
  photos: TimelinePhoto[];
};

export type TimelineStop = {
  _id?: string;
  label: string;
  placeSource: "gps" | "manual" | "unknown";
  confidence: "high" | "low";
  latitude?: number;
  longitude?: number;
  moments: TimelineMoment[];
};

export type TimelineDay = {
  _id?: string;
  dayNumber: number;
  displayDate: string;
  stops: TimelineStop[];
};

function dateRange(startDate?: number, endDate?: number) {
  if (startDate === undefined || endDate === undefined) return "Dates to confirm";
  const format = (value: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function MomentSummary({ moment }: { moment: TimelineMoment }) {
  const [showAll, setShowAll] = useState(false);
  const textItems = [
    moment.memory ? { label: "Memory", value: moment.memory } : null,
    moment.detail ? { label: "Detail", value: moment.detail } : null,
    moment.recommendation ? { label: "Recommendation", value: moment.recommendation } : null,
    moment.warning ? { label: "Warning", value: moment.warning } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
  const visiblePhotos = showAll ? moment.photos : moment.photos.slice(0, 4);

  return (
    <article className="summary-moment">
      {moment.representativePhoto?.url ? (
        <figure className="summary-moment-primary">
          <Image src={moment.representativePhoto.url} alt={moment.representativePhoto.fileName ?? "Trip photo"} fill sizes="(max-width: 720px) 100vw, 360px" />
        </figure>
      ) : null}
      <div className="summary-moment-body">
        <div className="summary-moment-meta"><span>{formatCaptureTime(moment.startTime)}</span><span>{moment.photos.length} photo{moment.photos.length === 1 ? "" : "s"}</span></div>
        {textItems.length ? textItems.map((item) => <div className={`summary-note ${item.label === "Warning" ? "warning" : ""}`} key={item.label}><strong>{item.label}</strong><p>{item.value}</p></div>) : <p className="summary-empty">No personal notes added.</p>}
        {moment.photos.length > 1 ? (
          <div className="summary-photo-group">
            <div className="summary-photo-grid">{visiblePhotos.map((photo, index) => photo.url ? <figure key={`${photo.url}-${index}`}><Image src={photo.url} alt={photo.fileName ?? `Photo ${index + 1}`} fill sizes="120px" /></figure> : null)}</div>
            {moment.photos.length > 4 ? <button className="text-button" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer photos" : `View all ${moment.photos.length} photos`}</button> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function JourneyTimeline({ title, destination, startDate, endDate, photoCount, days, cover, readOnly = false }: {
  title: string;
  destination: string;
  startDate?: number;
  endDate?: number;
  photoCount: number;
  days: TimelineDay[];
  cover?: TimelinePhoto | null;
  readOnly?: boolean;
}) {
  const stopCount = days.reduce((total, day) => total + day.stops.length, 0);
  return (
    <article className="travel-summary">
      <header className="travel-summary-header">
        <div className="travel-summary-copy">
          <p className="timeline-label">{readOnly ? "Shared trip summary" : "Trip timeline"}</p>
          <h1>{title}</h1>
          <p>{destination} · {dateRange(startDate, endDate)}</p>
          <div className="timeline-stats"><span>{days.length} day{days.length === 1 ? "" : "s"}</span><span>{stopCount} stop{stopCount === 1 ? "" : "s"}</span><span>{photoCount} photo{photoCount === 1 ? "" : "s"}</span></div>
        </div>
        {cover?.url ? <figure className="travel-summary-cover"><Image src={cover.url} alt={cover.fileName ?? `Cover for ${title}`} fill priority sizes="(max-width: 720px) 100vw, 320px" /></figure> : null}
      </header>

      <div className="travel-timeline">
        {days.map((day) => (
          <section className="summary-day" key={day._id ?? `${day.dayNumber}-${day.displayDate}`}>
            <header className="summary-day-heading"><span>{day.dayNumber}</span><div><p>Day {day.dayNumber}</p><h2>{day.displayDate || "Date to confirm"}</h2></div></header>
            <div className="summary-stops">
              {day.stops.map((stop, stopIndex) => (
                <section className="summary-stop" key={stop._id ?? `${day.dayNumber}-${stopIndex}`}>
                  <header><span className={`stop-dot ${stop.placeSource}`} /><div><h3>{stop.label || "Place name unavailable"}</h3><p>{stop.placeSource === "manual" ? "Location confirmed by the traveller" : stop.placeSource === "gps" ? "Suggested from photo GPS" : "No usable GPS in these photos"}</p></div></header>
                  <div className="summary-moments">{stop.moments.map((moment, momentIndex) => <MomentSummary key={moment._id ?? `${stopIndex}-${momentIndex}`} moment={moment} />)}</div>
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
