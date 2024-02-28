use crate::pipeline::DEBUG;
use std::os::unix::process::ExitStatusExt;
use std::process::{Command, ExitStatus};
use std::string::ToString;

use super::ConfigSettings;

// Merges multiple LDR images into an HDR image using hdrgen.
// input_images:
//    vector of the paths to the input images. Input images must be in .JPG format.
// response_function:
//    string for the path to the camera response function, must be a .rsp file
// output_path:
//    a string for the path and filename where the resulting HDR image will be saved.
#[tauri::command]
pub fn merge_exposures(
    config_settings: &ConfigSettings,
    input_images: Vec<String>,
    response_function: String,
    output_path: String,
) -> Result<String, String> {
    if DEBUG {
        println!("merge_exposures Tauri command was called!");
    }

    // Create a new command for hdrgen
    let mut command = Command::new(config_settings.hdrgen_path.join("hdrgen"));

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
    let status = command.status().unwrap_or(ExitStatus::from_raw(1));       // status = ExitStatus of 1 if failure to unwrap

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
