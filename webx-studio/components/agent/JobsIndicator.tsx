"use client";
// Next to the agent toggle in the top bar: background jobs in progress, amber
// when one needs an answer, red when one failed in the last week. Polls every
// 20s while the tab is visible, and at once when a job changes in this tab.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "../LangProvider";
import { useAgent } from "./AgentProvider";
import { fill, JOBS_CHANGED } from "./jobs/common";

type Summary = { active: number; waiting: number; failed: number };

export default function JobsIndicator() {
  const { t } = useLang();
  const agent = useAgent();
  const enabled = Boolean(agent.policy?.background);
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    if (!enabled) {
      setS(null);
      return;
    }
    let live = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/agent/jobs/summary", { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        if (live && j) setS(j);
      } catch {
        /* keep the last known state */
      }
    };
    void load();
    const id = setInterval(load, 20_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(JOBS_CHANGED, load);
    return () => {
      live = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(JOBS_CHANGED, load);
    };
  }, [enabled]);

  if (!s || (!s.active && !s.waiting && !s.failed)) return null;
  const tone = s.waiting ? " wait" : s.failed ? " bad" : "";
  const label = s.waiting ? t("aj.indicatorWaiting") : s.failed ? t("aj.indicatorFailed") : fill(t("aj.indicator"), { n: s.active });
  const count = s.active + s.waiting || s.failed;
  return (
    <Link href="/agent/jobs" className={"agj-ind" + tone} title={label} aria-label={label} data-testid="agent-jobs-indicator">
      <i aria-hidden="true" />
      <b>{count}</b>
      <span>{t("aw.tabJobs")}</span>
    </Link>
  );
}
