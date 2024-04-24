// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import pipeline module
mod pipeline;
use pipeline::pipeline;

use std::env;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pipeline])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
