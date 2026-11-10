// A card that links somewhere (a media-tabs item, for example): is the link a video, and what picture to show when
// the editor gave none. YouTube addresses in their usual shapes (watch?v=, youtu.be/, /embed/, /shorts/) give their
// video's own thumbnail; Vimeo and direct video files only count as video (no thumbnail without asking their API).
import { safeLink } from "./linkUrl";

const YT_RE = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})(?![\w-])/;

/** The 11-character YouTube video id in a link, or null. */
export function youtubeId(url: unknown): string | null {
  return typeof url === "string" ? (YT_RE.exec(url)?.[1] ?? null) : null;
}

/** True when the link plays a video: YouTube, Vimeo, or a video file. */
export function isVideoLink(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  return !!youtubeId(url) || /^https?:\/\/(?:www\.|player\.)?vimeo\.com\//i.test(url) || /\.(?:mp4|webm|mov|m3u8)(?:[?#]|$)/i.test(url);
}

/** The picture for a video link when none was given: YouTube's own thumbnail. */
export function videoThumbnail(url: unknown): string | null {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Where the card goes (checked by safeLink), and whether it opens in a new tab (an address on another site). */
export function cardLink(href: unknown): { href: string; external: boolean } | null {
  const to = safeLink(href);
  if (!to) return null;
  return { href: to, external: /^https?:\/\//i.test(to) };
}
