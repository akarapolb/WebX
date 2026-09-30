// When should a change start a NEW undo step?
//
// Two kinds of change, coalesced differently:
//
//   "edit" — a value changing, often continuously (typing, dragging a colour
//            picker). One step per BURST: the snapshot is taken when the burst
//            starts, and the burst ends after `quietMs` with no further edit.
//            Measuring from the last *step* instead slices any drag longer than
//            `quietMs` into several steps, so one Ctrl+Z reverts only the final
//            slice and looks like undo did almost nothing.
//
//   "step" — a discrete action (add, delete, move, duplicate). Always its own
//            step, and it ends any burst in progress so the next edit starts a
//            fresh one rather than being folded into the action before it.
//
// Pure so the timing can be tested without a component or a clock.

export type ChangeKind = "edit" | "step";

export const QUIET_MS = 600;

/**
 * @param kind       what kind of change is happening now
 * @param now        the current time, ms
 * @param lastEdit   the time of the most recent edit in the current burst, or 0
 *                   when no burst is in progress
 * @returns `push` — take an undo snapshot now; `lastEdit` — the value to store
 */
export function coalesce(kind: ChangeKind, now: number, lastEdit: number, quietMs = QUIET_MS): { push: boolean; lastEdit: number } {
  if (kind === "step") return { push: true, lastEdit: 0 };
  // An edit always moves the end of the burst forward, pushed or not.
  const inBurst = lastEdit > 0 && now - lastEdit < quietMs;
  return { push: !inBurst, lastEdit: now };
}
