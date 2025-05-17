use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;
use std::io::Write;

use super::ConfigSettings;

// Evalglare Command 
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the cropped HDR image will be saved.

pub fn evalglare(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
) -> Result<String, String> {
    if DEBUG {
        println!("evalglare() was called.");
    }

    // Command to run
    let mut command = Command::new(config_settings.radiance_path.join("evalglare"));

    // Add arguments
    command.args(["-V", input_file.as_str()]);

    let output_result = command.output();
    if output_result.is_err() {
        return Err("pipeline: evalglare: failed to start command.".into());
    }
    let output = output_result.unwrap();

    if DEBUG {
        println!(
            "\n'evalglare' command exit status: {:?}\n",
            output.status
        );
    }

    // Create output file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: evalglare: failed to create output file for 'evalglare' command.".into());
    }

    let mut file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Return a Result object to indicate whether command was successful
    if output.status.success() || !stdout.is_empty() {
        // On success, write to output file and return output path of HDR image
        file.write(stdout.as_bytes())
            .expect("pipeline: evalglare: failed to write output to file.");
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'evalglare' failed.".into())
    }
}
