use crate::pipeline::DEBUG;
use std::{
    path::Path,
    process::{Command, ExitStatus},
};
use std::env;

use super::ConfigSettings;
use tauri_plugin_shell::ShellExt;

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
    app: &tauri::AppHandle,
    config_settings: &ConfigSettings,
    mut input_images: Vec<String>,
    response_function: String,
    output_path: String,
) -> Result<String, String> {
    if DEBUG {
        println!("merge_exposures Tauri command was called!");
    }

    // Check whether images are in raw format that needs to be converted to TIF
    let convert_to_tiff: bool = input_images.len() > 0 && is_raw(&input_images[0]);

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
        // Get working directory of libraw.dll (only needed for windows)
        let cur_exe = env::current_exe().unwrap().parent().unwrap().to_path_buf();

        let dcraw_emu_build_working_directory = if cfg!(target_os = "macos") {
            if cfg!(debug_assertions) {
                // macOS dev mode
                cur_exe.join("binaries")
            } else {
                // macOS release mode (inside .app bundle)
                cur_exe.join("../Resources/binaries")
            }
        } else {
            // Linux and Windows
            cur_exe.join("binaries")
        };

        let mut index = 1;
        for input_image in &input_images {

            // Add command arguments
            let output_arg = 
                config_settings
                    .temp_path
                    .join(format!("input{}.tiff", index))
                    .display()
                    .to_string();
            let input_arg = format!("{}", input_image);
            let args = [
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
                &output_arg,
                &input_arg
            ];

            if config_settings.dcraw_emu_path.as_os_str().is_empty() {
                command = app.shell().sidecar("dcraw_emu").unwrap().into();

                command.current_dir(&dcraw_emu_build_working_directory); // Set the working directory to find libraw.dll

                if DEBUG {
                    let sidecar_path = command.get_program();
                    println!("Executing bundled sidecar at: {:?}\n", sidecar_path);
                }
            } else {
                if DEBUG {
                    println!("Overwriting bundled sidecar, running command at: {:?}\n", config_settings.dcraw_emu_path.join("dcraw_emu"));
                }
                command = Command::new(config_settings.dcraw_emu_path.join("dcraw_emu"));
            }

            command.args(args);
            let status: Result<ExitStatus, std::io::Error> = command.status();

            if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
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
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: merge_exposures: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!("\nCommand exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether hdrgen command was successful
    if !status.success() {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'hdrgen' failed.".into())
    } else {
        // On success, return output path of HDR image
        Ok(output_path.into())
    }
}

// Returns a boolean representing whether the image file is in raw format. Returns false if JPG or TIF.
fn is_raw(file_name: &String) -> bool {
    let image_ext = Path::new(file_name)
        .extension()
        .unwrap_or_default()
        .to_ascii_lowercase();

    if image_ext == "jpg" || image_ext == "jpeg" || image_ext == "tiff" || image_ext == "tif" {
        // Image is JPG or TIF
        false
    } else {
        // Image is in raw format
        true
    }
}
