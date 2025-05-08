use crate::pipeline::DEBUG;
use std::{
    fs::File,
    process::{Command, Stdio},
};

use super::ConfigSettings;

// Applies projection adjustment for the fisheye lens to an HDR image using pcomb.
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the HDR image with nullified
//      exposure value will be saved.
// fisheye_correction_cal:
//      a string for the fisheye correction calibration file
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
