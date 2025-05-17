use crate::pipeline::DEBUG;
use std::fs::File;
use std::process::Command;
use std::process::Stdio;
use std::env;

use super::ConfigSettings;
use super::LuminanceArgs;

// Falsecolor Luminance Map Creation
// config_settings:
//      contains config settings - used for path to radiance and temp directory
// input_file:
//      the path to the input HDR image. Input image must be in .hdr format
// output_file:
//      a string for the path and filename where the luminance map HDR image will be saved
// luminance_args:
//      contains the arguments for the 'falsecolor' command

pub fn falsecolor(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    luminance_args: &LuminanceArgs,
) -> Result<String, String> {
    if DEBUG {
        println!(
            "falsecolor() was called with parameters:\n\t {},\n\t {},\n\t {},\n\t {}\n",
            luminance_args.scale_limit,
            luminance_args.scale_label,
            luminance_args.scale_levels,
            luminance_args.legend_dimensions,
        );
    }

    // Command to run
    let mut command = Command::new(config_settings.radiance_path.join("falsecolor"));
    
    // Provide path to radiance binaries by modifying system path (PATH env variable) for child process
    // 'falsecolor' uses 'pcomb', so it needs to know where to find it
    let env_var = env::var("PATH");
    if env_var.is_err() {
        return Err("pipeline: falsecolor: could not find PATH environment variable.".into());
    }
    // Windows separates directory entries in system path with ';', Linux and MacOS use ':'
    command.env("PATH", 
        format!("{}{}{}", 
        config_settings.radiance_path.to_string_lossy(), 
        path_separator(), 
        env_var.unwrap()));

    // Add arguments
    command.args([
        "-s", 
        &luminance_args.scale_limit, 
        "-l", 
        &luminance_args.scale_label,
        "-n",
        &luminance_args.scale_levels, 
        "-e -lw/-lh", 
        &luminance_args.legend_dimensions, 
        "-i", 
        input_file.as_str(),
        ]);

    // Set up piping of output to file
    let file_result = File::create(&output_file);
    if file_result.is_err() {
        return Err("pipeline: falsecolor: creating output file for falsecolor command failed.".into());
    }

    let file = file_result.unwrap(); // Can safely unwrap result w/o panicking after checking for Err

    let stdio = Stdio::from(file);
    command.stdout(stdio);

    // Run the commnand
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: falsecolor: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!(
            "\nFalsecolor command exit status: {:?}\n",
            status
        );
    }

    // Return a result object to indicate whether command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_file.into())
    } else {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'falsecolor' failed.".into())
    }
}

// Returns the proper separator for system path environment variable based on OS
fn path_separator() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}