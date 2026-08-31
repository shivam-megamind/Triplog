export const MAX_PHOTOS = 500;

export type ChapterFields = {
  title: string;
  photoCount: number;
  days: Array<{ displayDate: string; place: string; memory?: string }>;
  moments?: Array<{ memory: string; recommendation: string; warning: string; detail: string }>;
};

export function chapterProblem(fields: ChapterFields): string | null {
  if (!fields.title.trim() || fields.title.trim() === "Untitled journey") return "Give this trip a name.";
  if (fields.photoCount < 1) return "Add at least one photo.";
  if (fields.days.length < 1) return "Confirm at least one day.";
  const hasTravellerWords = fields.moments?.some((moment) =>
    [moment.memory, moment.recommendation, moment.warning, moment.detail].some((value) => value.trim()),
  ) ?? fields.days.some((day) => day.memory?.trim());
  if (!hasTravellerWords) return "Add at least one detail in your own words before sharing.";
  return null;
}

export function canAddPhotos(existing: number, incoming: number): boolean {
  return incoming > 0 && existing + incoming <= MAX_PHOTOS;
}

export function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
