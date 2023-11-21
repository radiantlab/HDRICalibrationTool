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

    // Hardcoded temp path
    let _fake_temp_path = "../tmp/".to_string();

    // Hardcoded fisheye diameter and coordinates of square around fisheye view
    let _fake_diameter = "3612".to_string();
    let _fake_xleft = "1019".to_string();
    let _fake_ydown = "74".to_string();

    // Hardcoded HDR image resolution
    let _fake_xdim = "1000".to_string();
    let _fake_ydim = "1000".to_string();

    // let _result = pipeline(
    //     _FAKE_RADIANCE_PATH.to_string(),
    //     _FAKE_HDRGEN_PATH.to_string(),
    //     _fake_output_path,
    //     _fake_temp_path,
    //     _fake_input_images,
    //     _fake_response_function,
    //     _fake_diameter,
    //     _fake_xleft,
    //     _fake_ydown,
    //     _fake_xdim,
    //     _fake_ydim,
    // );

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![pipeline])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
