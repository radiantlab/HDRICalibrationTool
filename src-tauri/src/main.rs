// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod merge_exposures;

use merge_exposures::merge_exposures;


fn main() {
    // === Define hardcoded data for testing ===

    // Hardcoded input JPG image paths
    let _fake_input_images: Vec<String> = [
        "../examples/inputs/input_images/IMG_6955.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6956.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6957.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6958.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6959.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6960.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6961.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6962.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6963.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6964.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6965.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6966.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6967.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6968.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6969.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6970.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6971.JPG".to_string(),
        "../examples/inputs/input_images/IMG_6972.JPG".to_string(),
    ]
    .to_vec();

    // Hardcoded camera response function path
    let _fake_response_function =
        "../examples/inputs/parameters/response_function_files/Response_function.rsp".to_string();

    let _fake_output_path = "../tmp/output1.hdr".to_string();

    // UNCOMMENT TO CALL MERGE_EXPOSURES WITH HARDCODED DATA
    // let _result = merge_exposures(
    //     _fake_input_images,
    //     _fake_response_function,
    //     _fake_output_path,
    // );

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![merge_exposures])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

