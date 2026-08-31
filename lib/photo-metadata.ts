import { parse } from "exifr";
import { localDateKey } from "./trip";

export type PhotoMetadata = {
  capturedAt?: number;
  dateKey: string;
  latitude?: number;
  longitude?: number;
  hasDateMetadata: boolean;
  hasGpsMetadata: boolean;
  orientation?: number;
  width?: number;
  height?: number;
  fileType: string;
  fileSize: number;
  exactHash?: string;
  visualHash?: string;
};

type ExifResult = {
  DateTimeOriginal?: Date;
  CreateDate?: Date;
  latitude?: number;
  longitude?: number;
  Orientation?: number | string;
};

async function exactFileHash(file: File): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

async function imageFingerprint(file: File): Promise<{ width?: number; height?: number; visualHash?: string }> {
  if (typeof createImageBitmap !== "function") return {};
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { width: bitmap.width, height: bitmap.height };
    context.drawImage(bitmap, 0, 0, 8, 8);
    const pixels = context.getImageData(0, 0, 8, 8).data;
    const values: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      values.push((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114));
    }
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    return {
      width: bitmap.width,
      height: bitmap.height,
      visualHash: values.map((value) => value >= average ? "1" : "0").join(""),
    };
  } catch {
    return {};
  } finally {
    bitmap?.close();
  }
}

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const [metadata, exactHash, fingerprint] = await Promise.all([
    parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude", "Orientation"],
      gps: true,
      exif: true,
      tiff: true,
      // Convex stores the EXIF orientation code (1-8), not exifr's
      // human-readable label such as "Horizontal (normal)".
      translateValues: false,
    }).catch(() => undefined) as Promise<ExifResult | undefined>,
    exactFileHash(file),
    imageFingerprint(file),
  ]);
  const captured = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
  const hasDateMetadata = captured instanceof Date && !Number.isNaN(captured.getTime());
  const hasGpsMetadata = typeof metadata?.latitude === "number" && typeof metadata?.longitude === "number";
  const orientation = typeof metadata?.Orientation === "number" && Number.isFinite(metadata.Orientation)
    ? metadata.Orientation
    : undefined;
  return {
    capturedAt: hasDateMetadata ? captured.getTime() : undefined,
    dateKey: hasDateMetadata ? localDateKey(captured) : "undated",
    latitude: hasGpsMetadata ? metadata.latitude : undefined,
    longitude: hasGpsMetadata ? metadata.longitude : undefined,
    hasDateMetadata,
    hasGpsMetadata,
    orientation,
    width: fingerprint.width,
    height: fingerprint.height,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    exactHash,
    visualHash: fingerprint.visualHash,
  };
}
