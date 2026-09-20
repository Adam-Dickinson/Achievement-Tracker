//! Domain types and abstractions shared by every other crate.
//!
//! `at-core` depends on nothing internal (see docs/ARCHITECTURE.md §2).

pub mod error;
pub mod model;
pub mod platform;
pub mod provider;
pub mod secrets;

pub use error::ProviderError;
pub use platform::Platform;
pub use provider::{AchievementProvider, Capabilities};
