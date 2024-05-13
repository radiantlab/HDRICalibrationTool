use crate::pipeline::DEBUG;
use std::{
    fs::copy,
    path::Path,
    process::{Command, ExitStatus},
};

use super::ConfigSettings;

// Merges multiple LDR images into an HDR image using hdrgen. If images are in JPG or TIFF format,
// runs hdrgen command regularly. If images are not in JPG or TIFF format, converts the inputs
// to TIFF raw images first using dcraw_emu, then runs hdrgen.
// 
// input_images:
//    vector of the paths to the input images. Input images must be in .JPG or .CR2 format.
// response_function:
//    string for the path to the camera response function, must be a .rsp file
// output_path:
//    a string for the path and filename where the resulting HDR image will be saved.
#[tauri::command]
pub fn merge_exposures(
    config_settings: &ConfigSettings,
    mut input_images: Vec<String>,
    response_function: String,
    output_path: String,
) -> Result<String, String> {
    if DEBUG {
        println!("merge_exposures Tauri command was called!");
    }

    // Check whether images are in raw format that needs to be converted to TIF
    let first_image_ext = Path::new(&input_images[0]).extension().unwrap_or_default();
    let convert_to_tiff: bool = if input_images.len() > 0
        && (first_image_ext == "jpg"
            || first_image_ext == "JPG"
            || first_image_ext == "jpeg"
            || first_image_ext == "JPEG"
            || first_image_ext == "tiff"
            || first_image_ext == "TIFF"
            || first_image_ext == "tif"
            || first_image_ext == "TIF")
    {
        false
    } else {
        true
    };

    if DEBUG {
        println!(
            "\n\nMerge exposures {}...\n\n",
            if convert_to_tiff {
                "CONVERTING TO TIFF"
            } else {
                "NOT CONVERTING TO TIFF"
            }
        );
    }

    let mut command: Command;

    // If raw image format other than TIFF, need to first convert them to TIFF to be used by hdrgen
    if convert_to_tiff {
        let mut index = 1;
        for input_image in &input_images {
            // Create a new command for dcraw_emu
            command = Command::new(config_settings.dcraw_emu_path.join("dcraw_emu"));

            // Add command arguments
            command.args([
                "-T",
                "-o",
                "1",
                "-W",
                "-j",
                "-q",
                "3",
                "-g",
                "2",
                "0",
                "-t",
                "0",
                "-b",
                "1.1",
                "-Z",
                config_settings
                    .temp_path
                    .join(format!("input{}.tiff", index))
                    .display()
                    .to_string()
                    .as_str(),
                format!("{}", input_image).as_str(),
            ]);

            let status: Result<ExitStatus, std::io::Error> = command.status();

            if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
                // On error, return an error message
                return Err("Error, non-zero exit status. dcraw_emu command (converting to tiff images) failed.".into());
            }

            index += 1;
        }

        // Update input images vector to contain the newly converted tiff images instead
        let mut new_inputs = Vec::new();
        for i in 1..input_images.len() + 1 {
            new_inputs.push(
                config_settings
                    .temp_path
                    .join(format!("input{}.tiff", i))
                    .display()
                    .to_string(),
            );
        }

        input_images = new_inputs;
    }

    // Create a new command for hdrgen
    command = Command::new(config_settings.hdrgen_path.join("hdrgen"));

    // Add input LDR images as args
    for input_image in input_images {
        command.arg(format!("{}", input_image));
    }

    // Add output path for HDR image
    command.arg("-o");
    command.arg(format!("{}", output_path));

    // Add camera response function if user provided one
    if response_function != "" {
        command.arg("-r");
        command.arg(format!("{}", response_function));
    }

    // Add remaining flags for hdrgen step
    command.args(["-a", "-e", "-f", "-g", "-F"]);

    // Run the command
    let status: Result<ExitStatus, std::io::Error> = command.status();

    if DEBUG {
        println!("\nCommand exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether hdrgen command was successful
    if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
        // On error, return an error message
        Err("Error, non-zero exit status. hdrgen command failed.".into())
    } else {
        // On success, return output path of HDR image
        Ok(output_path.into())
    }
}
