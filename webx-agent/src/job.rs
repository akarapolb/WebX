//! Running one job: drive MicroAgent step by step, save a snapshot after each step, and resume from the
//! last one after a restart.
use crate::gateway::{ModelClient, ToolGateway};
use microagent::{Agent, Config, Risk, Step, Stop, Tool, ToolOutput};
use std::path::PathBuf;

/// What an admin allowed the assistant to do (Studio's agent levels). It decides which tools are offered at
/// all: a tool above the level is not shown to the model, so it cannot be asked for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Autonomy {
    Off,
    Read,
    Suggest,
    Draft,
    DraftSubmit,
}

impl Autonomy {
    pub fn parse(s: &str) -> Autonomy {
        match s {
            "read" => Autonomy::Read,
            "suggest" => Autonomy::Suggest,
            "draft" => Autonomy::Draft,
            "draft_submit" => Autonomy::DraftSubmit,
            _ => Autonomy::Off,
        }
    }
    /// What the policy asks a person about. A background job has no person, so a call it asks about is declined.
    /// Where write tools are offered at all (draft and above) they run; an outside tool is held back.
    pub fn policy(self) -> microagent::Policy {
        match self {
            Autonomy::Draft | Autonomy::DraftSubmit => microagent::Policy::TRUSTING,
            _ => microagent::Policy::CAUTIOUS,
        }
    }
    pub fn allows(self, risk: Risk) -> bool {
        match self {
            Autonomy::Off => false,
            Autonomy::Read | Autonomy::Suggest => matches!(risk, Risk::Read),
            Autonomy::Draft => matches!(risk, Risk::Read | Risk::Create | Risk::Write),
            Autonomy::DraftSubmit => matches!(risk, Risk::Read | Risk::Create | Risk::Write | Risk::Outside),
        }
    }
}

pub struct Job {
    pub id: String,
    pub tenant: String,
    pub owner: String,
    /// the owner's account id when the job was made: a different id later means a different person
    pub owner_user_id: String,
    /// "strapi" or "wordpress": the engine of the tenant
    pub engine: String,
    /// the lowest autonomy the job needs to run at all (Studio's requiredLevel)
    pub required_level: String,
    /// the policy saved when the job was made (Studio's policySnapshot), or null
    pub policy_snapshot: serde_json::Value,
    pub lang: String,
    pub goal: String,
    pub context: String,
    pub autonomy: Autonomy,
}

impl Job {
    /// The identity Studio's gateway needs to find and check the owner (runAsJobOwner).
    pub fn identity(&self) -> serde_json::Value {
        serde_json::json!({
            "documentId": self.id, "tenantKey": self.tenant, "ownerEmail": self.owner, "ownerUserId": self.owner_user_id,
            "engine": self.engine, "requiredLevel": self.required_level, "policySnapshot": self.policy_snapshot, "lang": self.lang,
        })
    }
}

pub struct JobResult {
    /// "done", "call limit", "declined", "stopped" or "failed: ..."
    pub stop: String,
    pub summary: String,
    pub calls: u32,
    pub resumed: bool,
    pub steps: u32,
}

/// Where snapshots are kept: a file per job here; the control plane's job store is the other implementation.
pub trait SnapshotStore {
    fn load(&self, job_id: &str) -> Option<String>;
    fn save(&mut self, job_id: &str, snapshot: &str) -> Result<(), String>;
    fn clear(&mut self, job_id: &str);
}

pub struct FileStore(pub PathBuf);

impl FileStore {
    fn path(&self, id: &str) -> PathBuf {
        let safe: String = id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
        self.0.join(format!("{safe}.json"))
    }
}
impl SnapshotStore for FileStore {
    fn load(&self, id: &str) -> Option<String> {
        std::fs::read_to_string(self.path(id)).ok()
    }
    fn save(&mut self, id: &str, snapshot: &str) -> Result<(), String> {
        std::fs::create_dir_all(&self.0).map_err(|e| e.to_string())?;
        // write then rename, so a crash mid-write never leaves half a snapshot
        let tmp = self.path(id).with_extension("tmp");
        std::fs::write(&tmp, snapshot).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, self.path(id)).map_err(|e| e.to_string())
    }
    fn clear(&mut self, id: &str) {
        let _ = std::fs::remove_file(self.path(id));
    }
}

/// The tools a job may use: those the gateway lists for this tenant and owner, cut to the autonomy level.
pub fn offered_tools(listed: Vec<(Tool, Risk)>, autonomy: Autonomy) -> Vec<Tool> {
    listed.into_iter().filter(|(_, r)| autonomy.allows(*r)).map(|(t, _)| t).collect()
}

/// Run `job` to its end, or for at most `max_steps` model and tool steps (a slice, so one long job cannot hold
/// the worker): then the result is "paused" and the snapshot stays, and running the same job again continues it.
/// A snapshot is stored for every step taken; one already stored for this job id means the job resumes from it.
pub fn run_job(job: &Job, mut cfg: Config, model: &ModelClient, gateway: &ToolGateway, store: &mut dyn SnapshotStore, max_steps: u32) -> Result<JobResult, String> {
    if job.autonomy == Autonomy::Off {
        return Ok(JobResult { stop: "declined".into(), summary: "The assistant is not allowed to act for this workspace.".into(), calls: 0, resumed: false, steps: 0 });
    }
    cfg.policy = job.autonomy.policy();
    let tools = offered_tools(gateway.list(job)?, job.autonomy);
    let (mut agent, mut step, resumed) = match store.load(&job.id) {
        Some(snap) => {
            let mut a = Agent::restore(cfg, tools, &snap)?;
            let s = a.resume();
            (a, s, true)
        }
        None => {
            let mut a = Agent::new(cfg, tools);
            let s = a.start(&job.goal, &job.context);
            (a, s, false)
        }
    };
    let mut steps = 0u32;
    loop {
        store.save(&job.id, &agent.snapshot())?;
        steps += 1;
        if steps > max_steps {
            // out of steps for this slice: leave the snapshot, so the job continues next time
            return Ok(JobResult { stop: "paused".into(), summary: String::new(), calls: 0, resumed, steps: steps - 1 });
        }
        step = match step {
            Step::Ask(req) => match model.ask(&req) {
                Ok(text) => agent.reply(&text),
                Err(e) => agent.fail(&e),
            },
            Step::Summarize(req) => match model.ask(&req) {
                Ok(text) => agent.summary(&text),
                Err(_) => agent.summary_failed(),
            },
            // the job was authorised by its autonomy level, so its plan is approved
            Step::Plan(_) => agent.approve_plan(true),
            Step::Run(call) => {
                // nobody is there to say yes to a call the policy holds back
                let out = if call.ask { ToolOutput::declined() } else { gateway.run(job, &call) };
                agent.result(call.id, out)
            }
            Step::Question(_) => agent.answer("No one can answer now. Continue with the safest reasonable assumption, or finish and say what you could not do."),
            Step::Done(o) => {
                store.clear(&job.id);
                return Ok(JobResult {
                    stop: match &o.stop {
                        Stop::Failed(why) => format!("failed: {why}"),
                        other => other.label(),
                    },
                    summary: o.summary,
                    calls: o.calls,
                    resumed,
                    steps,
                });
            }
        };
    }
}
