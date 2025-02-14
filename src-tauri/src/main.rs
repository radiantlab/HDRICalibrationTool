// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import pipeline module
mod pipeline;
use pipeline::pipeline;

// Command to query operating system from frontend
mod query_os_platform;
use query_os_platform::query_os_platform;

mod read_binary_paths;
use read_binary_paths::read_binary_paths;

mod write_binary_paths;
use write_binary_paths::write_binary_paths;

// Command to get app's data directory
mod get_default_output_path;
use get_default_output_path::get_default_output_path;

// Command to save configuration
mod save_config;
use save_config::save_config;

// Command to retrieve saved configurations
mod get_saved_configs;
use get_saved_configs::get_saved_configs;

use std::env;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pipeline,
            query_os_platform,
            read_binary_paths,
            write_binary_paths,
            get_default_output_path,
            save_config,
            get_saved_configs
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
