use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

// Crops a fisheye view HDR image to a square which circumscribes the circular fisheye view.
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the cropped HDR image will be saved.
// diameter:
//      the fisheye view diameter in pixels
// xleft:
//      The x-coordinate of the bottom left corner of the circumscribed square
//      of the fisheye view (in pixels)
// ydown:
//      The y-coordinate of the bottom left corner of the circumscribed square
//      of the fisheye view (in pixels)
pub fn crop(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    diameter: String,
    xleft: String,
    ydown: String,
) -> Result<String, String> {
    if DEBUG {
        println!("crop() was called with parameters:");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");
    }

    // Create a new command for pcompos
    let mut command = Command::new(config_settings.radiance_path.join("pcompos"));

    // Add arguments to pcompos command
    command.args([
        "-x",
        diameter.as_str(),
        "-y",
        diameter.as_str(),
        input_file.as_str(),
        format!("-{xleft}").as_str(),
        format!("-{ydown}").as_str(),
    ]);

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);

    // If error creating output file abort pipeline
    if file_result.is_err() {
        return Err("Error, creating output file for crop command failed.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err
    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!("\nCrop command exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether command was successful
    if status.is_ok() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. Crop command (pcompos) failed.".into())
    }
}
