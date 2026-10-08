"use client";

import { useEffect } from "react";

// Open/close behaviour for the header's stack-navigator (mega-menu) items:
//   - hover (a mouse over the item's label) OPENS it,
//   - click TOGGLES it,
// and moving the mouse away never closes it, so the panel stays put while the
// visitor uses the links and sub-menus inside. It closes on a click on the label
// again, a click outside, Esc, or when another stack item is opened.
// Hover is for real mice only (pointerType "mouse"): on a touch screen a tap
// reports a pointer-over first, which would open the panel and let the click
// that follows immediately close it again.
//
// The rest of the header stays a Server Component, so this reaches the DOM the
// same way MobileMenuToggle does: one delegated listener, toggling an
// `is-open` class that components.css already styles. Without JS the trigger is
// still a normal link to the item's URL.
export default function MegaNavClick() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".main-nav");
    if (!nav) return;

    const items = () => Array.from(nav.querySelectorAll<HTMLElement>(".nav-mega-item"));
    const setOpen = (el: HTMLElement, open: boolean) => {
      el.classList.toggle("is-open", open);
      el.querySelector("a[data-mega]")?.setAttribute("aria-expanded", String(open));
    };
    const closeAll = (except?: HTMLElement) => items().forEach((el) => { if (el !== except) setOpen(el, false); });

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      const trigger = target.closest<HTMLElement>("a[data-mega]");
      const item = trigger?.closest<HTMLElement>(".nav-mega-item");
      if (item) {
        e.preventDefault();
        const open = !item.classList.contains("is-open");
        closeAll(item);
        setOpen(item, open);
        return;
      }
      // A click inside an open panel keeps it open; anywhere else closes it.
      if (!target.closest(".nav-mega-item")) closeAll();
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const trigger = (e.target as Element).closest<HTMLElement>("a[data-mega]");
      const item = trigger?.closest<HTMLElement>(".nav-mega-item");
      // relatedTarget inside the same label means the pointer only moved between its children.
      if (!item || (e.relatedTarget instanceof Node && trigger!.contains(e.relatedTarget))) return;
      if (item.classList.contains("is-open")) return;
      closeAll(item);
      setOpen(item, true);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };

    nav.addEventListener("pointerover", onOver);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      nav.removeEventListener("pointerover", onOver);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return null;
}
