use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;

use super::ConfigSettings;

// Photometric Adjustments
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the cropped HDR image will be saved.
// photometric_adjustment:
//      A string for the photometric adjustment file

pub fn photometric_adjustment(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    photometric_adjustment: String,
) -> Result<String, String> {
    if DEBUG {
        println!("photometric_adjustment() was called with parameters:\n\t photometric_adjustment: {photometric_adjustment}");
    }

    // Command to run
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments
    command.args([
        "-h",
        "-f",
        photometric_adjustment.as_str(),
        input_file.as_str(),
    ]);

    // Set up piping of output to file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("Error, creating output file for photometric adjustment command failed.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!(
            "\nPhotometric adjustment command exit status: {:?}\n",
            status
        );
    }

    println!("{}", format!("{:?}", command).replace("\"", ""));

    // Return a Result object to indicate whether command was successful
    if status.is_ok() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. Photometric adjustment command (pcomb) failed.".into())
    }
}
