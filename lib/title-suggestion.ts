export type LocationEvidence = {
  dayNumber: number;
  place: string;
  placeSource: "gps" | "manual" | "missing";
  latitude?: number;
  longitude?: number;
  photoCount: number;
};

function isGoa(latitude?: number, longitude?: number) {
  return latitude !== undefined && longitude !== undefined && latitude >= 14.75 && latitude <= 15.85 && longitude >= 73.65 && longitude <= 74.35;
}

function editorialPlace(place: string, latitude?: number, longitude?: number) {
  if (isGoa(latitude, longitude)) return "Goa, India";
  const parts = place.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const primary = parts[0];
  const country = parts.at(-1);
  return country && country.toLocaleLowerCase() !== primary.toLocaleLowerCase()
    ? `${primary}, ${country}`
    : primary;
}

export function suggestJourneyTitle(days: LocationEvidence[]) {
  const strongest = days
    .filter((day) => day.placeSource === "gps" && day.place.trim())
    .sort((left, right) => right.photoCount - left.photoCount || left.dayNumber - right.dayNumber)[0];
  return strongest
    ? editorialPlace(strongest.place, strongest.latitude, strongest.longitude)
    : null;
}

export function shouldOfferLocationSuggestion(savedTitle: string, titleSource: string | undefined, suggestedTitle: string | null) {
  if (!suggestedTitle) return false;
  if (savedTitle.trim() === "Untitled journey" || titleSource === "default") return true;
  return titleSource === undefined && !suggestedTitle.toLocaleLowerCase().includes(savedTitle.trim().toLocaleLowerCase());
}
