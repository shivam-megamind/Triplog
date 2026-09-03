"use client";

import Image from "next/image";
import { useState } from "react";
import { formatCaptureTime } from "@/lib/reconstruction";
import { DayNavigation, dayAnchorId, JourneyOverview, stopAnchorId } from "./journey-overview";

export type TimelinePhoto = { url: string | null; fileName?: string; width?: number; height?: number };
export type TimelineMoment = { _id?: string; startTime?: number; memory: string; recommendation: string; warning: string; detail: string; representativePhoto: TimelinePhoto | null; photos: TimelinePhoto[] };
export type TimelineStop = { _id?: string; label: string; placeSource: "gps" | "manual" | "unknown"; confidence: "high" | "low"; latitude?: number; longitude?: number; moments: TimelineMoment[] };
export type TimelineDay = { _id?: string; dayNumber: number; displayDate: string; stops: TimelineStop[] };

function dateRange(startDate?: number, endDate?: number) {
  if (startDate === undefined || endDate === undefined) return "Dates to confirm";
  const format = (value: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function MomentSummary({ moment }: { moment: TimelineMoment }) {
  const [showAll, setShowAll] = useState(false);
  const notes = [
    moment.memory ? { label: "Memory", value: moment.memory, kind: "memory" } : null,
    moment.detail ? { label: "Useful detail", value: moment.detail, kind: "detail" } : null,
    moment.recommendation ? { label: "Recommendation", value: moment.recommendation, kind: "recommendation" } : null,
    moment.warning ? { label: "Warning", value: moment.warning, kind: "warning" } : null,
  ].filter((item): item is { label: string; value: string; kind: string } => item !== null);
  const photos = [
    ...(moment.representativePhoto?.url ? [moment.representativePhoto] : []),
    ...moment.photos.filter((photo) => photo.url && photo.url !== moment.representativePhoto?.url),
  ];
  const visiblePhotos = showAll ? photos : photos.slice(0, 5);

  return (
    <article className="summary-moment">
      {visiblePhotos.length ? <div className={`summary-photo-grid photo-count-${Math.min(visiblePhotos.length, 5)}`}>{visiblePhotos.map((photo, index) => <figure className={index === 0 ? "primary-photo" : ""} key={`${photo.url}-${index}`}><Image src={photo.url!} alt={photo.fileName ?? `Trip photo ${index + 1}`} fill sizes={index === 0 ? "(max-width: 760px) 92vw, 650px" : "(max-width: 760px) 44vw, 260px"} /></figure>)}</div> : null}
      <div className="summary-moment-body">
        <div className="summary-moment-meta"><span>{formatCaptureTime(moment.startTime)}</span><span>{moment.photos.length} photo{moment.photos.length === 1 ? "" : "s"}</span></div>
        {notes.length ? <div className="summary-notes">{notes.map((note) => <section className={`summary-note ${note.kind}`} key={note.kind}><strong>{note.label}</strong><p>{note.value}</p></section>)}</div> : null}
        {photos.length > 5 ? <button className="quiet-action" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer photos" : `View all ${photos.length} photos`}</button> : null}
      </div>
    </article>
  );
}

export function JourneyTimeline({ title, destination, startDate, endDate, photoCount, days, cover, readOnly = false }: { title: string; destination: string; startDate?: number; endDate?: number; photoCount: number; days: TimelineDay[]; cover?: TimelinePhoto | null; readOnly?: boolean }) {
  const stopCount = days.reduce((total, day) => total + day.stops.length, 0);
  const firstDayId = days[0]?._id ?? (days[0] ? String(days[0].dayNumber) : undefined);
  const firstStopId = days[0]?.stops[0]?._id;
  const [activeDayId, setActiveDayId] = useState(firstDayId);
  const [activeStopId, setActiveStopId] = useState(firstStopId);
  return (
    <article className="travel-summary">
      <header className="travel-summary-header">
        <div className="travel-summary-copy"><p className="timeline-label">{readOnly ? "Shared journey" : "Journey timeline"}</p><h1>{title}</h1><p>{destination} · {dateRange(startDate, endDate)}</p><div className="timeline-stats"><span>{days.length} day{days.length === 1 ? "" : "s"}</span><span>{stopCount} stop{stopCount === 1 ? "" : "s"}</span><span>{photoCount} photo{photoCount === 1 ? "" : "s"}</span></div></div>
        {cover?.url ? <figure className="travel-summary-cover"><Image src={cover.url} alt={cover.fileName ?? `Main photo for ${title}`} fill priority sizes="(max-width: 760px) 100vw, 380px" /></figure> : null}
      </header>
      <JourneyOverview days={days} activeStopId={activeStopId} onSelectStop={setActiveStopId} />
      <DayNavigation days={days} activeDayId={activeDayId} onSelectDay={setActiveDayId} />
      <div className="travel-timeline">
        {days.map((day) => {
          const dayId = day._id ?? String(day.dayNumber);
          return <section className="summary-day" id={dayAnchorId(dayId)} key={dayId}><header className="summary-day-heading"><span>{day.dayNumber}</span><div><p>Day {day.dayNumber}</p><h2>{day.displayDate || "Date to confirm"}</h2></div></header><div className="summary-stops">{day.stops.map((stop, stopIndex) => {
            const stopId = stop._id ?? `${dayId}-${stopIndex}`;
            return <section className={activeStopId === stopId ? "summary-stop active" : "summary-stop"} id={stopAnchorId(stopId)} key={stopId}><header><span className={`stop-dot ${stop.placeSource}`} /><div><h3>{stop.label || "Place name unavailable"}</h3><p>{stop.placeSource === "manual" ? "Location confirmed by the traveller" : stop.placeSource === "gps" ? "Suggested from photo GPS" : "No usable GPS in these photos"}</p></div></header><div className="summary-moments">{stop.moments.map((moment, momentIndex) => <MomentSummary key={moment._id ?? `${stopIndex}-${momentIndex}`} moment={moment} />)}</div></section>;
          })}</div></section>;
        })}
      </div>
    </article>
  );
}
