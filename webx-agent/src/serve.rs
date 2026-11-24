//! The worker loop: lease jobs from the queue in webx-control, run each in a slice as its owner, keep the lease
//! alive and listen for the user's cancel and pause while it runs, and report how the slice ended.
use crate::control::{ControlClient, ControlStore};
use crate::gateway::{ModelClient, ToolGateway};
use crate::job::{run_job_with, Autonomy, Interrupt, Job};
use microagent::Config;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;

pub struct ServeConfig {
    pub worker_id: String,
    pub limit: usize,
    /// a workspace's concurrent-job limit, by key (Studio knows the plans)
    pub caps: Value,
    pub default_cap: i64,
    /// steps in one slice; then the job goes back to the queue and any worker may continue it
    pub max_steps: u32,
    pub heartbeat_every: Duration,
}

impl Default for ServeConfig {
    fn default() -> Self {
        ServeConfig { worker_id: format!("worker-{}", std::process::id()), limit: 1, caps: json!({}), default_cap: 2, max_steps: 40, heartbeat_every: Duration::from_secs(20) }
    }
}

/// A claimed row as a `Job`: the identity Studio re-checks, the goal, and the level the worker offers tools at.
pub fn job_from_row(row: &Value) -> Result<Job, String> {
    let text = |k: &str| row[k].as_str().filter(|s| !s.is_empty()).map(str::to_string).ok_or_else(|| format!("the job has no {k}"));
    let level = row["policySnapshot"]["level"].as_str().or_else(|| row["requiredLevel"].as_str()).unwrap_or("off");
    Ok(Job {
        id: text("documentId")?,
        tenant: text("tenantKey")?,
        owner: text("ownerEmail")?,
        owner_user_id: row["ownerUserId"].as_str().map(str::to_string).or_else(|| row["ownerUserId"].as_i64().map(|n| n.to_string())).ok_or("the job has no ownerUserId")?,
        engine: row["engine"].as_str().unwrap_or("strapi").to_string(),
        required_level: row["requiredLevel"].as_str().unwrap_or("read").to_string(),
        policy_snapshot: row["policySnapshot"].clone(),
        lang: if row["lang"] == "th" { "th".into() } else { "en".into() },
        goal: text("goal")?,
        context: row["params"]["context"].as_str().unwrap_or("").to_string(),
        autonomy: Autonomy::parse(level),
    })
}

const OK: u8 = 0;
const CANCEL: u8 = 1;
const PAUSE: u8 = 2;
const LOST: u8 = 3;

/// Run one claimed job for a slice and report how it ended. Returns without reporting when the lease was lost
/// (another worker holds the job: it is theirs to report).
pub fn run_claimed(control: &ControlClient, model: &ModelClient, gateway: &ToolGateway, cfg: &ServeConfig, row: &Value) -> Result<(), String> {
    let lease = row["leaseToken"].as_str().ok_or("the claim carried no lease token")?.to_string();
    let doc = row["documentId"].as_str().ok_or("the claim carried no documentId")?.to_string();
    let job = match job_from_row(row) {
        Ok(j) => j,
        Err(e) => {
            control.finish(&doc, &lease, json!({"runState": "failed", "stateReason": "bad_job", "lastError": e, "eventSeq": 0}))?;
            return Ok(());
        }
    };

    // the heartbeat runs beside the job: it keeps the lease and hears the user's cancel and pause
    let state = Arc::new(AtomicU8::new(OK));
    let stop = Arc::new(AtomicBool::new(false));
    let beat = {
        let (state, stop) = (state.clone(), stop.clone());
        let (client, doc, lease, every) = (ControlClient { base: control.base.clone(), token: control.token.clone() }, doc.clone(), lease.clone(), cfg.heartbeat_every);
        std::thread::spawn(move || {
            let tick = Duration::from_millis(25);
            let mut waited = Duration::ZERO;
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(tick);
                waited += tick;
                if waited < every {
                    continue;
                }
                waited = Duration::ZERO;
                match client.heartbeat(&doc, &lease) {
                    Ok(None) => state.store(LOST, Ordering::Relaxed),
                    Ok(Some((true, _))) => state.store(CANCEL, Ordering::Relaxed),
                    Ok(Some((false, true))) => { let _ = state.compare_exchange(OK, PAUSE, Ordering::Relaxed, Ordering::Relaxed); }
                    Ok(Some(_)) | Err(_) => {} // a transient error: the next beat tries again
                }
            }
        })
    };

    let mut store = ControlStore { client: control, job_id: doc.clone(), lease: lease.clone(), initial: ControlStore::snapshot_of(row), seq: row["checkpointSeq"].as_i64().unwrap_or(0) };
    let interrupt = {
        let state = state.clone();
        move || match state.load(Ordering::Relaxed) {
            CANCEL => Some(Interrupt::Cancel),
            PAUSE => Some(Interrupt::Pause),
            LOST => Some(Interrupt::LeaseLost),
            _ => None,
        }
    };
    let result = run_job_with(&job, Config::default(), model, gateway, &mut store, cfg.max_steps, &interrupt);
    stop.store(true, Ordering::Relaxed);
    let _ = beat.join();

    let progress = |steps: u32, calls: u32, last: &str| json!({"turns": steps, "toolCalls": calls, "tokens": 0, "applied": 0, "proposals": 0, "plan": null, "question": null, "lastStop": last});
    let patch = match result {
        Err(e) if e == "lease lost" => return Ok(()),
        Err(e) => json!({"runState": "failed", "stateReason": "error", "lastError": e, "eventSeq": 0}),
        Ok(r) => match r.stop.as_str() {
            "done" => json!({"runState": "done", "outcome": "completed", "result": {"summary": r.summary, "calls": r.calls}, "progress": progress(r.steps, r.calls, "done"), "eventSeq": 0}),
            // out of steps for this slice: back to the queue, and the checkpoint carries on
            "paused" => json!({"runState": "queued", "progress": progress(r.steps, r.calls, "slice"), "eventSeq": 0}),
            "pause" => json!({"runState": "paused", "stateReason": "user", "progress": progress(r.steps, r.calls, "pause"), "eventSeq": 0}),
            "stopped" => json!({"runState": "cancelled", "stateReason": "user", "progress": progress(r.steps, r.calls, "cancelled"), "eventSeq": 0}),
            "declined" => json!({"runState": "failed", "stateReason": "declined", "lastError": r.summary, "eventSeq": 0}),
            "call limit" => json!({"runState": "done", "outcome": "partial_budget", "result": {"summary": r.summary, "calls": r.calls}, "progress": progress(r.steps, r.calls, "call limit"), "eventSeq": 0}),
            other => json!({"runState": "failed", "stateReason": "error", "lastError": other, "progress": progress(r.steps, r.calls, other), "eventSeq": 0}),
        },
    };
    control.finish(&doc, &lease, patch)?;
    Ok(())
}

/// Claim what is runnable and run it. Returns how many jobs were run.
pub fn serve_once(control: &ControlClient, model: &ModelClient, gateway: &ToolGateway, cfg: &ServeConfig) -> Result<usize, String> {
    let rows = control.claim(&cfg.worker_id, cfg.limit, &cfg.caps, cfg.default_cap)?;
    for row in &rows {
        if let Err(e) = run_claimed(control, model, gateway, cfg, row) {
            eprintln!("[webx-agent] job {}: {e}", row["documentId"].as_str().unwrap_or("?"));
        }
    }
    Ok(rows.len())
}

/// The daemon: claim, run, and when the queue is empty wait `poll` before asking again.
pub fn serve_forever(control: &ControlClient, model: &ModelClient, gateway: &ToolGateway, cfg: &ServeConfig, poll: Duration) -> ! {
    loop {
        match serve_once(control, model, gateway, cfg) {
            Ok(0) => std::thread::sleep(poll),
            Ok(_) => {}
            Err(e) => {
                eprintln!("[webx-agent] {e}");
                std::thread::sleep(poll);
            }
        }
    }
}
