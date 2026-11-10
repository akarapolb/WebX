// The prev / next arrows beside a scrolling row of cards. The row is found next to the arrow that was pressed
// (closest shared container), not by id alone: two copies of the same block on one page (or a block duplicated in
// the Visual Builder) give their rows the same id, and getElementById would then always scroll the first one.

/** The row this arrow belongs to: the element with `rowId` inside the nearest container that holds one, else by id. */
export function rowFor(button: Element, rowId: string): HTMLElement | null {
  for (let el: Element | null = button.parentElement; el; el = el.parentElement) {
    const row = Array.from(el.querySelectorAll<HTMLElement>("[id]")).find((x) => x.id === rowId);
    if (row) return row;
  }
  return typeof document !== "undefined" ? document.getElementById(rowId) : null;
}

/** About one screen of cards per press (at least one card), left or right. */
export function scrollStep(row: { clientWidth: number }, dir: "left" | "right"): number {
  const step = Math.max(240, Math.round(row.clientWidth * 0.8));
  return dir === "left" ? -step : step;
}

export function scrollRow(button: Element, rowId: string, dir: "left" | "right") {
  const row = rowFor(button, rowId);
  if (row) row.scrollBy({ left: scrollStep(row, dir), behavior: "smooth" });
}
