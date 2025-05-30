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
 * @returns Result containing the output file path on success or an error message on failure
 */
pub fn evalglare(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
) -> Result<String, String> {    // Print debug message if in debug mode
    if DEBUG {
        println!("evalglare() was called.");
    }

    // Create command to run evalglare from the Radiance path
    let mut command = Command::new(config_settings.radiance_path.join("evalglare"));

    // Add arguments:
    // -V: Verbose output with detailed information about glare sources
    command.args(["-V", input_file.as_str()]);    // Execute command and capture output
    let output_result = command.output();
    if output_result.is_err() {
        return Err("pipeline: evalglare: failed to start command.".into());
    }
    let output = output_result.unwrap();

    // Print debug info about command execution status
    if DEBUG {
        println!(
            "\n'evalglare' command exit status: {:?}\n",
            output.status
        );
    }    // Create output file to save the evalglare results
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: evalglare: failed to create output file for 'evalglare' command.".into());
    }

    let mut file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err
    
    // Convert command output from bytes to string
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Return a Result object to indicate whether command was successful
    if output.status.success() || !stdout.is_empty() {
        // On success, write the stdout content to the output file
        file.write(stdout.as_bytes())
            .expect("pipeline: evalglare: failed to write output to file.");
        
        // Return the output file path
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'evalglare' failed.".into())
    }
}
