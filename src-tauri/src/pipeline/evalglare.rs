/**
 * Module for analyzing glare in HDR images using Radiance's evalglare tool.
 * 
 * This module provides functionality to run the evalglare utility from the Radiance
 * suite, which analyzes glare sources in HDR images. The output contains information
 * about glare sources, daylight glare probability (DGP), and other metrics useful
 * for evaluating visual comfort.
 */
use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;
use std::io::Write;

use super::ConfigSettings;

/**
 * Runs the evalglare command on an HDR image and saves the output
 * 
 * This function executes Radiance's evalglare tool to analyze glare sources in an HDR image.
 * The results are saved to the specified output file and include glare metrics such as
 * Daylight Glare Probability (DGP).
 * 
 * @param config_settings - Contains configuration settings including path to Radiance and temp directory
 * @param input_file - Path to the input HDR image (must be in .hdr format)
 * @param output_file - Path where the glare analysis results will be saved
 * @param vertical_angle - The fov, in degrees, of the image vertically. Found within the camera settings
 * @param horizontal_angle - The fov, in degrees, of the image horizontally. Found within the camera settings
 * @returns Result containing the output value on success or an error message on failure
 */
pub fn evalglare(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    vertical_angle: String,
    horizontal_angle: String,
) -> Result<String, String> {    // Print debug message if in debug mode
    if DEBUG {
        println!("evalglare() was called.");
    }

    // Create command to run evalglare from the Radiance path
    let mut command = Command::new(config_settings.radiance_path.join("evalglare"));

    // Add arguments:
    // -V: Verbose output with detailed information about glare sources
    // -vta: View type
    // -vv/vh: Vertical and horizontal view angles
    command.args([
        "-vta",
        "-vv",
        vertical_angle.as_str(),
        "-vh",
        horizontal_angle.as_str(),
        "-V",
        input_file.as_str(),
    ]); // Execute command and capture output
    let output_result = command.output();
    if output_result.is_err() {
        return Err("pipeline: evalglare: failed to start command.".into());
    }
    let output = output_result.unwrap();

    // Print debug info about command execution status
    if DEBUG {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!(
            "\n'evalglare' command exit status: {:?}\n",
            output.status
        );
        println!(
            "'evalglare' command stderr:\n {}",
            stderr
        );
    }    
    
    // Convert command output from bytes to string
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Return a Result object with the command output
    if output.status.success() || !stdout.is_empty() {
        Ok(stdout.to_string())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'evalglare' failed.".into())
    }
}
