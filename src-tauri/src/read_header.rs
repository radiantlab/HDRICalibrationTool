use std::path::Path;
/**
 * Module for reading header contents from an HDR file.
 *
 * This module provides Tauri commands to read the contents of the header
 * in a specified HDR file. It's used by the application to display the evalglare
 * value in the image viewer.
 */
use std::process::Command;

/**
 * Tauri command to read a specific key from the header of an HDR file
 *
 * This function retrieves the value in the header of the given HDR file
 * associated with the given key.
 *
 * @param file_path - The path to the HDR file
 * @param radiance_path_string - The path to Radiance binaries
 * @param key - The key to look for in the header; of the form "KEY="
 * @returns Result containing the value
 */
#[tauri::command]
pub fn read_header_value(
    file_path: String,
    radiance_path_string: String,
    key: String,
) -> Result<String, String> {
    // Convert radiance_path string to path so .join() can be used
    let radiance_path = Path::new(&radiance_path_string);

    // Create command to run evalglare from the Radiance path
    let mut command = Command::new(radiance_path.join("getinfo"));

    // Add input file as argument
    command.arg(file_path);

    // Run command and error if it failed
    let output_result = command.output();
    if output_result.is_err() {
        return Err("read_header_value: failed to start command.".into());
    }
    let output = output_result.unwrap();

    // Check if command succeeded
    if !output.status.success() {
        return Err("read_header_value: 'evalglare' command failed.".into());
    }

    // If command succeeded, extract and return the header value associated with the given key
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim_start(); // Remove leading '\t'
        if let Some(value) = trimmed.strip_prefix(&key) {
            return Ok(value.trim().to_string());
        }
    }
    Err("read_header_value: failed to extract value from key.".into())
}

/**
 * Tauri command to read the entirety of the header from an HDR file
 *
 * This function retrieves the header of the given HDR file
 *
 * @param file_path - The path to the HDR file
 * @param radiance_path_string - The path to Radiance binaries
 * @returns Result containing the header
 */
#[tauri::command]
pub fn read_header(file_path: String, radiance_path_string: String) -> Result<String, String> {
    // Convert radiance_path string to path so .join() can be used
    let radiance_path = Path::new(&radiance_path_string);

    // Create command to run evalglare from the Radiance path
    let mut command = Command::new(radiance_path.join("getinfo"));

    // Add input file as argument
    command.arg(file_path);

    // Run command and error if it failed
    let output_result = command.output();
    if output_result.is_err() {
        return Err("read_header: failed to start command.".into());
    }
    let output = output_result.unwrap();

    // If command succeeded, return entire header
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.to_string())
    } else {
        Err("read_header: failed to retrieve file header.".into())
    }
}
