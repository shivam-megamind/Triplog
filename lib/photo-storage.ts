export const SINGLE_OPTIMIZED_STORAGE = "single_optimized_v1" as const;
export const SINGLE_IMAGE_STORAGE = "single_image_v1" as const;
export const PHOTO_DELIVERY_PATH = "/photo";

export type PhotoStorageLayout = typeof SINGLE_OPTIMIZED_STORAGE | typeof SINGLE_IMAGE_STORAGE;
export type StoredPhotoKind = "optimized_webp" | "original_fallback";

const MAX_OPTIMIZED_PHOTO_SIZE = 12 * 1024 * 1024;
const MAX_SOURCE_PHOTO_SIZE = 50 * 1024 * 1024;
const ORIGINAL_FALLBACK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type StoredPhoto<StorageId> = {
  storageId: StorageId;
  storageLayout?: PhotoStorageLayout;
  thumbnailStorageId?: StorageId;
  displayStorageId?: StorageId;
  largeStorageId?: StorageId;
};

export function photoStorageLayout<StorageId>(photo: StoredPhoto<StorageId>): "legacy" | PhotoStorageLayout {
  return photo.storageLayout ?? "legacy";
}

export function isSingleImageStorage(layout: "legacy" | PhotoStorageLayout): layout is PhotoStorageLayout {
  return layout === SINGLE_OPTIMIZED_STORAGE || layout === SINGLE_IMAGE_STORAGE;
}

export function durablePhotoStorageIds<StorageId>(photo: StoredPhoto<StorageId>): StorageId[] {
  if (isSingleImageStorage(photoStorageLayout(photo))) return [photo.storageId];
  return [...new Set([
    photo.storageId,
    photo.thumbnailStorageId,
    photo.displayStorageId,
    photo.largeStorageId,
  ].filter((id): id is StorageId => id !== undefined))];
}

export function storedPhotoValidationError(input: {
  kind: StoredPhotoKind;
  sourceType: string;
  sourceSize: number;
  storedType?: string;
  storedSize?: number;
}): string | undefined {
  if (!input.storedType || !input.storedSize || input.storedSize <= 0) return "The stored photo is empty or missing.";
  if (!ORIGINAL_FALLBACK_TYPES.has(input.storedType)) return "The stored photo type is not supported.";
  if (input.kind === "optimized_webp") {
    if (input.storedType !== "image/webp" || input.storedSize > MAX_OPTIMIZED_PHOTO_SIZE) {
      return "The prepared photo was not a valid WebP image.";
    }
    return undefined;
  }
  if (!ORIGINAL_FALLBACK_TYPES.has(input.sourceType) || input.storedType !== input.sourceType) {
    return "The fallback photo does not match its supported source type.";
  }
  if (input.storedSize !== input.sourceSize || input.storedSize > MAX_SOURCE_PHOTO_SIZE) {
    return "The fallback photo does not match the original supported file.";
  }
  return undefined;
}

export function photoDeliveryUrl<StorageId extends string>(generatedUrl: string | null, storageId: StorageId): string | null {
  if (generatedUrl === null) return null;
  const url = new URL(generatedUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
  }
  url.pathname = PHOTO_DELIVERY_PATH;
  url.search = "";
  url.searchParams.set("storageId", storageId);
  return url.toString();
}
