// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import pipeline module
mod pipeline;
use pipeline::pipeline;

// Hardcoded radiance and hdrgen paths for backend testing
const _FAKE_RADIANCE_PATH: &str = "/usr/local/radiance/bin/";
const _FAKE_HDRGEN_PATH: &str = "/usr/local/bin/";

fn main() {
    // === Define hardcoded data for testing ===

    // Hardcoded output path
    let _fake_output_path = "../output/".to_string();

    // Hardcoded temp path
    let _fake_temp_path = "../tmp/".to_string();

    // UNCOMMENT TO CALL PIPELINE WITH HARDCODED DATA
    // let _result = pipeline(
    //     _FAKE_RADIANCE_PATH.to_string(),
    //     _FAKE_HDRGEN_PATH.to_string(),
    //     _fake_output_path,
    //     _fake_temp_path,
    // );

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pipeline])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
