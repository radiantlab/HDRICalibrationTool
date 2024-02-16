use crate::pipeline::DEBUG;
use std::process::Command;
use std::process::Stdio;
use std::fs::File;

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
        println!("neutral_density() was called with parameters:\n\t neutral_density: {neutral_density}");
    }

    // Command to run
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments
    command.args([
        "-f",
        neutral_density.as_str(),
        input_file.as_str(),
    ]);

    // Set up piping of output to file
    let file = File::create(&output_file).unwrap();
    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!(
            "\nNeutral Density Filter command exit status: {:?}\n",
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
            "Error, non-zero exit status. Neutral density filter command (pcomb) failed."
                .into(),
        )
    }
}