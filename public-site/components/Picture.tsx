// Real WebP delivery (TOR gap audit — PageSpeed/Core Web Vitals; see
// scripts/convert-webp.mjs's own comment for why build-time conversion,
// not Next's request-time image optimizer, is the fix under
// `output:"export"`). A plain drop-in replacement for `<img>`: `<picture>`
// offers the pre-generated .webp sibling first, falling back to the
// original file (untouched, still on disk) for the vanishingly rare
// browser without WebP support. No JS, no client component needed — this
// is exactly what `<picture>`/`<source>` are for.
//
// Safe on any src, not just ones that were actually converted: a `.webp`
// sibling that doesn't exist on disk just 404s silently and the browser
// falls through to the `<img>` fallback, same as any missing <source>.
import type { ImgHTMLAttributes } from "react";

export default function Picture({ src, alt, ...rest }: { src: string; alt: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const webp = src.replace(/\.(png|jpe?g)$/i, ".webp");
  if (webp === src) return <img src={src} alt={alt} {...rest} />; // not a convertible type (svg, already .webp, etc.)
  return (
    <picture>
      <source srcSet={webp} type="image/webp" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} {...rest} />
    </picture>
  );
}
