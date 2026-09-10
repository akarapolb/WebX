// Checks a run's plan before the run may finish: open items earn the model up
// to two reminders, and the final state is reported as a verification event.
import type { PlanItem, RunPlan } from "../types";

export const MAX_NUDGES = 2;

export function openItems(plan: RunPlan | undefined): PlanItem[] {
  return plan ? plan.items.filter((i) => i.status === "pending" || i.status === "in_progress") : [];
}

/** The harness message that sends a model back to its unfinished plan items. */
export function nudgeText(open: PlanItem[]): string {
  const list = open.slice(0, 20).map((i) => `${i.id}. ${i.title}`).join("\n");
  const more = open.length > 20 ? `\n…and ${open.length - 20} more.` : "";
  return (
    `Harness check: ${open.length} plan item(s) are not finished:\n${list}${more}\n` +
    "Continue working on them. If an item cannot be done, mark it blocked or skipped with update_plan and say why, then give your final answer."
  );
}

export function verifyPlan(plan: RunPlan): { ok: boolean; report: string } {
  const total = plan.items.length;
  const done = plan.items.filter((i) => i.status === "done").length;
  const blocked = plan.items.filter((i) => i.status === "blocked").length;
  const skipped = plan.items.filter((i) => i.status === "skipped").length;
  const open = openItems(plan).length;
  const parts = [`${done} of ${total} plan items done`];
  if (blocked) parts.push(`${blocked} blocked`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (open) parts.push(`${open} not started or unfinished`);
  const notDone = plan.items
    .filter((i) => i.status !== "done")
    .slice(0, 10)
    .map((i) => `${i.id}. ${i.title} (${i.status}${i.note ? `: ${i.note}` : ""})`);
  return { ok: done === total, report: parts.join(", ") + (notDone.length ? `. Not done: ${notDone.join("; ")}` : ".") };
}
