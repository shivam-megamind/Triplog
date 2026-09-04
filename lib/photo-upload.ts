export const MAX_PHOTO_FILE_SIZE = 50 * 1024 * 1024;

export type PhotoFormat = "jpeg" | "png" | "webp" | "heic" | "heif";

type PhotoFileDetails = Pick<File, "name" | "size" | "type">;

const MIME_FORMATS = new Map<string, PhotoFormat>([
  ["image/jpeg", "jpeg"],
  ["image/jpg", "jpeg"],
  ["image/pjpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

const EXTENSION_FORMATS = new Map<string, PhotoFormat>([
  ["jpg", "jpeg"],
  ["jpeg", "jpeg"],
  ["png", "png"],
  ["webp", "webp"],
  ["heic", "heic"],
  ["heif", "heif"],
]);

export function photoFormat(file: PhotoFileDetails): PhotoFormat | undefined {
  const mime = file.type.trim().toLowerCase();
  if (mime.startsWith("video/")) return undefined;
  const mimeFormat = MIME_FORMATS.get(mime);
  if (mimeFormat) return mimeFormat;
  if (mime && mime !== "application/octet-stream") return undefined;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_FORMATS.get(extension);
}

export function canonicalPhotoMimeType(file: PhotoFileDetails): string | undefined {
  const format = photoFormat(file);
  if (!format) return undefined;
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export function originalFallbackMimeType(file: PhotoFileDetails): "image/jpeg" | "image/png" | "image/webp" | undefined {
  const contentType = canonicalPhotoMimeType(file);
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp" ? contentType : undefined;
}

export function photoFileError(file: PhotoFileDetails): string | undefined {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.trim().toLowerCase();
  if (file.type.trim().toLowerCase().startsWith("video/")) {
    return `${file.name} is a video. Postcard accepts still photos only.`;
  }
  if (extension === "dng" || extension === "raw" || mime === "image/dng" || mime === "image/x-adobe-dng" || mime === "image/raw" || mime === "image/x-raw") {
    return "RAW/DNG photos aren’t supported yet. RAW support is coming soon. For now, upload a JPEG version of this photo.";
  }
  if (!photoFormat(file)) {
    return `${file.name} is not a supported photo. Choose a JPEG, JPG, PNG, or WebP image.`;
  }
  if (file.size > MAX_PHOTO_FILE_SIZE) return `${file.name} is larger than 50 MB.`;
  return undefined;
}

export function uploadItemNeedsSource(status: "pending" | "uploading" | "uploaded" | "failed", sourceSelected: boolean) {
  return status !== "uploaded" && !sourceSelected;
}

export function createTaskLimiter(concurrency: number) {
  const maximum = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= maximum) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
