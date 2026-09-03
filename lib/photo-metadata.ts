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
  quality: "clear" | "dark" | "blurry" | "dark_blurry";
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

async function imageFingerprint(file: File): Promise<{ width?: number; height?: number; visualHash?: string; quality: PhotoMetadata["quality"] }> {
  if (typeof createImageBitmap !== "function") return { quality: "clear" };
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { width: bitmap.width, height: bitmap.height, quality: "clear" };
    context.drawImage(bitmap, 0, 0, 8, 8);
    const pixels = context.getImageData(0, 0, 8, 8).data;
    const values: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      values.push((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114));
    }
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    let neighbourDifference = 0;
    for (let index = 1; index < values.length; index += 1) neighbourDifference += Math.abs(values[index] - values[index - 1]);
    const dark = average < 48;
    const blurry = neighbourDifference / Math.max(values.length - 1, 1) < 9;
    return {
      width: bitmap.width,
      height: bitmap.height,
      visualHash: values.map((value) => value >= average ? "1" : "0").join(""),
      quality: dark && blurry ? "dark_blurry" : dark ? "dark" : blurry ? "blurry" : "clear",
    };
  } catch {
    return { quality: "clear" };
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
    quality: fingerprint.quality ?? "clear",
  };
}

export type PhotoVariants = {
  thumbnail: Blob;
  display: Blob;
  large: Blob;
};

async function resizedBlob(bitmap: ImageBitmap, maxWidth: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This browser could not prepare the photo.")), "image/webp", quality);
  });
}

export async function createPhotoVariants(file: File): Promise<PhotoVariants> {
  if (typeof createImageBitmap !== "function") throw new Error("This browser cannot prepare fast photo copies.");
  const bitmap = await createImageBitmap(file);
  try {
    const [thumbnail, display, large] = await Promise.all([
      resizedBlob(bitmap, 360, 0.76),
      resizedBlob(bitmap, 1280, 0.82),
      resizedBlob(bitmap, 2048, 0.88),
    ]);
    return { thumbnail, display, large };
  } finally {
    bitmap.close();
  }
}
