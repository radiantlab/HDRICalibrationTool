use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;
use super::UserCommands;

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
    commands: &UserCommands,
) -> Result<String, String> {
    if DEBUG {
        println!("resize() was called with parameters:");
        println!("\txdim: {xdim}");
        println!("\tydim: {ydim}");
    }

    // Create a new command for pfilt
    let mut command = Command::new(config_settings.radiance_path.join("pfilt"));

    // Add arguments to pfilt command
    let mut pfilt_arguments: Vec<&str> = vec![
        "-1",
        "-x",
        xdim.as_str(),
        "-y",
        ydim.as_str(),
    ];
    command.args(&pfilt_arguments);

    // Use custom command options if given
    if commands.pfilt != "" {
        pfilt_arguments = commands.pfilt.split_whitespace().collect();
        command.args(&pfilt_arguments);
    }
    command.arg(input_file.as_str());

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("Error, creating output file for resizing command failed.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

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
