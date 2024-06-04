use crate::pipeline::DEBUG;
use std::process::Command;

use super::ConfigSettings;

// Nullifies the exposure value of an HDR image using ra_xyze.
// config_settings:
//    contains config settings - used for path to radiance and temp directory
// input_file:
//    the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//    a string for the path and filename where the HDR image with nullified
//    exposure value will be saved.
pub fn nullify_exposure_value(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
) -> Result<String, String> {
    if DEBUG {
        println!("nullify_exposure_value was called!");
    }

    // Create a new command for ra_xyze
    let mut command = Command::new(config_settings.radiance_path.join("ra_xyze"));

    // Add arguments to ra_xyze command
    command.args(["-r", "-o", input_file.as_str(), output_file.as_str()]);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!(
            "\nNullication of exposure value command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether ra_xyze command was successful
    if status.is_ok() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. ra_xyze command failed.".into())
    }
}
