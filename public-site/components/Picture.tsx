// Real WebP delivery (TOR gap audit — PageSpeed/Core Web Vitals; see
// scripts/convert-webp.mjs's own comment for why build-time conversion,
// not Next's request-time image optimizer, is the fix under
// `output:"export"`). A plain drop-in replacement for `<img>`: `<picture>`
// offers the pre-generated .webp sibling first, falling back to the
// original file (untouched, still on disk) for the vanishingly rare
// browser without WebP support. No JS, no client component needed — this
// is exactly what `<picture>`/`<source>` are for.
//
// Only for the site's own pictures under /assets/, the ones convert-webp.mjs
// gives a .webp copy. A browser that picks a <source> does NOT fall back to the
// <img> when that file is missing: it shows a broken picture. So a picture
// uploaded to the CMS (an absolute URL with no .webp beside it) gets a plain
// <img>. Found when a hero picture uploaded through the agent showed nothing.
import type { ImgHTMLAttributes } from "react";

/** The .webp copy the build made for this picture, or null when there is none to offer. */
export function webpSibling(src: string): string | null {
  if (!/^\/assets\/[^?#]+\.(png|jpe?g)$/i.test(src)) return null;
  return src.replace(/\.(png|jpe?g)$/i, ".webp");
}

export default function Picture({ src, alt, ...rest }: { src: string; alt: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const webp = typeof src === "string" ? webpSibling(src) : null;
  // eslint-disable-next-line @next/next/no-img-element
  if (!webp) return <img src={src} alt={alt} {...rest} />;
  return (
    <picture>
      <source srcSet={webp} type="image/webp" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} {...rest} />
    </picture>
  );
}
