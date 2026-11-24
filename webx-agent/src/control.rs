//! The job queue in webx-control (`/internal/jobs`, see `webx-control/src/jobs.rs`) as the worker uses it.
//! Every write carries the lease token; `false` or `None` means another worker holds the job now.
use crate::job::SnapshotStore;
use serde_json::{json, Value};
use std::time::Duration;

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10)).timeout(Duration::from_secs(30)).build()
}

pub struct ControlClient {
    pub base: String,
    pub token: String,
}

impl ControlClient {
    fn post(&self, path: &str, body: Value) -> Result<Value, String> {
        agent()
            .post(&format!("{}/internal/jobs/{}", self.base.trim_end_matches('/'), path))
            .set("Authorization", &format!("Bearer {}", self.token))
            .send_json(body)
            .map_err(|e| format!("job queue {path} failed: {e}"))?
            .into_json()
            .map_err(|e| format!("job queue {path} answer is not JSON: {e}"))
    }

    /// Lease up to `limit` runnable jobs. `caps` is each workspace's concurrent-job limit.
    pub fn claim(&self, worker_id: &str, limit: usize, caps: &Value, default_cap: i64) -> Result<Vec<Value>, String> {
        let r = self.post("claim", json!({"workerId": worker_id, "limit": limit, "caps": caps, "defaultCap": default_cap}))?;
        Ok(r["jobs"].as_array().cloned().unwrap_or_default())
    }

    /// Extend the lease. None: the lease is gone. Some((cancel requested, pause requested)).
    pub fn heartbeat(&self, id: &str, lease: &str) -> Result<Option<(bool, bool)>, String> {
        let r = self.post("heartbeat", json!({"documentId": id, "leaseToken": lease}))?;
        Ok(r["ok"].as_bool().unwrap_or(false).then(|| (r["cancelRequested"].as_bool().unwrap_or(false), r["pauseRequested"].as_bool().unwrap_or(false))))
    }

    pub fn checkpoint(&self, id: &str, lease: &str, patch: Value) -> Result<bool, String> {
        let mut b = patch;
        b["documentId"] = json!(id);
        b["leaseToken"] = json!(lease);
        Ok(self.post("checkpoint", b)?["ok"].as_bool().unwrap_or(false))
    }

    pub fn finish(&self, id: &str, lease: &str, patch: Value) -> Result<bool, String> {
        let mut b = patch;
        b["documentId"] = json!(id);
        b["leaseToken"] = json!(lease);
        Ok(self.post("finish", b)?["ok"].as_bool().unwrap_or(false))
    }
}

/// Keeps the agent's snapshot as the job's checkpoint in the queue, so any worker can pick the job up where
/// another stopped. Saving is also a heartbeat (a checkpoint extends the lease). It fails when the lease is gone.
pub struct ControlStore<'a> {
    pub client: &'a ControlClient,
    pub job_id: String,
    pub lease: String,
    /// the checkpoint the claim returned: where this slice starts from
    pub initial: Option<String>,
    pub seq: i64,
}

impl ControlStore<'_> {
    /// The snapshot a claimed row carries, if any (stored as {"snapshot": "<text>"}).
    pub fn snapshot_of(row: &Value) -> Option<String> {
        row["checkpoint"]["snapshot"].as_str().map(str::to_string)
    }
}

impl SnapshotStore for ControlStore<'_> {
    fn load(&self, _job_id: &str) -> Option<String> {
        self.initial.clone()
    }
    fn save(&mut self, _job_id: &str, snapshot: &str) -> Result<(), String> {
        self.seq += 1;
        let ok = self.client.checkpoint(&self.job_id, &self.lease, json!({"checkpoint": {"snapshot": snapshot}, "checkpointSeq": self.seq, "eventSeq": 0}))?;
        if ok { Ok(()) } else { Err("lease lost".into()) }
    }
    fn clear(&mut self, _job_id: &str) {
        // the final finish call replaces the checkpoint; nothing to clear here
    }
}
