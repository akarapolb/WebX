// Detects a run that is going nowhere: the same failing call, the same error
// under different guesses (bug 1: eight guessed content-type uids in a row),
// a streak of failures, two calls alternating, or, in background jobs, turn
// after turn of reading without writing. The first detection adds a harness
// note to the latest tool result; a second one, after the model has seen the
// note, ends the run.
import type { RunCheckpoint, RunMode, StuckState } from "./types";

export type StuckKind = "repeat_call" | "repeat_error" | "failing_streak" | "alternating" | "reconnaissance";
export type StuckHit = { kind: StuckKind; note: string; detail: string };

const MAX_CALLS = 40;
const MAX_TURNS = 12;
const REPEAT = 3;
const STREAK = 6;
const RECON_TURNS = 4;

const NOTES = {
  repeat_call: (name: string, n: number) =>
    `Harness note: this exact ${name} call has failed ${n} times with the same arguments. Do not send it again. Change the arguments based on the error, use a different tool, or tell the user what is blocking you.`,
  repeat_error: (name: string, n: number) =>
    `Harness note: ${name} has failed ${n} times with the same error. Guessing other values will not fix it. Use exact values a tool already returned (list_content_types for uids, get_content_type_schema for field names and allowed values), or tell the user what is blocking you.`,
  failing_streak: (n: number) =>
    `Harness note: the last ${n} tool calls all failed. Re-read the errors before calling another tool, and if you cannot fix the cause, explain it to the user.`,
  alternating: () =>
    "Harness note: you are repeating the same two calls back and forth without progress. Decide on the next concrete step, or ask the user what is unclear.",
  reconnaissance: (n: number) =>
    `Harness note: you have spent ${n} turns only reading. You have enough to act: create or update the drafts now, and use get_content_type_schema for field shapes instead of reading existing entries.`,
};

/** An error with quoted values and numbers blanked, so guesses that fail the same way compare equal. */
export function errorKey(summary: string): string {
  return summary
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}";
  }
  return JSON.stringify(v) ?? "null";
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Tool name plus a hash of its arguments with keys sorted, so reordered arguments still match. */
export function callSignature(name: string, rawArgs: string): string {
  let canonical: string;
  try {
    canonical = stable(JSON.parse(rawArgs || "{}"));
  } catch {
    canonical = String(rawArgs);
  }
  return `${name}#${fnv1a(canonical)}`;
}

function stateOf(cp: RunCheckpoint): StuckState {
  if (!cp.stuck) cp.stuck = { calls: [], turns: [] };
  return cp.stuck;
}

export function observeCall(cp: RunCheckpoint, c: { turn: number; name: string; args: string; ok: boolean; summary: string }): StuckHit | null {
  const s = stateOf(cp);
  s.calls.push({
    turn: c.turn, name: c.name, sig: callSignature(c.name, c.args), ok: c.ok,
    errorKey: c.ok ? "" : errorKey(c.summary), error: c.ok ? "" : c.summary.slice(0, 120),
  });
  if (s.calls.length > MAX_CALLS) s.calls.splice(0, s.calls.length - MAX_CALLS);

  const since = s.noted?.turn ?? -1;
  const recent = s.calls.filter((x) => x.turn > since);
  const last = recent[recent.length - 1];
  if (!last) return null;

  if (!last.ok) {
    const detail = `${last.name}: ${last.error}`;
    const sameCall = recent.filter((x) => !x.ok && x.sig === last.sig).length;
    if (sameCall >= REPEAT) return { kind: "repeat_call", detail, note: NOTES.repeat_call(last.name, sameCall) };
    const sameError = recent.filter((x) => !x.ok && x.name === last.name && x.errorKey === last.errorKey).length;
    if (sameError >= REPEAT) return { kind: "repeat_error", detail, note: NOTES.repeat_error(last.name, sameError) };
    const tail = recent.slice(-STREAK);
    if (tail.length === STREAK && tail.every((x) => !x.ok)) return { kind: "failing_streak", detail, note: NOTES.failing_streak(STREAK) };
  }

  const six = recent.slice(-6);
  if (six.length === 6 && six[0].sig !== six[1].sig && six.every((x, i) => x.sig === six[i % 2].sig)) {
    return { kind: "alternating", detail: `${six[0].name} and ${six[1].name} repeated`, note: NOTES.alternating() };
  }
  return null;
}

export function observeTurn(cp: RunCheckpoint, t: { turn: number; progressed: boolean; readOnly: boolean }, mode: RunMode): StuckHit | null {
  const s = stateOf(cp);
  s.turns.push(t);
  if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS);
  if (mode !== "job") return null;
  const since = s.noted?.turn ?? -1;
  const recent = s.turns.filter((x) => x.turn > since).slice(-RECON_TURNS);
  if (recent.length === RECON_TURNS && recent.every((x) => x.readOnly && !x.progressed)) {
    return { kind: "reconnaissance", detail: `${RECON_TURNS} turns of reading without writing`, note: NOTES.reconnaissance(RECON_TURNS) };
  }
  return null;
}
