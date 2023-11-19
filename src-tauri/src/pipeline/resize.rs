use crate::pipeline::DEBUG;
// use std::fs::File;
use std::process::Command;
// use std::process::Stdio;

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
        println!("resize was called! With parameters");
        println!("\txdim: {xdim}");
        println!("\tydim: {ydim}");
    }

    return Err("Resize hasn't been implemented yet!".into());
}
