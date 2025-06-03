
/**
 * @module crop
 * @description This module provides functionality for cropping fisheye view HDR images.
 * It uses Radiance's 'pcompos' tool to crop a fisheye image into a square that circumscribes
 * the circular fisheye view. This is a critical step in the HDRI calibration pipeline as it
 * ensures the fisheye image is properly positioned and sized for subsequent processing.
 */

use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

/**
 * Crops a fisheye view HDR image to a square which circumscribes the circular fisheye view.
 * Uses Radiance's 'pcompos' tool to extract a specific portion of the image based on
 * given dimensions and coordinates.
 * 
 * @param config_settings - Contains configuration settings including paths to Radiance tools and temp directory
 * @param input_file - The path to the input HDR image (must be in .hdr format)
 * @param output_file - The path and filename where the cropped HDR image will be saved
 * @param diameter - The fisheye view diameter in pixels (defines the size of the output square)
 * @param xleft - The x-coordinate of the bottom left corner of the circumscribed square (in pixels)
 * @param ydown - The y-coordinate of the bottom left corner of the circumscribed square (in pixels)
 * 
 * @returns Result<String, String> - On success, returns the path to the output file.
 *                                  On failure, returns an error message.
 */
pub fn crop(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    diameter: String,
    xleft: String,
    ydown: String,
) -> Result<String, String> {
    if DEBUG {
        println!("crop() was called with parameters:");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");
    }

    // Create a new command for pcompos
    let mut command = Command::new(config_settings.radiance_path.join("pcompos"));

    // Add arguments to pcompos command
    command.args([
        "-x",
        diameter.as_str(),
        "-y",
        diameter.as_str(),
        input_file.as_str(),
        format!("-{xleft}").as_str(),
        format!("-{ydown}").as_str(),
    ]);

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);

    // If error creating output file abort pipeline
    if file_result.is_err() {
        return Err("pipeline: crop: failed to create output file for 'pcompos' command.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err
    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: crop: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!("\n'pcompos' command exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'pcompos' failed.".into())
    }
}
