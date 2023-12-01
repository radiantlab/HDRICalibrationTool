use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

// Resizes an HDR image to the target x and y resolution.
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the cropped HDR image will be saved.
// xdim:
//      The x-dimensional resolution to resize the HDR image to (in pixels)
// ydim:
//      The y-dimensional resolution to resize the HDR image to (in pixels)
pub fn resize(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    xdim: String,
    ydim: String,
) -> Result<String, String> {
    if DEBUG {
        println!("resize() was called with parameters:");
        println!("\txdim: {xdim}");
        println!("\tydim: {ydim}");
    }

    // Create a new command for pfilt
    let mut command = Command::new(config_settings.radiance_path.to_string() + "pfilt");

    // Add arguments to pfilt command
    command.args([
        "-1",
        "-x",
        format!("-{xdim}").as_str(),
        "-y",
        format!("-{ydim}").as_str(),
        input_file.as_str(),
    ]);

    // Direct command's output to specifed output file
    let file = File::create(&output_file).unwrap();
    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!("\nResize command exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether command was successful
    if status.is_ok() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. Resize command (pfilt) failed.".into())
    }
}
