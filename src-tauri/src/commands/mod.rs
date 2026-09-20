//! IPC command handlers, grouped by area (accounts, library, sync, settings).
//! The full surface is listed in docs/SPEC.md §6.

/// Placeholder command proving the Rust <-> UI bridge works.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
