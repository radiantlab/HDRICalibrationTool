use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

// Neutral Density Filter
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the cropped HDR image will be saved.
// neutral_density:
//      A string for the neutral density file

pub fn neutral_density(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    neutral_density: String,
) -> Result<String, String> {
    if DEBUG {
        println!(
            "neutral_density() was called with parameters:\n\t neutral_density: {neutral_density}"
        );
    }

    // Command to run
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments
    command.args(["-f", neutral_density.as_str(), input_file.as_str()]);

    // Set up piping of output to file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: neutral_density: creating output file for 'pcomb' (neutral density filter) command failed.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: neutral_density: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!(
            "\nNeutral Density Filter command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'pcomb' (neutral density filter) failed.".into())
    }
}
