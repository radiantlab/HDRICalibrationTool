use std::process::Command;

const DEBUG: bool = false;

// Path to radiance executables
const RADIANCE_PATH: &str = "/usr/local/radiance/bin/";

// Nullifies the exposure value of an HDR image using ra_xyze.
// input_image:
//    the path to the input HDR image. Input image must be in .hdr format.
// output_path:
//    a string for the path and filename where the HDR image with nullified exposure value will be saved.
#[tauri::command]
pub fn nullify_exposure_value(input_image: String, output_path: String) -> Result<String, String> {
    if DEBUG {
        println!("nullify_exposure_value was called!");
    }

    // Create a new command for ra_xyze
    let mut command = Command::new(RADIANCE_PATH.to_string() + "ra_xyze");

    // Add arguments to ra_xyze command
    command.args(["-r", "-o", input_image.as_str(), output_path.as_str()]);

    // Run the command
    let status = command.status().unwrap();

    if DEBUG {
        println!(
            "\nNullication of exposure value command exit status: {:?}\n",
            status
        );
    }

    // Return a Result object to indicate whether ra_xyze command was successful
    if status.success() {
        // On success, return output path of HDR image
        Ok(output_path.into())
    } else {
        // On error, return an error message
        Err("Error, non-zero exit status. ra_xyze command failed.".into())
    }
}
