import NextImage, { type ImageProps } from "next/image";

export function StoredPhotoImage(props: ImageProps) {
  return <NextImage {...props} unoptimized />;
}
