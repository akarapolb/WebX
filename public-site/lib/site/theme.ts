// WebX site kit — light/dark mode. The visitor's saved choice wins, else the
// system setting. The boot script runs in <head> before first paint so the
// page never flashes the wrong theme; components/site/ThemeSwitch.tsx flips it.
// Each template may keep its own storage key (dgahub: "dh-theme"; the gov-portal,
// ORST and Royal Society templates share "dga-theme" via app/layout.tsx).

export const themeBootScript = (storageKey: string) =>
  `try{var t=localStorage.getItem(${JSON.stringify(storageKey)});if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;
