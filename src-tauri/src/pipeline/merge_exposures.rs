use crate::pipeline::DEBUG;
use std::{
    path::Path,
    process::{Command, ExitStatus},
};

use super::ConfigSettings;

// const RAW: bool = true;

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

    // Check whether images are in raw format
    let first_image_ext = Path::new(&input_images[0]).extension().unwrap_or_default();
    let raw_images: bool = if input_images.len() > 0
        && (first_image_ext == "jpg"
            || first_image_ext == "JPG"
            || first_image_ext == "jpeg"
            || first_image_ext == "JPEG")
    {
        false
    } else {
        true
    };

    if DEBUG {
        println!(
            "\n\nMerge exposures running in {} MODE...\n\n",
            if raw_images { "RAW" } else { "JPG" }
        );
    }

    let mut command: Command;
    if raw_images {
        // Create a new command for raw2hdr
        command = Command::new(config_settings.hdrgen_path.join("raw2hdr"));

        // Add output path for HDR image
        command.arg("-o");
        command.arg(format!("{}", output_path));

        // Add input raw LDR images as args
        for input_image in input_images {
            command.arg(format!("{}", input_image));
        }
    } else {
        // Create a new command for hdrgen
        command = Command::new(config_settings.hdrgen_path.join("hdrgen"));

        // Add input LDR images as args
        for input_image in input_images {
            command.arg(format!("{}", input_image));
        }

        // Add output path for HDR image
        command.arg("-o");
        command.arg(format!("{}", output_path));

        // // Add camera response function
        command.arg("-r");
        command.arg(format!("{}", response_function));

        // Add remaining flags for hdrgen step
        command.arg("-a");
        command.arg("-e");
        command.arg("-f");
        command.arg("-g");
    }

    // Run the command
    let status: Result<ExitStatus, std::io::Error> = command.status();

    if DEBUG {
        println!("\nCommand exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether hdrgen command was successful
    if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
        // On error, return an error message
        Err(format!(
            "Error, non-zero exit status. {} command failed.",
            if raw_images { "raw2hdr" } else { "hdrgen" }
        )
        .into())
    } else {
        // On success, return output path of HDR image
        Ok(output_path.into())
    }
}
