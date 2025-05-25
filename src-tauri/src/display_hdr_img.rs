/**
 * Module for displaying HDR images using Radiance's ximage tool.
 * 
 * This module provides a Tauri command to open and display HDR images using
 * the ximage utility from the Radiance suite. This functionality is not
 * available on Windows platforms.
 */
use crate::pipeline::DEBUG;
use std::{
    path::Path,
    process::{Command, ExitStatus},
};

/**
 * Tauri command to display an HDR image using Radiance's ximage tool
 * 
 * This function launches the ximage utility from the Radiance suite to display an HDR image.
 * The ximage tool is specifically designed to display high dynamic range images properly.
 * 
 * @param radiance_path - Path to the Radiance binaries directory
 * @param image_path - Path to the HDR image file to display
 * @returns Result indicating success or an error message
 */
#[tauri::command]
pub fn display_hdr_img(
    radiance_path: String,
    image_path: String
) -> Result<String, String> {
    // Create command to run ximage from the Radiance path
    let mut cmd = Command::new(Path::new(&radiance_path).join("ximage"));
    
    // Set arguments for ximage:
    // -g 2.2: set gamma to 2.2
    // -e auto: automatic exposure adjustment
    // last argument: path to image file
    let args = ["-g", "2.2", "-e", "auto", &format!("{}", image_path)];
    cmd.args(args);

    // Execute command and check result
    let stat_res = cmd.status();
    if !stat_res.is_ok() || !stat_res.unwrap_or(ExitStatus::default()).success() {
        return Err("Error, non-zero exit status. ximage command (display hdr image) failed.".to_string());
    }
    
    // Print debug message if in debug mode
    if DEBUG {
        println!("Display HDR Image: Success\n");
    }

    return Ok("Display HDR Image Success".to_string());
}