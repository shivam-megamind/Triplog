"use client";

type OverviewStop = {
  _id?: string;
  label: string;
  latitude?: number;
  longitude?: number;
  placeSource: "gps" | "manual" | "unknown";
};

type OverviewDay = {
  _id?: string;
  dayNumber: number;
  displayDate: string;
  stops: OverviewStop[];
};

type NumberedStop = OverviewStop & {
  id: string;
  dayNumber: number;
  date: string;
  number: number;
};

export function stopAnchorId(stopId: string) {
  return `journey-stop-${stopId}`;
}

export function dayAnchorId(dayId: string) {
  return `journey-day-${dayId}`;
}

function positions(stops: NumberedStop[]) {
  const gpsStops = stops.filter((stop) => stop.latitude !== undefined && stop.longitude !== undefined);
  if (!gpsStops.length) return [];
  const latitudes = gpsStops.map((stop) => stop.latitude!);
  const longitudes = gpsStops.map((stop) => stop.longitude!);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;
  return gpsStops.map((stop, index) => ({
    ...stop,
    x: lngRange === 0 ? 50 + ((index % 3) - 1) * 8 : 10 + ((stop.longitude! - minLng) / lngRange) * 80,
    y: latRange === 0 ? 50 + ((index % 2) ? 7 : -7) : 90 - ((stop.latitude! - minLat) / latRange) * 80,
  }));
}

export function JourneyOverview({ days, activeStopId, onSelectStop }: {
  days: OverviewDay[];
  activeStopId?: string;
  onSelectStop?: (stopId: string) => void;
}) {
  const stops: NumberedStop[] = days.flatMap((day) => day.stops.map((stop, index) => ({
    ...stop,
    id: stop._id ?? `${day._id ?? day.dayNumber}-${index}`,
    dayNumber: day.dayNumber,
    date: day.displayDate,
    number: 0,
  }))).map((stop, index) => ({ ...stop, number: index + 1 }));
  const plotted = positions(stops);
  const line = plotted.map((stop) => `${stop.x},${stop.y}`).join(" ");

  function select(stopId: string) {
    onSelectStop?.(stopId);
    document.getElementById(stopAnchorId(stopId))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="journey-map" aria-labelledby="journey-map-title">
      <div className="journey-map-heading">
        <div>
          <p className="timeline-label">Journey overview</p>
          <h2 id="journey-map-title">Photo-backed stop sequence</h2>
        </div>
        <p><span className="route-dash" />Approximate sequence, not the exact route travelled</p>
      </div>
      {plotted.length ? (
        <div className="geographic-canvas" aria-label={`${plotted.length} stops with photo GPS evidence`}>
          <span className="map-compass" aria-hidden="true">N</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {plotted.length > 1 ? <polyline points={line} vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {plotted.map((stop) => (
            <button
              className={activeStopId === stop.id ? "map-stop active" : "map-stop"}
              key={stop.id}
              style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
              type="button"
              onClick={() => select(stop.id)}
              aria-label={`Stop ${stop.number}: ${stop.label || "Place name unavailable"}`}
            >
              <span>{stop.number}</span>
              <strong>{stop.label || "Place name unavailable"}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="geographic-empty">
          <span aria-hidden="true">⌖</span>
          <div><h3>Location overview unavailable</h3><p>These photos do not contain usable GPS evidence. The dated timeline remains available below.</p></div>
        </div>
      )}
      {stops.length ? (
        <ol className="route-sequence" aria-label="Stops in chronological order">
          {stops.map((stop) => <li key={stop.id}><button className={activeStopId === stop.id ? "active" : ""} type="button" onClick={() => select(stop.id)}><span>{stop.number}</span><span><strong>{stop.label || "Place name unavailable"}</strong><small>Day {stop.dayNumber} · {stop.date}</small></span></button></li>)}
        </ol>
      ) : null}
    </section>
  );
}

export function DayNavigation({ days, activeDayId, onSelectDay }: {
  days: OverviewDay[];
  activeDayId?: string;
  onSelectDay?: (dayId: string) => void;
}) {
  if (!days.length) return null;
  function select(dayId: string) {
    onSelectDay?.(dayId);
    document.getElementById(dayAnchorId(dayId))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <nav className="day-navigation" aria-label="Journey days">
      {days.map((day) => {
        const id = day._id ?? String(day.dayNumber);
        return <button className={activeDayId === id ? "active" : ""} key={id} type="button" onClick={() => select(id)}><span>Day {day.dayNumber}</span><strong>{day.displayDate || "Date to confirm"}</strong></button>;
      })}
    </nav>
  );
}
