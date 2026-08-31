export const MAX_PHOTOS = 6;

export type ChapterFields = {
  title: string;
  photoCount: number;
  days: Array<{ displayDate: string; place: string; memory: string }>;
};

export function chapterProblem(fields: ChapterFields): string | null {
  if (!fields.title.trim()) return "Give this trip a name.";
  if (fields.photoCount < 1) return "Add at least one photo.";
  if (fields.days.length < 1) return "Confirm at least one day.";
  if (fields.days.some((day) => !day.displayDate.trim())) return "Confirm every missing date.";
  if (fields.days.some((day) => !day.place.trim())) return "Confirm every missing place.";
  if (fields.days.some((day) => !day.memory.trim())) return "Add one memory for each day, in your own words.";
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
