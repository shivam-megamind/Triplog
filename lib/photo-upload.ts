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

export function photoFileError(file: PhotoFileDetails): string | undefined {
  if (file.type.trim().toLowerCase().startsWith("video/")) {
    return `${file.name} is a video. Postcard accepts still photos only.`;
  }
  if (!photoFormat(file)) {
    return `${file.name} is not a supported photo. Choose a JPEG, PNG, WebP, HEIC, or HEIF image.`;
  }
  if (file.size > MAX_PHOTO_FILE_SIZE) return `${file.name} is larger than 50 MB.`;
  return undefined;
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
