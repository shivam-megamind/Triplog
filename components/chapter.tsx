"use client";

import Image from "next/image";
import { useState } from "react";
import { formatCaptureTime } from "@/lib/reconstruction";

type BookPhoto = {
  url: string | null;
  fileName?: string;
  width?: number;
  height?: number;
};

type BookMoment = {
  startTime?: number;
  memory: string;
  recommendation: string;
  warning: string;
  detail: string;
  representativePhoto: BookPhoto | null;
  photos: BookPhoto[];
};

type ChapterDay = {
  dayNumber: number;
  displayDate: string;
  place: string;
  memory?: string;
  photos?: BookPhoto[];
  moments?: BookMoment[];
};

function dateRange(startDate?: number, endDate?: number) {
  if (startDate === undefined && endDate === undefined) return "Dates held in your photographs";
  const format = (value: number) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  if (startDate === undefined) return format(endDate!);
  if (endDate === undefined || startDate === endDate) return format(startDate);
  return `${format(startDate)} — ${format(endDate)}`;
}

function MomentSpread({ moment, index, draft }: { moment: BookMoment; index: number; draft: boolean }) {
  const photo = moment.representativePhoto;
  const hasWords = moment.memory || moment.detail || moment.recommendation || moment.warning;
  return (
    <section className={index % 2 === 0 ? "book-moment" : "book-moment reverse"}>
      <figure className="book-moment-photo">
        {photo?.url ? <Image src={photo.url} alt={photo.fileName ?? "A photograph from this journey"} fill sizes="(max-width: 720px) 100vw, 58vw" /> : <div className="photo-empty">Photograph unavailable</div>}
        <figcaption>{formatCaptureTime(moment.startTime)}{moment.photos.length > 1 ? ` · ${moment.photos.length} photographs in this moment` : ""}</figcaption>
      </figure>
      <div className="book-moment-words">
        {moment.memory ? <blockquote>“{moment.memory}”</blockquote> : null}
        {moment.detail ? <div><p className="book-note-label">The detail the photo cannot show</p><p>{moment.detail}</p></div> : null}
        {moment.recommendation ? <div><p className="book-note-label">Worth recommending</p><p>{moment.recommendation}</p></div> : null}
        {moment.warning ? <div><p className="book-note-label">Worth knowing</p><p>{moment.warning}</p></div> : null}
        {!hasWords && draft ? <p className="book-empty-note">Add the part only you remember.</p> : null}
      </div>
    </section>
  );
}

function ChapterDaySection({ day, draft }: { day: ChapterDay; draft: boolean }) {
  const [visibleMoments, setVisibleMoments] = useState(16);
  const moments = day.moments ?? [];
  return (
    <section className="chapter">
      <header className="chapter-heading"><p className="chapter-kicker">Day {String(day.dayNumber).padStart(2, "0")} <span aria-hidden="true">·</span> {day.displayDate || "Date to confirm"}</p><h2>{day.place || "A place still to name"}</h2></header>
      {moments.length ? <>{moments.slice(0, visibleMoments).map((moment, index) => <MomentSpread key={`${day.dayNumber}-${index}`} moment={moment} index={index} draft={draft} />)}{moments.length > visibleMoments ? <button className="secondary-button chapter-load-more" onClick={() => setVisibleMoments((count) => count + 16)}>Continue through 16 more moments</button> : null}</> : (
        <div className="legacy-chapter"><div className={`photo-composition photo-count-${Math.min(day.photos?.length ?? 0, 3)}`}>{day.photos?.length ? day.photos.slice(0, 3).map((photo, index) => photo.url ? <figure className={`photo-frame photo-${index + 1}`} key={`${photo.url}-${index}`}><Image src={photo.url} alt={photo.fileName ?? "A photograph from this trip"} fill sizes={index === 0 ? "(max-width: 720px) 100vw, 60vw" : "(max-width: 720px) 50vw, 30vw"} /></figure> : null) : <div className="photo-empty">Photos from this day will appear here.</div>}</div>{day.memory || draft ? <div className="memory-block"><span className="opening-mark" aria-hidden="true">“</span><p>{day.memory || "Add the part only you remember."}</p></div> : null}</div>
      )}
    </section>
  );
}

export function Chapter({
  title,
  startDate,
  endDate,
  days,
  cover: selectedCover,
  draft = false,
}: {
  title: string;
  startDate?: number;
  endDate?: number;
  days: ChapterDay[];
  cover?: BookPhoto | null;
  draft?: boolean;
}) {
  const cover = selectedCover ?? days.flatMap((day) => day.moments ?? []).find((moment) => moment.representativePhoto?.url)?.representativePhoto;
  return (
    <article className="book">
      <header className={cover?.url ? "book-cover has-photo" : "book-cover"}>
        {cover?.url ? <Image src={cover.url} alt={cover.fileName ?? "Cover photograph from this journey"} fill priority sizes="(max-width: 720px) 100vw, 76vw" /> : null}
        <div className="book-cover-shade" />
        <div className="book-cover-copy">
          <p className="chapter-kicker">A completed journey</p>
          <h1>{title}</h1>
          <p className="book-date-range">{dateRange(startDate, endDate)}</p>
          {draft ? <p className="draft-label">Private preview</p> : null}
        </div>
      </header>
      {days.length ? days.map((day) => <ChapterDaySection key={`${day.dayNumber}-${day.displayDate}`} day={day} draft={draft} />) : <div className="photo-empty">Upload your photographs to reconstruct the journey.</div>}
    </article>
  );
}
