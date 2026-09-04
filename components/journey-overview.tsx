"use client";

/* Native images are required for map tiles; Next image optimisation is not suitable for a tile grid. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createJourneyMapScene, MAP_TILE_SIZE, spreadJourneyMapPoints } from "@/lib/journey-map";

type OverviewPhoto = {
  _id?: string;
  id?: string;
  fileName?: string;
  url?: string | null;
  displayUrl?: string | null;
  thumbnailUrl?: string | null;
};

type OverviewMoment = {
  representativePhoto?: OverviewPhoto | null;
  photos?: OverviewPhoto[];
};

type OverviewStop = {
  _id?: string;
  label: string;
  latitude?: number;
  longitude?: number;
  placeSource: "gps" | "manual" | "unknown";
  photoIds?: string[];
  photos?: OverviewPhoto[];
  moments?: OverviewMoment[];
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
  photoCount: number;
  representativePhoto?: OverviewPhoto;
};

export function stopAnchorId(stopId: string) {
  return `journey-stop-${stopId}`;
}

export function dayAnchorId(dayId: string) {
  return `journey-day-${dayId}`;
}

function mapMarkerId(stopId: string) {
  return `journey-map-marker-${stopId}`;
}

function routeStopCardId(stopId: string) {
  return `journey-route-stop-${stopId}`;
}

function photoDetails(stop: OverviewStop) {
  const momentPhotos = stop.moments?.flatMap((moment) => moment.photos ?? []) ?? [];
  const photos = [...(stop.photos ?? []), ...momentPhotos];
  const representativePhoto = stop.moments
    ?.map((moment) => moment.representativePhoto)
    .find((photo): photo is OverviewPhoto => Boolean(photo?.displayUrl ?? photo?.thumbnailUrl ?? photo?.url))
    ?? photos.find((photo) => Boolean(photo.displayUrl ?? photo.thumbnailUrl ?? photo.url));
  const distinctPhotos = new Set(photos.map((photo, index) => (
    photo._id ?? photo.id ?? photo.displayUrl ?? photo.thumbnailUrl ?? photo.url ?? `photo-${index}`
  )));
  return {
    photoCount: Math.max(stop.photoIds?.length ?? 0, distinctPhotos.size),
    representativePhoto,
  };
}

function photoUrl(photo?: OverviewPhoto) {
  return photo?.displayUrl ?? photo?.thumbnailUrl ?? photo?.url;
}

export function JourneyOverview({ days, activeStopId, onSelectStop }: {
  days: OverviewDay[];
  activeStopId?: string;
  onSelectStop?: (stopId: string) => void;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 900, height: 510 });
  const [failedSceneKey, setFailedSceneKey] = useState<string>();
  const [localActiveStopId, setLocalActiveStopId] = useState(activeStopId);
  const [selectedDetailStopId, setSelectedDetailStopId] = useState<string>();
  const stops = useMemo<NumberedStop[]>(() => days.flatMap((day) => day.stops.map((stop, index) => ({
    ...stop,
    ...photoDetails(stop),
    id: stop._id ?? `${day._id ?? day.dayNumber}-${index}`,
    dayNumber: day.dayNumber,
    date: day.displayDate,
    number: 0,
  }))).map((stop, index) => ({ ...stop, number: index + 1 })), [days]);
  const gpsStops = useMemo(() => stops.filter((stop): stop is NumberedStop & { latitude: number; longitude: number } => (
    Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
  )), [stops]);
  const scene = useMemo(() => createJourneyMapScene(gpsStops, mapSize), [gpsStops, mapSize]);
  const displayedPoints = useMemo(() => spreadJourneyMapPoints(scene?.points ?? [], mapSize), [mapSize, scene]);
  const selectedStop = stops.find((stop) => stop.id === selectedDetailStopId);
  const emphasizedStopId = selectedStop?.id ?? activeStopId ?? localActiveStopId;
  const line = displayedPoints.map((stop) => `${stop.x},${stop.y}`).join(" ");
  const sceneKey = scene
    ? `${scene.zoom}:${mapSize.width}:${mapSize.height}:${gpsStops.map((stop) => `${stop.id}:${stop.latitude}:${stop.longitude}`).join("|")}`
    : "none";
  const tileFailed = failedSceneKey === sceneKey;

  const activate = useCallback((stopId: string) => {
    setLocalActiveStopId(stopId);
    setSelectedDetailStopId(stopId);
    onSelectStop?.(stopId);
  }, [onSelectStop]);

  const selectMarker = useCallback((stopId: string) => {
    activate(stopId);
    window.requestAnimationFrame(() => {
      document.getElementById(routeStopCardId(stopId))?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }, [activate]);

  const selectSequenceCard = useCallback((stopId: string, hasMapMarker: boolean) => {
    activate(stopId);
    if (hasMapMarker) {
      window.requestAnimationFrame(() => {
        document.getElementById(mapMarkerId(stopId))?.focus({ preventScroll: true });
      });
    }
  }, [activate]);

  const viewTimelineStop = useCallback((stopId: string) => {
    document.getElementById(stopAnchorId(stopId))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const element = mapElement.current;
    if (!element) return;
    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        setMapSize((current) => {
          const next = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
          return current.width === next.width && current.height === next.height ? current : next;
        });
      }
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [gpsStops.length, tileFailed]);

  useEffect(() => {
    const bindings = stops.flatMap((stop) => {
      const element = document.getElementById(stopAnchorId(stop.id));
      if (!element) return [];
      const handleSelection = () => activate(stop.id);
      element.addEventListener("pointerdown", handleSelection);
      element.addEventListener("focusin", handleSelection);
      return [{ element, handleSelection }];
    });
    return () => bindings.forEach(({ element, handleSelection }) => {
      element.removeEventListener("pointerdown", handleSelection);
      element.removeEventListener("focusin", handleSelection);
    });
  }, [activate, stops]);

  const selectedPhotoUrl = photoUrl(selectedStop?.representativePhoto);

  return (
    <section className="journey-map" aria-labelledby="journey-map-title">
      <div className="journey-map-heading">
        <div>
          <p className="timeline-label">Journey overview</p>
          <h2 id="journey-map-title">Photo-backed stop sequence</h2>
        </div>
        <p><span className="route-dash" />Approximate sequence, not the exact route travelled</p>
      </div>
      {scene && !tileFailed ? (
        <div className="geographic-map" ref={mapElement} role="region" aria-label={`${displayedPoints.length} stops with photo GPS evidence`}>
          <div className="map-tile-layer" aria-hidden="true">
            {scene.tiles.map((tile) => (
              <img
                className="map-tile"
                key={tile.key}
                src={`https://tile.openstreetmap.org/${scene.zoom}/${tile.x}/${tile.y}.png`}
                alt=""
                width={MAP_TILE_SIZE}
                height={MAP_TILE_SIZE}
                draggable={false}
                style={{ left: tile.left, top: tile.top }}
                onError={() => setFailedSceneKey(sceneKey)}
              />
            ))}
          </div>
          <svg viewBox={`0 0 ${mapSize.width} ${mapSize.height}`} preserveAspectRatio="none" aria-hidden="true">
            {displayedPoints.length > 1 ? <polyline className="map-route-shadow" points={line} vectorEffect="non-scaling-stroke" /> : null}
            {displayedPoints.length > 1 ? <polyline className="map-route" points={line} vectorEffect="non-scaling-stroke" /> : null}
            {displayedPoints.filter((stop) => stop.displaced).map((stop) => (
              <g key={`anchor-${stop.id}`}>
                <line className="map-marker-anchor" x1={stop.anchorX} y1={stop.anchorY} x2={stop.x} y2={stop.y} vectorEffect="non-scaling-stroke" />
                <circle className="map-marker-origin" cx={stop.anchorX} cy={stop.anchorY} r="3" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
          {displayedPoints.map((stop) => (
            <button
              className={emphasizedStopId === stop.id ? "map-marker active" : "map-marker"}
              id={mapMarkerId(stop.id)}
              key={stop.id}
              style={{ left: stop.x, top: stop.y }}
              type="button"
              onClick={() => selectMarker(stop.id)}
              aria-label={`Stop ${stop.number}: ${stop.label || "Place name unavailable"}${stop.displaced ? ", marker offset slightly for clarity" : ""}`}
              aria-pressed={emphasizedStopId === stop.id}
              aria-describedby={selectedStop?.id === stop.id ? "selected-map-stop" : undefined}
            >
              <span>{stop.number}</span>
            </button>
          ))}
          <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
        </div>
      ) : (
        <div className="geographic-empty">
          <span aria-hidden="true">⌖</span>
          {tileFailed
            ? <div><h3>Map temporarily unavailable</h3><p>The basemap could not be loaded. The chronological stop list remains available below.</p></div>
            : <div><h3>Location overview unavailable</h3><p>These photos do not contain usable GPS evidence. The dated timeline remains available below.</p></div>}
        </div>
      )}
      {selectedStop ? (
        <article className={selectedPhotoUrl ? "map-stop-detail" : "map-stop-detail without-photo"} id="selected-map-stop" aria-live="polite">
          {selectedPhotoUrl ? (
            <img
              src={selectedPhotoUrl}
              alt={`Photo from ${selectedStop.label || "this stop"}`}
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
          ) : null}
          <div>
            <small>Stop {selectedStop.number} · Day {selectedStop.dayNumber}</small>
            <strong>{selectedStop.label || "Place name unavailable"}</strong>
            <span>{selectedStop.date || "Date to confirm"} · {selectedStop.photoCount} {selectedStop.photoCount === 1 ? "photo" : "photos"}</span>
          </div>
          <button type="button" onClick={() => viewTimelineStop(selectedStop.id)}>View stop</button>
        </article>
      ) : null}
      {stops.length ? (
        <ol className="route-sequence" aria-label="Stops in chronological order">
          {stops.map((stop) => {
            const hasMapMarker = Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude);
            return <li key={stop.id}><button className={emphasizedStopId === stop.id ? "active" : ""} id={routeStopCardId(stop.id)} type="button" onClick={() => selectSequenceCard(stop.id, hasMapMarker)} aria-controls={hasMapMarker ? mapMarkerId(stop.id) : undefined}><span>{stop.number}</span><span><strong>{stop.label || "Place name unavailable"}</strong><small>Day {stop.dayNumber} · {stop.date}{hasMapMarker ? "" : " · No GPS"}</small></span></button></li>;
          })}
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
