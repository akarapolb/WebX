// The address a request counts against in middleware.ts's rate limits. No imports and nothing Node-only: it runs in the edge runtime.
//
// X-Forwarded-For is a list. Each reverse proxy of ours that handles the request adds the address it received it from, so the
// entry that can be believed is the one the outermost proxy added: `proxies` places from the right. Everything to its left was
// written by the caller, who can put anything there; the first entry (which this once used) lets a caller choose their own address
// and so make the sign-in limit apply to nobody. With no proxies, too few entries (the request did not pass through all of them)
// or an entry that is not an address, all such requests share one bucket: there is no socket address to fall back on in
// middleware. An IPv6 address counts as its /64, the smallest block one customer is given, so rotating the rest of it buys nothing.
// Mirrors webx-control/src/visitors.rs client_ip; both are unit-tested the same way.

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseV4(s: string): number[] | null {
  const m = V4.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** The eight 16-bit groups of an IPv6 address (`::` expanded, an embedded IPv4 tail allowed), or null. */
function parseV6(s: string): number[] | null {
  let str = s;
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(str);
  if (tail) {
    const v4 = parseV4(tail[2]);
    if (!v4) return null;
    str = tail[1] + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const groups = (x: string) => (x === "" ? [] : x.split(":"));
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + rest.length > 7) return null;
  const zeros = halves.length === 2 ? new Array(8 - head.length - rest.length).fill("0") : [];
  const all = [...head, ...zeros, ...rest].map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return all.length === 8 && all.every((n) => Number.isInteger(n)) ? all : null;
}

/** The bucket for one X-Forwarded-For entry as a proxy writes it (bare, with a port, or an IPv6 address in brackets), or null. */
function bucketOf(entry: string): string | null {
  let host = entry;
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close < 0) return null;
    const after = host.slice(close + 1);
    if (after !== "" && !/^:\d{1,5}$/.test(after)) return null;
    host = host.slice(1, close);
  } else if (host.split(":").length === 2) {
    host = host.split(":")[0]; // 1.2.3.4:5678
  }
  const v4 = parseV4(host);
  if (v4) return v4.join(".");
  const v6 = parseV6(host);
  if (!v6) return null;
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) return [v6[6] >> 8, v6[6] & 255, v6[7] >> 8, v6[7] & 255].join("."); // ::ffff:1.2.3.4
  return `${v6.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

export function clientAddress(forwarded: string | null | undefined, proxies: number): string {
  if (!(proxies >= 1)) return "unknown";
  const entries = String(forwarded || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (entries.length < proxies) return "unknown";
  return bucketOf(entries[entries.length - proxies]) ?? "unknown";
}

/** WEBX_TRUSTED_PROXIES: how many reverse proxies of ours stand in front of Studio. One unless set (0 ignores the header). */
export function trustedProxies(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 1;
}
