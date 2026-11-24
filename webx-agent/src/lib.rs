//! The WebX agent worker (docs/target-architecture.md, decision D13): runs one
//! background job of the assistant on MicroAgent, the Rust agent loop that does no
//! I/O of its own. MicroAgent decides what to do next; this crate supplies the three
//! things it asks for:
//!
//!  - the **model**: any OpenAI-compatible endpoint, in practice the LiteLLM gateway;
//!  - the **tools**: Studio's governed tools, reached through a small HTTP gateway, so
//!    tenant scoping, custom roles and field policies apply exactly as in Studio;
//!  - the **approvals**: a background job has no person to ask, so a call the policy
//!    says needs a yes is declined, and tools above the job's autonomy are never offered.
//!
//! After every step the agent's snapshot is saved, so a job resumes where it stopped
//! after a restart.
pub mod gateway;
pub mod job;

pub use gateway::{ModelClient, ToolGateway};
pub use job::{run_job, Autonomy, FileStore, Job, JobResult, SnapshotStore};
