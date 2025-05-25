
/**
 * @module projection_adjustment
 * @description This module provides functionality for adjusting the projection of fisheye lens 
 * HDR images. It uses Radiance's 'pcomb' tool with a calibration file to correct distortions 
 * in fisheye lens images. This correction is essential for accurate luminance measurements and 
 * proper visualization of HDRI data. The module applies mathematical transformations defined in 
 * the calibration file to map pixels from the distorted image to their correct positions.
 */

use crate::pipeline::DEBUG;
use std::{
    fs::File,
    process::{Command, Stdio},
};

use super::ConfigSettings;

/**
 * Applies projection adjustment for the fisheye lens to an HDR image using Radiance's pcomb utility.
 * This function corrects optical distortions in the fisheye image according to calibration parameters.
 * 
 * @param config_settings - Contains configuration settings including paths to Radiance tools and temp directory
 * @param input_file - The path to the input HDR image (must be in .hdr format)
 * @param output_file - The path and filename where the projection-adjusted HDR image will be saved
 * @param fisheye_correction_cal - Path to the fisheye correction calibration file that contains
 *                                mathematical functions to correct the specific lens distortion
 * 
 * @returns Result<String, String> - On success, returns the path to the output file.
 *                                  On failure, returns an error message.
 */
pub fn projection_adjustment(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    fisheye_correction_cal: String,
) -> Result<String, String> {
    if DEBUG {
        println!("projection_adjustment() was called with parameters:");
        println!("\tfisheye_correction_cal: {fisheye_correction_cal}");
    }

    // Create a new command for pcomb
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments to pcomb command
    command.args(["-f", fisheye_correction_cal.as_str(), input_file.as_str()]);

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: projection_adjustment: failed to create output file for 'pcomb' (projection adjustment) command.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: projection_adjustment: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!(
            "\nProjection adjustment command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'pcomb' (projection adjustment) failed.".into())
    }
}
