use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;
// use regex::Regex;

use super::ConfigSettings;

// Header Editing
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the cropped HDR image will be saved.
// vertical_angle:
//      The fov, in degrees, of the image vertically. Found within the camera settings.
// horizontal_angle:
//      The fov, in degrees, of the image horizontally. Found within the camera settings.

pub fn header_editing(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    vertical_angle: String,
    horizontal_angle: String,
) -> Result<String, String> {
    if DEBUG {
        println!("header_editing() was called with parameters:\n\tvertical_angle: {vertical_angle}\n\thorizontal_angle: {horizontal_angle}");
    }

    // Apply the new header
    let mut command = Command::new(config_settings.radiance_path.join("getinfo"));

    // Add arguments
    command.args([
        "-a",
        format!("VIEW= -vta -vv {} -vh {}", vertical_angle, horizontal_angle).as_str(),
    ]);

    // Set up piping of the input and output file
    let file_output_result = File::create(&output_file);
    if file_output_result.is_err() {
        return Err("pipeline: header_editing: failed to create output file for 'getinfo' command.".into());
    }

    let file = file_output_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let file_input_result = File::open(&input_file);
    if file_input_result.is_err() {
        return Err("pipeline: header_editing: failed to create input file for 'getinfo' command.".into());
    }

    let file_input = file_input_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio_out = Stdio::from(file);
    let stdio_in = Stdio::from(file_input);
    command.stdout(stdio_out);
    command.stdin(stdio_in);

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: header_editing: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!("\n'getinfo' command exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'getinfo'".into())
    }
}
