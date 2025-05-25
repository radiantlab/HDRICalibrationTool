
/**
 * @module resize
 * @description This module provides functionality for resizing HDR images to specific dimensions.
 * It utilizes Radiance's 'pfilt' tool to perform high-quality resampling of HDR images while
 * preserving their photometric properties. Resizing is an important step in the HDRI calibration
 * pipeline to ensure consistent image dimensions for analysis and comparison, or to reduce
 * computational demands for subsequent processing steps.
 */

use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

/**
 * Resizes an HDR image to the target x and y resolution using Radiance's pfilt utility.
 * The function maintains the image's photometric properties while changing its dimensions.
 * The -1 flag is used to keep the original exposure settings during the resize operation.
 * 
 * @param config_settings - Contains configuration settings including paths to Radiance tools and temp directory
 * @param input_file - The path to the input HDR image (must be in .hdr format)
 * @param output_file - The path and filename where the resized HDR image will be saved
 * @param xdim - The target x-dimensional resolution in pixels
 * @param ydim - The target y-dimensional resolution in pixels
 * 
 * @returns Result<String, String> - On success, returns the path to the output file.
 *                                  On failure, returns an error message.
 */
pub fn resize(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    xdim: String,
    ydim: String,
) -> Result<String, String> {
    if DEBUG {
        println!("resize() was called with parameters:");
        println!("\txdim: {xdim}");
        println!("\tydim: {ydim}");
    }

    // Create a new command for pfilt
    let mut command = Command::new(config_settings.radiance_path.join("pfilt"));

    // Add arguments to pfilt command
    command.args([
        "-1",
        "-x",
        xdim.as_str(),
        "-y",
        ydim.as_str(),
        input_file.as_str(),
    ]);

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: resize: failed to create output file for 'pfilt' (resizing) command.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: resize: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!("\nResize command exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'pfilt' (resizing) failed.".into())
    }
}
