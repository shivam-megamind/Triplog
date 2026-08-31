import Image from "next/image";

type ChapterDay = {
  dayNumber: number;
  displayDate: string;
  place: string;
  memory: string;
  photos: Array<{ url: string | null; alt?: string; fileName?: string }>;
};

export function Chapter({ title, days, draft = false }: { title: string; days: ChapterDay[]; draft?: boolean }) {
  return (
    <article className="book">
      <header className="book-cover">
        <p className="chapter-kicker">A completed journey</p>
        <h1>{title}</h1>
        {draft ? <p className="draft-label">Private preview</p> : null}
      </header>
      {days.length ? days.map((day) => (
        <section className="chapter" key={`${day.dayNumber}-${day.displayDate}`}>
          <header className="chapter-heading">
            <p className="chapter-kicker">Day {day.dayNumber} <span aria-hidden="true">·</span> {day.displayDate || "Date to confirm"}</p>
            <h2>{day.place || "Place to confirm"}</h2>
          </header>
          <div className={`photo-composition photo-count-${Math.min(day.photos.length, 3)}`}>
            {day.photos.length ? day.photos.slice(0, 3).map((photo, index) => photo.url ? (
              <figure className={`photo-frame photo-${index + 1}`} key={`${photo.url}-${index}`}>
                <Image src={photo.url} alt={photo.alt ?? photo.fileName ?? "A photograph from this trip"} fill sizes={index === 0 ? "(max-width: 720px) 100vw, 60vw" : "(max-width: 720px) 50vw, 30vw"} />
              </figure>
            ) : null) : <div className="photo-empty">Photos from this day will appear here.</div>}
          </div>
          <div className="memory-block"><span className="opening-mark" aria-hidden="true">“</span><p>{day.memory || "Add the part only you remember."}</p></div>
        </section>
      )) : <div className="photo-empty">Upload your photographs to reconstruct the first day.</div>}
    </article>
  );
}

