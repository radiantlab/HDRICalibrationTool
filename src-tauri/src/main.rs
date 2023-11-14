// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;

const DEBUG: bool = false;

// Path to hdrgen executable
const HDRGEN_PATH: &str = "../../hdrgen_macosx/bin/";

// Directory for output HDR images
// const OUTPUT_PATH: &str = "../../results/";

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

    // Call merge_exposures with hardcoded data
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

// Merges multiple LDR images into an HDR image using hdrgen.
// input_images is a vector of the paths to the input images.
//    Input images must be in .JPG format.
// response_function is a string for the path to the
//    camera response function, must be a .rsp file
#[tauri::command]
fn merge_exposures(
    input_images: Vec<String>,
    response_function: String,
    output_path: String,
) -> Result<String, String> {
    if DEBUG {
        println!("merge_exposures Tauri command was called!");
    }

    // Create a new command for hdrgen
    let mut command = Command::new(HDRGEN_PATH.to_string() + "hdrgen");

    // Add input LDR images as args
    for input_image in input_images {
        command.arg(format!("{}", input_image));
    }

    // Add output path for HDR image
    command.arg("-o");
    command.arg(format!("{}", output_path));

    // Add camera response function
    command.arg("-r");
    command.arg(format!("{}", response_function));

    // Add remaining flags for hdrgen step
    command.arg("-a");
    command.arg("-e");
    command.arg("-f");
    command.arg("-g");

    // Run the command
    let status = command.status().unwrap();

    if DEBUG {
        println!("\nCommand exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether hdrgen command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_path.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. hdrgen command failed.".into())
    }
}
