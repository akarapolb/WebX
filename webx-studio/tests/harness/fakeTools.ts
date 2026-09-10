import type { EngineTools, ToolCall, ToolOutcome, ToolSpec } from "../../lib/agent/engine/types";

export type FakeTool = {
  write?: boolean;
  description?: string;
  parameters?: Record<string, any>;
  run: (args: any, call: ToolCall) => ToolOutcome | Promise<ToolOutcome>;
};

export type FakeToolCall = { name: string; args: any; id: string };

/** An in-memory tool registry for engine tests. `calls` records every executed
 * call in order; `hide()` withdraws every tool, like a policy change mid-run. */
export function fakeTools(defs: Record<string, FakeTool>) {
  const calls: FakeToolCall[] = [];
  let hidden = false;
  const tools: EngineTools = {
    specs: (): ToolSpec[] =>
      hidden
        ? []
        : Object.entries(defs).map(([name, d]) => ({
            type: "function",
            function: { name, description: d.description ?? name, parameters: d.parameters ?? { type: "object", properties: {} } },
          })),
    isWrite: (name) => Boolean(defs[name]?.write),
    async execute(call) {
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* recorded as {} */
      }
      calls.push({ name: call.function.name, args, id: call.id });
      const def = defs[call.function.name];
      if (!def) return { ok: false, summary: `Unknown tool "${call.function.name}".` };
      return def.run(args, call);
    },
  };
  return {
    tools,
    calls,
    hide: () => {
      hidden = true;
    },
  };
}
