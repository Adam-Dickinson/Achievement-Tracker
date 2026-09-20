//! Sync engine (docs/SPEC.md §5).
//!
//! Planned modules (M1): `scheduler` (per-account supervised tasks), `diff`
//! (remote vs. stored unlocks, applies the **baseline rule**: the first sync of
//! a game emits no events), `detector` (running-game detection, M2).

pub mod backoff;
pub mod events;
