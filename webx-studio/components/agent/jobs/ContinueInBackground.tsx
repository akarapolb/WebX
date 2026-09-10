"use client";
// "Continue in background" on a chat that stopped where it can resume: the
// conversation becomes a background job (POST /api/agent/jobs/from-thread),
// which carries on from the same point, and the job's page opens.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "../../LangProvider";
import { useAgent } from "../AgentProvider";
import { announceJobsChanged, readError } from "./common";

export default function ContinueInBackground() {
  const { t, lang } = useLang();
  const agent = useAgent();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!agent.policy?.background || !agent.threadId) return null;

  async function go() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/agent/jobs/from-thread", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: agent.threadId, lang }),
      });
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      const job = await r.json();
      announceJobsChanged();
      agent.newThread();
      router.push("/agent/jobs/" + encodeURIComponent(job.documentId));
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn--g btn-sm" onClick={go} disabled={busy || agent.running} data-testid="agent-continue-bg">
        {t("aj.continueBg")}
      </button>
      {err && <span className="agj-err" role="alert">{err}</span>}
    </>
  );
}
