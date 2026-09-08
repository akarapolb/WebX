"use client";
// A real, working poll. Originally built against a Strapi public vote
// backend; Phase 7 moved poll storage natively into WordPress for ORST
// (wordpress/mu-plugins/public-forms-post-types.php's `poll` CPT +
// public-forms-api.php's vote route) — still no captcha needed, matching
// the original Strapi route's own behavior (poll voting was never in
// captcha-guard.ts's GUARDED set either). Split out as its own client
// component, same reason ContactFormBlock.tsx is: Blocks.tsx itself has no
// "use client" of its own.
import { useEffect, useState } from "react";
import type { Block } from "./Blocks";

const WORDPRESS = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");

type Option = { label: string; votes: number };
type PollData = { question: string; options: Option[]; totalVotes: number };

function parsePollAcf(acf: any): PollData {
  const options = typeof acf?.options === "string" ? (JSON.parse(acf.options || "[]") as Option[]) : (acf?.options || []);
  return { question: acf?.question || "", options, totalVotes: Number(acf?.total_votes || 0) };
}

export default function PollBlock({ b }: { b: Block }) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [voted, setVoted] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!b.pollId) { setStatus("error"); return; }
    // Already-voted state is per-browser only (localStorage), not per-user —
    // same trust level as any anonymous public poll; the backend itself
    // doesn't dedupe voters either (see the vote route's own comment).
    const key = `webx-poll-voted-${b.pollId}`;
    const savedVote = localStorage.getItem(key);
    fetch(`${WORDPRESS}/wp/v2/poll/${b.pollId}?_fields=id,acf`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setPoll(parsePollAcf(j.acf));
        if (savedVote != null) setVoted(Number(savedVote));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [b.pollId, b.tenant]);

  async function vote(index: number) {
    if (!b.pollId || voted != null) return;
    setVoted(index); // optimistic — a failed vote just leaves the count stale, not worth a rollback UI for a poll
    try {
      const r = await fetch(`${WORDPRESS}/webx/v1/polls/${b.pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex: index }),
      });
      if (r.ok) {
        const j = await r.json();
        setPoll({ question: j.data.question, options: j.data.options, totalVotes: j.data.totalVotes });
        localStorage.setItem(`webx-poll-voted-${b.pollId}`, String(index));
      }
    } catch {}
  }

  if (status === "error" || !poll) return null;

  const total = poll.totalVotes || poll.options.reduce((s, o) => s + (o.votes || 0), 0);
  return (
    <section className="section" id={b.id}>
      <div className="container">
        <div className="poll-panel">
          {b.heading ? <h2>{b.heading}</h2> : null}
          <p className="poll-question">{poll.question}</p>
          <div className="poll-options">
            {poll.options.map((opt, i) => {
              const pct = total > 0 ? Math.round(((opt.votes || 0) / total) * 100) : 0;
              const isMine = voted === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={"poll-option" + (voted != null ? " voted" : "") + (isMine ? " is-mine" : "")}
                  onClick={() => vote(i)}
                  disabled={voted != null}
                  aria-pressed={isMine}
                >
                  <span className="poll-option-label">{opt.label}{isMine ? " ✓" : ""}</span>
                  {voted != null ? (
                    <span className="poll-option-bar" style={{ width: pct + "%" }} />
                  ) : null}
                  {voted != null ? <span className="poll-option-pct">{pct}%</span> : null}
                </button>
              );
            })}
          </div>
          {voted != null ? <p className="poll-total">รวม {total} เสียง — ขอบคุณที่ร่วมแสดงความคิดเห็น</p> : null}
        </div>
      </div>
    </section>
  );
}
