export const MAP_TILE_SIZE = 256;

const MAX_MERCATOR_LATITUDE = 85.05112878;
const MIN_ZOOM = 1;
const MAX_FIT_ZOOM = 15;
const SINGLE_STOP_ZOOM = 13;

export type JourneyMapPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type JourneyMapSize = {
  width: number;
  height: number;
};

export type JourneyMapScene<T extends JourneyMapPoint> = {
  zoom: number;
  points: Array<T & { x: number; y: number }>;
  tiles: Array<{ key: string; x: number; y: number; left: number; top: number }>;
};

export type JourneyMapDisplayPoint<T extends { x: number; y: number }> = T & {
  anchorX: number;
  anchorY: number;
  displaced: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function project(latitude: number, longitude: number, zoom: number) {
  const worldSize = MAP_TILE_SIZE * (2 ** zoom);
  const safeLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  const latitudeRadians = safeLatitude * Math.PI / 180;
  const x = ((longitude + 180) / 360) * worldSize;
  const y = (0.5 - (Math.log((1 + Math.sin(latitudeRadians)) / (1 - Math.sin(latitudeRadians))) / (4 * Math.PI))) * worldSize;
  return { x, y };
}

function pointDistance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function spreadJourneyMapPoints<T extends { x: number; y: number }>(
  points: T[],
  size: JourneyMapSize,
  minimumDistance = 44,
): JourneyMapDisplayPoint<T>[] {
  const edgePadding = 24;
  const ringStep = Math.max(48, minimumDistance + 4);
  const maximumRadius = Math.max(ringStep, Math.min(size.width, size.height) / 2 - edgePadding);
  const ringCount = Math.max(1, Math.ceil(maximumRadius / ringStep));
  const placed: JourneyMapDisplayPoint<T>[] = [];

  for (const [pointIndex, point] of points.entries()) {
    const candidates = [{ x: point.x, y: point.y }];
    for (let ring = 1; ring <= ringCount; ring += 1) {
      const radius = Math.min(maximumRadius, ring * ringStep);
      const steps = 16 + ((ring - 1) * 8);
      const angleOffset = (pointIndex % 4) * (Math.PI / 32);
      for (let step = 0; step < steps; step += 1) {
        const angle = (-Math.PI / 2) + angleOffset + ((step / steps) * Math.PI * 2);
        candidates.push({
          x: point.x + (Math.cos(angle) * radius),
          y: point.y + (Math.sin(angle) * radius),
        });
      }
    }

    let chosen = candidates[0];
    let greatestClearance = -1;
    for (const candidate of candidates) {
      if (
        candidate.x < edgePadding
        || candidate.x > size.width - edgePadding
        || candidate.y < edgePadding
        || candidate.y > size.height - edgePadding
      ) continue;
      const clearance = placed.length
        ? Math.min(...placed.map((other) => pointDistance(candidate, other)))
        : Number.POSITIVE_INFINITY;
      if (clearance >= minimumDistance) {
        chosen = candidate;
        greatestClearance = clearance;
        break;
      }
      if (clearance > greatestClearance) {
        chosen = candidate;
        greatestClearance = clearance;
      }
    }

    placed.push({
      ...point,
      x: chosen.x,
      y: chosen.y,
      anchorX: point.x,
      anchorY: point.y,
      displaced: pointDistance(chosen, point) > 0.5,
    });
  }

  return placed;
}

function fittingZoom<T extends JourneyMapPoint>(points: T[], size: JourneyMapSize, padding: number) {
  if (points.length === 1) return SINGLE_STOP_ZOOM;
  const availableWidth = Math.max(1, size.width - (padding * 2));
  const availableHeight = Math.max(1, size.height - (padding * 2));

  for (let zoom = MAX_FIT_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => project(point.latitude, point.longitude, zoom));
    const xValues = projected.map((point) => point.x);
    const yValues = projected.map((point) => point.y);
    if (
      Math.max(...xValues) - Math.min(...xValues) <= availableWidth
      && Math.max(...yValues) - Math.min(...yValues) <= availableHeight
    ) return zoom;
  }

  return MIN_ZOOM;
}

export function createJourneyMapScene<T extends JourneyMapPoint>(
  points: T[],
  size: JourneyMapSize,
  padding = 54,
): JourneyMapScene<T> | null {
  if (!points.length) return null;

  const safeSize = {
    width: Math.max(1, size.width),
    height: Math.max(1, size.height),
  };
  const zoom = fittingZoom(points, safeSize, padding);
  const projected = points.map((point) => ({ point, ...project(point.latitude, point.longitude, zoom) }));
  const xValues = projected.map((point) => point.x);
  const yValues = projected.map((point) => point.y);
  const centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2;
  const centerY = (Math.min(...yValues) + Math.max(...yValues)) / 2;
  const topLeftX = centerX - (safeSize.width / 2);
  const topLeftY = centerY - (safeSize.height / 2);
  const firstTileX = Math.floor(topLeftX / MAP_TILE_SIZE);
  const lastTileX = Math.floor((topLeftX + safeSize.width) / MAP_TILE_SIZE);
  const firstTileY = Math.floor(topLeftY / MAP_TILE_SIZE);
  const lastTileY = Math.floor((topLeftY + safeSize.height) / MAP_TILE_SIZE);
  const tileLimit = 2 ** zoom;
  const tiles: JourneyMapScene<T>["tiles"] = [];

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileLimit) continue;
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const wrappedX = ((tileX % tileLimit) + tileLimit) % tileLimit;
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        x: wrappedX,
        y: tileY,
        left: (tileX * MAP_TILE_SIZE) - topLeftX,
        top: (tileY * MAP_TILE_SIZE) - topLeftY,
      });
    }
  }

  return {
    zoom,
    tiles,
    points: projected.map(({ point, x, y }) => ({
      ...point,
      x: x - topLeftX,
      y: y - topLeftY,
    })),
  };
}
