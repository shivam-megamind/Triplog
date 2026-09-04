export const SINGLE_OPTIMIZED_STORAGE = "single_optimized_v1" as const;
export const PHOTO_DELIVERY_PATH = "/photo";

export type PhotoStorageLayout = typeof SINGLE_OPTIMIZED_STORAGE;

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

export function durablePhotoStorageIds<StorageId>(photo: StoredPhoto<StorageId>): StorageId[] {
  if (photoStorageLayout(photo) === SINGLE_OPTIMIZED_STORAGE) return [photo.storageId];
  return [...new Set([
    photo.storageId,
    photo.thumbnailStorageId,
    photo.displayStorageId,
    photo.largeStorageId,
  ].filter((id): id is StorageId => id !== undefined))];
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
