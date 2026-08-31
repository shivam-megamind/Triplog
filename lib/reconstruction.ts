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

const SHORT_BURST_MS = 12_000;
const SIMILAR_BURST_MS = 90_000;
const NEARBY_MOMENT_MS = 180_000;
const NEARBY_METRES = 75;

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

export function groupedPhotoCount(moments: ReconstructedMoment[]): number {
  return moments.reduce((total, moment) => total + Math.max(0, moment.photoIds.length - 1), 0);
}

export function formatCaptureTime(value?: number): string {
  if (value === undefined) return "Time not found";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
