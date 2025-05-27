use crate::pipeline::DEBUG;
use std::{
    fs::File,
    process::{Command, Stdio},
};

use super::ConfigSettings;
use super::UserCommands;

// Corrects for the vignetting effect of an HDR image using pcomb.
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format.
// output_file:
//      a string for the path and filename where the HDR image with nullified
//      exposure value will be saved.
// vignetting_correction_cal:
//      a string for the vignetting correction calibration file
pub fn vignetting_effect_correction(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    vignetting_correction_cal: String,
    commands: &UserCommands,
) -> Result<String, String> {
    if DEBUG {
        println!("vignetting_effect_correction() was called with parameters:");
        println!("\tvignetting_correction_cal: {vignetting_correction_cal}");
    }

    // Create a new command for pcomb
    let mut command = Command::new(config_settings.radiance_path.join("pcomb"));

    // Add arguments to pcomb command
    let mut pcomb_arguments: Vec<&str> = vec![
        "-f",
        vignetting_correction_cal.as_str(),
    ];
    command.args(&pcomb_arguments);

    // Use custom command options if given
    if commands.pcomb_vignetting_corr != "" {
        pcomb_arguments = commands.pcomb_vignetting_corr.split_whitespace().collect();
        command.args(&pcomb_arguments);
    }
    command.arg(input_file.as_str());

    // Direct command's output to specifed output file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err(
            "Error, creating output file for vignetting effect correction command failed.".into(),
        );
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the command
    let status = command.status();

    if DEBUG {
        println!(
            "\nVignetting effect correction command exit status: {:?}\n",
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
            "Error, non-zero exit status. Vignetting effect correction command (pcomb) failed."
                .into(),
        )
    }
}
