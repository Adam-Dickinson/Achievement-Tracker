//! Thin Tauri shell over the `at-*` crates: windows, tray, IPC, notifications.

mod commands;
mod notify;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_version])
        .run(tauri::generate_context!())
        .expect("error while running Achievement Tracker");
}
