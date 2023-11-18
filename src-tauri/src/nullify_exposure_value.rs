use std::process::Command;

const DEBUG: bool = false;

// Path to radiance
const RADIANCE_PATH: &str = "/usr/local/radiance/bin/";

// input_image:
//    the paths to the input HDR image. Input image must be in .hdr format.
// output_path:
//    a string for the path and filename where the HDR image with nullified exposure value will be saved.
#[tauri::command]
pub fn nullify_exposure_value(input_image: String, output_path: String) -> Result<String, String> {
    println!("Nullify exposure value was called!!");

    return Err("Nullify exposure value not implemented yet.".into());
}
