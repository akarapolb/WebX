"use client";
// A real, working poll — Strapi already has a full public vote backend
// (api::poll.poll, GET /api/polls/:id + POST /api/polls/:id/vote, no
// captcha needed) that no block anywhere ever rendered (TOR gap audit —
// ORST's own homepage promised "แบบสำรวจความคิดเห็น" with a dead button).
// Split out as its own client component, same reason ContactFormBlock.tsx
// is: Blocks.tsx itself has no "use client" of its own.
import { useEffect, useState } from "react";
import type { Block } from "./Blocks";

const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");

type Option = { label: string; votes: number };
type PollData = { question: string; options: Option[]; totalVotes: number };

export default function PollBlock({ b }: { b: Block }) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [voted, setVoted] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!b.pollId) { setStatus("error"); return; }
    // Already-voted state is per-browser only (localStorage), not per-user —
    // same trust level as any anonymous public poll; the backend itself
    // doesn't dedupe voters either (see poll.vote's own comment).
    const key = `webx-poll-voted-${b.pollId}`;
    const savedVote = localStorage.getItem(key);
    fetch(`${STRAPI}/api/polls/${b.pollId}?tenant=${encodeURIComponent(b.tenant || "orst")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setPoll(j.data);
        if (savedVote != null) setVoted(Number(savedVote));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [b.pollId, b.tenant]);

  async function vote(index: number) {
    if (!b.pollId || voted != null) return;
    setVoted(index); // optimistic — a failed vote just leaves the count stale, not worth a rollback UI for a poll
    try {
      const r = await fetch(`${STRAPI}/api/polls/${b.pollId}/vote?tenant=${encodeURIComponent(b.tenant || "orst")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex: index }),
      });
      if (r.ok) {
        const j = await r.json();
        setPoll(j.data);
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
