// Recognizes YouTube URLs in any of their common shapes (watch?v=, youtu.be/,
// already-/embed/, /shorts/) and extracts the 11-char video ID. Everything
// else is treated as a direct file URL and rendered via a plain <video>
// element. Vimeo is deliberately not special-cased in v1 — no real or seed
// data anywhere in this repo contains a Vimeo URL to verify a regex branch
// against (api::video.video's own seed data only ever uses YouTube watch
// links) — this discriminated union leaves room to add a "vimeo" branch
// later without touching any caller once real Vimeo content exists.
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

export type ParsedVideo = { type: "youtube"; embedUrl: string } | { type: "file"; url: string };

export function parseVideoUrl(url?: string | null): ParsedVideo | null {
  if (!url) return null;
  const m = url.match(YT_RE);
  if (m) return { type: "youtube", embedUrl: "https://www.youtube.com/embed/" + m[1] };
  return { type: "file", url };
}
