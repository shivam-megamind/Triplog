export type ReconstructionPhoto = {
  id: string;
  order: number;
  capturedAt?: number;
  dateKey?: string;
  latitude?: number;
  longitude?: number;
  exactHash?: string;
  visualHash?: string;
  width?: number;
  height?: number;
};

export type ReconstructedMoment = {
  key: string;
  dateKey: string;
  photoIds: string[];
  representativePhotoId: string;
  startTime?: number;
};

export type ReconstructedStop = {
  key: string;
  dateKey: string;
  evidence: "gps" | "unknown";
  suggestedLabel: string;
  confidence: "high" | "low";
  latitude?: number;
  longitude?: number;
  photoIds: string[];
  moments: ReconstructedMoment[];
};

export type ReconstructedDay = {
  dateKey: string;
  stops: ReconstructedStop[];
};

const SHORT_BURST_MS = 12_000;
const SIMILAR_BURST_MS = 90_000;
const NEARBY_MOMENT_MS = 180_000;
const NEARBY_METRES = 75;
const SAME_STOP_METRES = 600;

export function visualHashDistance(left?: string, right?: string): number | null {
  if (!left || !right || left.length !== right.length) return null;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function distanceInMetres(left: ReconstructionPhoto, right: ReconstructionPhoto): number | null {
  if (left.latitude === undefined || left.longitude === undefined || right.latitude === undefined || right.longitude === undefined) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDistance = radians(right.latitude - left.latitude);
  const longitudeDistance = radians(right.longitude - left.longitude);
  const firstLatitude = radians(left.latitude);
  const secondLatitude = radians(right.latitude);
  const haversine = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDistance / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function sameShape(left: ReconstructionPhoto, right: ReconstructionPhoto): boolean {
  if (!left.width || !left.height || !right.width || !right.height) return true;
  const leftRatio = left.width / left.height;
  const rightRatio = right.width / right.height;
  return Math.abs(leftRatio - rightRatio) < 0.08;
}

function belongsWith(previous: ReconstructionPhoto, photo: ReconstructionPhoto): boolean {
  const hashDistance = visualHashDistance(previous.visualHash, photo.visualHash);
  if (previous.capturedAt === undefined || photo.capturedAt === undefined) {
    return Math.abs(photo.order - previous.order) === 1 && hashDistance !== null && hashDistance <= 8;
  }
  const elapsed = Math.abs(photo.capturedAt - previous.capturedAt);
  if (elapsed <= SHORT_BURST_MS && sameShape(previous, photo)) return true;
  if (elapsed <= SIMILAR_BURST_MS && hashDistance !== null && hashDistance <= 14) return true;
  const distance = distanceInMetres(previous, photo);
  return elapsed <= NEARBY_MOMENT_MS && distance !== null && distance <= NEARBY_METRES && hashDistance !== null && hashDistance <= 20;
}

function comparePhotos(left: ReconstructionPhoto, right: ReconstructionPhoto): number {
  if (left.capturedAt !== undefined && right.capturedAt !== undefined) return left.capturedAt - right.capturedAt || left.order - right.order;
  if (left.capturedAt !== undefined) return -1;
  if (right.capturedAt !== undefined) return 1;
  return left.order - right.order;
}

export function groupPhotosIntoMoments(input: ReconstructionPhoto[]): ReconstructedMoment[] {
  const photos = [...input].sort(comparePhotos);
  const moments: ReconstructedMoment[] = [];
  const exactMomentByDayAndHash = new Map<string, ReconstructedMoment>();
  let previous: ReconstructionPhoto | undefined;

  for (const photo of photos) {
    const dateKey = photo.dateKey || "undated";
    const exactKey = photo.exactHash ? `${dateKey}:${photo.exactHash}` : undefined;
    const exactMoment = exactKey ? exactMomentByDayAndHash.get(exactKey) : undefined;
    if (exactMoment) {
      exactMoment.photoIds.push(photo.id);
      previous = photo;
      continue;
    }

    const current = moments.at(-1);
    const canJoinCurrent = current !== undefined
      && current.dateKey === dateKey
      && previous !== undefined
      && belongsWith(previous, photo);

    if (canJoinCurrent) {
      current.photoIds.push(photo.id);
      if (exactKey) exactMomentByDayAndHash.set(exactKey, current);
    } else {
      const moment: ReconstructedMoment = {
        key: `${dateKey}:${photo.id}`,
        dateKey,
        photoIds: [photo.id],
        representativePhotoId: photo.id,
        startTime: photo.capturedAt,
      };
      moments.push(moment);
      if (exactKey) exactMomentByDayAndHash.set(exactKey, moment);
    }
    previous = photo;
  }

  return moments;
}

function dayOrder(left: string, right: string) {
  if (left === "undated") return 1;
  if (right === "undated") return -1;
  return left.localeCompare(right);
}

/**
 * Builds an evidence-led travel timeline. GPS photos form chronological stop
 * runs when consecutive coordinates stay within the same local area. Dated
 * photos without GPS remain in their date under an explicit unknown stop.
 */
export function reconstructTravelTimeline(input: ReconstructionPhoto[]): ReconstructedDay[] {
  const photosByDate = new Map<string, ReconstructionPhoto[]>();
  for (const photo of [...input].sort(comparePhotos)) {
    const dateKey = photo.dateKey || "undated";
    const photos = photosByDate.get(dateKey);
    if (photos) photos.push(photo);
    else photosByDate.set(dateKey, [photo]);
  }

  return [...photosByDate.entries()]
    .sort(([left], [right]) => dayOrder(left, right))
    .map(([dateKey, photos]) => {
      const stopRuns: Array<{ evidence: "gps" | "unknown"; photos: ReconstructionPhoto[] }> = [];
      for (const photo of photos) {
        const hasGps = photo.latitude !== undefined && photo.longitude !== undefined;
        const evidence = hasGps ? "gps" as const : "unknown" as const;
        const current = stopRuns.at(-1);
        const previous = current?.photos.at(-1);
        const joinsCurrent = current !== undefined
          && current.evidence === evidence
          && (evidence === "unknown" || (previous !== undefined && (distanceInMetres(previous, photo) ?? Number.POSITIVE_INFINITY) <= SAME_STOP_METRES));
        if (joinsCurrent) current.photos.push(photo);
        else stopRuns.push({ evidence, photos: [photo] });
      }

      return {
        dateKey,
        stops: stopRuns.map((run) => {
          const first = run.photos[0];
          const gpsPhotos = run.photos.filter((photo) => photo.latitude !== undefined && photo.longitude !== undefined);
          const latitude = gpsPhotos.length ? gpsPhotos.reduce((total, photo) => total + photo.latitude!, 0) / gpsPhotos.length : undefined;
          const longitude = gpsPhotos.length ? gpsPhotos.reduce((total, photo) => total + photo.longitude!, 0) / gpsPhotos.length : undefined;
          return {
            key: `${dateKey}:${run.evidence}:${first.id}`,
            dateKey,
            evidence: run.evidence,
            suggestedLabel: run.evidence === "gps" ? "Finding place name…" : "Location unknown",
            confidence: run.evidence === "gps" ? "high" as const : "low" as const,
            latitude,
            longitude,
            photoIds: run.photos.map((photo) => photo.id),
            moments: groupPhotosIntoMoments(run.photos),
          };
        }),
      };
    });
}

export function groupedPhotoCount(moments: ReconstructedMoment[]): number {
  return moments.reduce((total, moment) => total + Math.max(0, moment.photoIds.length - 1), 0);
}

export function formatCaptureTime(value?: number): string {
  if (value === undefined) return "Time not found";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
