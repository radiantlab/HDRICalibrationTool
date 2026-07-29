// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The image pipeline now runs in the frontend as WebAssembly (src/lib/pipeline),
// so Tauri is left as a shell for native file access and window management.
// What remains here serves the image viewer, not the pipeline.

mod hdr_metadata;
use hdr_metadata::read_hdr_metadata;

use tauri::Manager;

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(feature = "e2e-driver")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_hdr_metadata])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
