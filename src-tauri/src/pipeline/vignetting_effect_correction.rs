
/**
 * @module vignetting_effect_correction
 * @description This module provides functionality for correcting vignetting effects in HDR images.
 * Vignetting is a reduction in image brightness or saturation toward the periphery compared to the
 * image center, which is common in photographs taken with certain lenses. This correction is 
 * essential for accurate luminance measurements across the entire image field. The module uses 
 * Radiance's 'pcomb' tool with a calibration file that contains mathematical functions to compensate 
 * for the specific vignetting characteristics of the lens used.
 */

use crate::pipeline::DEBUG;
use std::{
    fs::File,
    process::{Command, Stdio},
};

use super::ConfigSettings;

/**
 * Corrects for the vignetting effect of an HDR image using Radiance's pcomb utility.
 * Vignetting causes darker corners/edges in images, which can significantly affect luminance
 * measurements. This function applies a calibrated correction to ensure even luminance response
 * across the entire image.
 * 
 * @param config_settings - Contains configuration settings including paths to Radiance tools and temp directory
 * @param input_file - The path to the input HDR image (must be in .hdr format)
 * @param output_file - The path and filename where the vignetting-corrected HDR image will be saved
 * @param vignetting_correction_cal - Path to the vignetting correction calibration file that contains
 *                                   mathematical functions to correct the specific lens vignetting pattern
 * 
 * @returns Result<String, String> - On success, returns the path to the output file.
 *                                  On failure, returns an error message.
 */
pub fn vignetting_effect_correction(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    vignetting_correction_cal: String,
) -> Result<String, String> {
    if DEBUG {
        println!("vignetting_effect_correction() was called with parameters:");
        println!("\tvignetting_correction_cal: {vignetting_correction_cal}");
    }

    // Create a new command for pcomb
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments to pcomb command
    command.args([
        "-f",
        vignetting_correction_cal.as_str(),
        input_file.as_str(),
    ]);

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: vignetting_effect_correction: failed to create output file for 'pcomb' (vignetting effect correction) command.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: vignetting_effect_correction: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!(
            "\nVignetting effect correction command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'pcomb' (vignetting effect correction) failed.".into())
    }
}
