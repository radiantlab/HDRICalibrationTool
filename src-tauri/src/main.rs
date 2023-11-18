// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod nullify_exposure_value;

use nullify_exposure_value::nullify_exposure_value;

fn main() {
    // === Define hardcoded data for testing ===

    // Hardcoded input HDR image path
    let _fake_input_image = "../tmp/output1.hdr".to_string();

    // Hardcoded output HDR image path
    let _fake_output_path = "../tmp/output1.hdr".to_string();

    // UNCOMMENT TO CALL NULLIFY_EXPOSURE_VALUE WITH HARDCODED DATA
    // let _result = nullify_exposure_value(
    //     _fake_input_image,
    //     _fake_output_path,
    // );

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![nullify_exposure_value])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
