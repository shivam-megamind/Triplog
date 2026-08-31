import { parse } from "exifr";
import { localDateKey } from "./trip";

export type PhotoMetadata = {
  capturedAt?: number;
  dateKey: string;
  latitude?: number;
  longitude?: number;
  hasDateMetadata: boolean;
  hasGpsMetadata: boolean;
};

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  try {
    const metadata = await parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"],
      gps: true,
      exif: true,
      tiff: true,
    }) as { DateTimeOriginal?: Date; CreateDate?: Date; latitude?: number; longitude?: number } | undefined;
    const captured = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
    const hasDateMetadata = captured instanceof Date && !Number.isNaN(captured.getTime());
    const hasGpsMetadata = typeof metadata?.latitude === "number" && typeof metadata?.longitude === "number";
    return {
      capturedAt: hasDateMetadata ? captured.getTime() : undefined,
      dateKey: hasDateMetadata ? localDateKey(captured) : "undated",
      latitude: hasGpsMetadata ? metadata.latitude : undefined,
      longitude: hasGpsMetadata ? metadata.longitude : undefined,
      hasDateMetadata,
      hasGpsMetadata,
    };
  } catch {
    return { dateKey: "undated", hasDateMetadata: false, hasGpsMetadata: false };
  }
}

