
/**
 * @module photometric_adjustment
 * @description This module provides functionality for applying photometric adjustments to HDR images.
 * Photometric adjustment ensures the luminance values in the image accurately reflect the real-world
 * illuminance levels. This correction accounts for camera sensor response characteristics and
 * calibration against physical light measurements. The module uses Radiance's 'pcomb' tool with the
 * -h flag to preserve header information while applying mathematical transformations defined in a
 * calibration file.
 */

use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

/**
 * Applies photometric adjustments to an HDR image using Radiance's pcomb utility.
 * This function transforms pixel values in the HDR image to ensure accurate luminance representation
 * based on calibration data. The process is essential for scientific and architectural applications
 * that require precise luminance measurements.
 * 
 * @param config_settings - Contains configuration settings including paths to Radiance tools and temp directory
 * @param input_file - The path to the input HDR image (must be in .hdr format)
 * @param output_file - The path and filename where the photometrically adjusted HDR image will be saved
 * @param photometric_adjustment - Path to the photometric adjustment calibration file that contains
 *                                mathematical functions to transform pixel values to accurate luminance
 * 
 * @returns Result<String, String> - On success, returns the path to the output file.
 *                                  On failure, returns an error message.
 * 
 * @note The -h flag is used to preserve header information from the original file
 */

pub fn photometric_adjustment(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    photometric_adjustment: String,
) -> Result<String, String> {
    if DEBUG {
        println!("photometric_adjustment() was called with parameters:\n\t photometric_adjustment: {photometric_adjustment}");
    }

    // Command to run
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments
    command.args([
        "-h",
        "-f",
        photometric_adjustment.as_str(),
        input_file.as_str(),
    ]);

    // Set up piping of output to file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: photometric_adjustment: creating output file for 'pcomb' (photometric adjustment) failed.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: photometric_adjustment: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!(
            "\nPhotometric adjustment command exit status: {:?}\n",
            status
        );
    }

    println!("{}", format!("{:?}", command).replace("\"", ""));

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'pcomb' (photometric adjustment) failed.".into())
    }
}
