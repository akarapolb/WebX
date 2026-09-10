import type { EngineClock } from "../../lib/agent/engine/types";

export type FakeClock = EngineClock & { advance(ms: number): void };

/** Time only moves when a test, or a sleep, moves it. */
export function fakeClock(start = Date.UTC(2026, 8, 11, 3, 0, 0)): FakeClock {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw signal.reason ?? new Error("aborted");
      t += ms;
    },
  };
}
