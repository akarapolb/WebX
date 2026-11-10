// The picture a person attached to their chat message, turned into a real image file the agent can put in the media
// library (and then use, for example as a block's background). The data URL comes from the browser, so it is checked
// here: an image type we accept, a size limit, and file bytes that really are that kind of image.

export const MAX_ATTACHED_IMAGE_BYTES = 4_000_000;

const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  "image/gif": { ext: "gif", magic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
};

/** A safe file name from what the model suggests ("hero background" → "hero-background.jpg"). */
export function attachedFileName(suggested: unknown, ext: string): string {
  const base = String(suggested ?? "").toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return (base || "chat-image-" + Date.now()) + "." + ext;
}

/** The attached picture as a File, or an error saying in plain words what is wrong with it. */
export function imageFileFromDataUrl(dataUrl: unknown, name?: unknown): { ok: true; file: File; type: string; bytes: number } | { ok: false; error: string } {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return { ok: false, error: "No picture is attached to this message. Ask the user to attach the image to their message again." };
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return { ok: false, error: "The attached picture could not be read." };
  const type = m[1].toLowerCase();
  const kind = TYPES[type];
  if (!kind) return { ok: false, error: `Pictures of type ${type} cannot be used. Use a PNG, JPEG, WebP or GIF.` };
  const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (bytes.length === 0) return { ok: false, error: "The attached picture is empty." };
  if (bytes.length > MAX_ATTACHED_IMAGE_BYTES) return { ok: false, error: "The attached picture is larger than 4 MB." };
  if (!kind.magic(bytes)) return { ok: false, error: "The attached file is not really a " + kind.ext.toUpperCase() + " picture." };
  const file = new File([new Uint8Array(bytes)], attachedFileName(name, kind.ext), { type });
  return { ok: true, file, type, bytes: bytes.length };
}

/** An address a block's style may use as its background picture: https, or a path on this site. Nothing that could
 * break out of the CSS url("…") it ends up in. */
export function isSafeBackgroundUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!s || s.length > 2000 || /[\s"'()<>\\`]/.test(s)) return false;
  return /^https?:\/\/[^/?#]+/i.test(s) || (s.startsWith("/") && !s.startsWith("//"));
}
