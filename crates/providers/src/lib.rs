//! Platform adapters. Each module implements `at_core::AchievementProvider`
//! and returns normalized DTOs only: no SQL, no notifications, no UI.
//!
//! To add one, follow `.claude/skills/add-provider` (online) or
//! `.claude/skills/add-emulator-adapter` (local files).

// P0 / P1
pub mod playstation;
pub mod retroachievements;
pub mod rpcs3;
pub mod steam;
pub mod xbox;

// P2: research spikes first (docs/PROVIDERS.md). Some may end as "unsupported".
pub mod ea;
pub mod epic;
pub mod local_file;
pub mod ubisoft;
pub mod xenia;
