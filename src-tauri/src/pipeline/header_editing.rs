use crate::pipeline::DEBUG;
use std::process::Command;
use std::process::Stdio;
use std::fs::File;
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

    /*
    TODO: Looking into using regex instead of sed, so this can run on Windows without a problem.
    // Get the header info
    let mut command_header_get = Command::new(config_settings.radiance_path.to_string() + "getinfo");

    // Add arguments
    command_header_get.args([
        input_file,
    ]);

    // Run the command
    command_header_get.status.unwrap();

    // And remove the line containing the VIEW angles
    let re = Regex::new(r".*VIEW=.*");
    let freshFile = re.replace_all(String::from_utf8_lossy(&command.stdout));

    // Modify the input file to show these changes
    let fileClearedInput = File::create(&input_file).unwrap();
    fileClearedInput.write_all(freshFile);
    */

    // Apply the new header
    let mut command = Command::new(config_settings.radiance_path.to_string() + "getinfo");

    // Add arguments
    command.args([
        "-a",
        format!("\"VIEW= -vta -vv {} -vh {}\"", vertical_angle, horizontal_angle).as_str(),
    ]);

    // Set up piping of the input and output file
    let file = File::create(&output_file).unwrap();
    let fileinput = File::create(&input_file).unwrap();
    let stdio_out = Stdio::from(file);
    let stdio_in = Stdio::from(fileinput);
    command.stdout(stdio_out);
    command.stdin(stdio_in);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!(
            "\nHeader editing command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether command was successful
    if status.is_ok() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err(
            "Error, non-zero exit status. Header editing command (getinfo) failed."
                .into(),
        )
    }
}