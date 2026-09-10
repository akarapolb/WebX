import type { RunCheckpoint, SaveAt } from "../../lib/agent/engine/types";

export class SimulatedCrash extends Error {
  readonly at: SaveAt;
  readonly nth: number;
  constructor(at: SaveAt, nth: number) {
    super(`Simulated crash after save #${nth} at "${at}"`);
    this.name = "SimulatedCrash";
    this.at = at;
    this.nth = nth;
  }
}

/** A checkpoint store that persists through JSON, like the real one.
 * `crashOn` throws right after the nth save at that point, as if the process
 * died there with that checkpoint already written. */
export function memoryStore(o: { crashOn?: { at: SaveAt; nth?: number } } = {}) {
  const saves: { at: SaveAt; json: string }[] = [];
  const counts = new Map<SaveAt, number>();
  return {
    saves,
    last(): RunCheckpoint | null {
      const s = saves[saves.length - 1];
      return s ? (JSON.parse(s.json) as RunCheckpoint) : null;
    },
    async save(cp: RunCheckpoint, at: SaveAt): Promise<void> {
      saves.push({ at, json: JSON.stringify(cp) });
      const n = (counts.get(at) ?? 0) + 1;
      counts.set(at, n);
      if (o.crashOn && o.crashOn.at === at && (o.crashOn.nth ?? 1) === n) throw new SimulatedCrash(at, n);
    },
  };
}
