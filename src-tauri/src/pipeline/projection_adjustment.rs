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
    let file = File::create(&output_file).unwrap();
    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!(
            "\nProjection adjustment command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether command was successful
    if status.is_ok() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. Projection adjustment command (pcomb) failed.".into())
    }
}
