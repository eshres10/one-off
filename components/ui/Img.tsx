import Image, { type ImageProps } from 'next/image';

/**
 * next/image wrapper. Seed placeholders are SVGs, which the optimiser rejects; they are served
 * as-is. Uploaded photos (JPEG/PNG/WebP) go through the optimiser for responsive sizes.
 */
export function Img(props: ImageProps) {
  const src = typeof props.src === 'string' ? props.src : '';
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} unoptimized={props.unoptimized ?? src.endsWith('.svg')} />;
}
