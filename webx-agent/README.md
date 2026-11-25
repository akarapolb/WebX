# webx-agent

The WebX agent worker (`../docs/target-architecture.md`, decision D13). It runs one background job of the assistant
on [MicroAgent](https://github.com/akarapolb/MicroAgent), the Rust agent loop that does no I/O of its own. MicroAgent
says what to do next; this crate supplies what it asks for:

| MicroAgent asks for | Here it is |
|---|---|
| a model call | any OpenAI-compatible endpoint, in practice the LiteLLM gateway (`LITELLM_URL`, `LITELLM_KEY`, `LITELLM_MODEL`) |
| a tool run | Studio's governed tools through an HTTP gateway (`WEBX_TOOLS_URL`, `WEBX_TOOLS_SECRET`), so tenant scoping, custom roles and field policies apply as in Studio |
| an approval | none can be given in the background: a call the policy holds back is declined, and tools above the job's autonomy are never offered |

```sh
cargo build --release
LITELLM_URL=http://localhost:4000/v1 WEBX_TOOLS_URL=http://localhost:3000/api/internal/agent-tools WEBX_TOOLS_SECRET=... \
  target/release/webx-agent run --goal "Summarise last month's audit log" --tenant dga --owner ann@example.org --owner-user-id 7 \
  --autonomy draft --state ./agent-state --max-steps 40
```

## Serving the queue

```sh
WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_SERVICE_TOKEN=... LITELLM_URL=... WEBX_TOOLS_URL=... WEBX_TOOLS_SECRET=... \
  target/release/webx-agent serve [--once] [--worker-id w1] [--poll-seconds 5] [--max-steps 40] [--default-cap 2] [--heartbeat-ms 20000]
```

`serve` leases jobs from the queue in webx-control (`../webx-control`, section "Job queue") and runs each in a slice as its
owner. The agent's snapshot is saved as the job's checkpoint after every step (which also extends the lease), so any worker
can pick a job up where another stopped. A heartbeat thread runs beside the job: it keeps the lease and hears the user's cancel
and pause (a cancel stops the agent and reports `cancelled`; a pause ends the slice and reports `paused`); if the lease is lost
the worker stops at once and writes nothing more. A slice that runs out of steps goes back to the queue; `--once` claims what
is runnable, runs it and exits. Several workers can share one queue.

## The tool gateway (Studio serves it)

```
POST {base}/tools  {job}               -> {"data": [{name, help, risk, args: [{name, kind, help, required}]}]}
POST {base}/run    {job, tool, args}   -> {"ok": bool, "text": string}
```

`job` is the job's identity (`Job::identity`): `documentId`, `tenantKey`, `ownerEmail`, `ownerUserId`, `engine`,
`requiredLevel`, `policySnapshot`, `lang`. Both calls carry `Authorization: Bearer <secret>`.

Studio's side is `webx-studio/app/api/internal/agent-tools/` (`WEBX_AGENT_TOOLS_SECRET`, which must equal this worker's
`WEBX_TOOLS_SECRET`). It re-checks the owner on every call through `runAsJobOwner`, the check a Studio-run background job
uses (still in the workspace and active, the plan and the agent policy still allow it), then lists or runs the tools through
`executeTool`, which re-checks the autonomy level, the allow-list and the arguments. `risk` is `read` or `write`, set from
the tool's mode; nothing the agent has leaves WebX, so none is `outside` or `money`. This crate treats a risk word it does
not know as `money`, the strictest class. `kind` is `text`, `number`, `bool`, `list`, `object` or free-form.

## Autonomy

Studio's agent levels decide which tools a job is offered at all (not just which it may run):
`off` none, `read` and `suggest` read tools, `draft` read, create and write, `draft_submit` those and outside tools.
Money tools are never offered to a background job. Write tools run at `draft` and above (the policy is trusting there);
an outside tool is held back and declined, because no person is there to say yes.

## Resuming

After every step the agent's snapshot is saved (a file per job in `--state`; the control plane's job store is the
other implementation of `SnapshotStore`). A run takes at most `--max-steps` steps and then reports `paused`; running the
same job id again continues from the snapshot, so a long job cannot hold the worker and a restart loses nothing. A
finished job clears its snapshot.

## Tests

```sh
cargo test                       # 8 job tests against a mock model and a mock gateway over real HTTP
node tools/serve-test.mjs        # the real worker, the real job queue, a mock model and a mock Studio gateway
```

They cover the happy path (tools run as the owner, with the bearer token), a held-back write declined without reaching
the gateway, tools above the autonomy level not offered, a tool never offered being refused, autonomy `off`, pause and
resume across two worker processes, and a model that keeps failing.

## Not yet

Studio's side is done: with `WEBX_CONTROL_QUEUE=1` (and the control URL and token) its jobs API, the workers' leases and the schedule
tick all use the control plane's queue and schedule store (`webx-studio/lib/cms/queue-store.ts`), and that path runs against a live
Studio in CI for list, read and cancel (`e2e/tests/queue-control-plane.spec.ts`). Creating a job and running it through this
worker end to end against a live Studio is only covered by unit and mock tests. What is left: memory notes and skills, behaviour
parity with the Node worker (`webx-studio/lib/agent/worker.ts`: its slice and retry rules, stuck-job handling, usage limits), the
agent evals (`eval/`) run against this worker, and schedules driving MicroAgent triggers.
