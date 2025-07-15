/**
 * Module for reading binary tool paths from the application's configuration.
 *
 * This module provides functionality to retrieve the paths to external binary tools
 * (HDRGen and dcraw_emu) that are required for HDR image processing. These paths
 * are stored in a JSON file in the application's configuration directory.
 */
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Manager;

/**
 * Represents the paths to binary tools that are deserialized from JSON
 *
 * @field hdrgenpath - Path to the HDRGen binary
 * @field dcrawemupath - Path to the dcraw_emu binary
 */
#[derive(Serialize, Deserialize)]
struct Paths {
    radiancepath: String,
    hdrgenpath: String,
    dcrawemupath: String,
    outputpath: String,
}

/**
 * Tauri command to read binary paths from the configuration file
 *
 * This function retrieves the paths to the HDRGen and dcraw_emu binaries
 * from a JSON file in the application's configuration directory.
 *
 * @param app_handle - Tauri application handle for accessing app paths
 * @returns Result containing the serialized JSON string with paths or an error message
 */
#[tauri::command]
pub fn read_binary_paths(app_handle: tauri::AppHandle) -> Result<String, String> {
    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
    // Get the app's configuration directory
    let binding_result = app_handle.path().app_config_dir();
    let binding = match binding_result {
        Ok(v) => v,
        Err(_) => return Err("Error saving config".to_string()),
    };

    // Get suggested config directory for the app from Tauri
    let app_config_dir_result = binding.to_str();
    let app_config_dir = match app_config_dir_result {
        Some(v) => v,
        None => return Err("Error saving config".to_string()),
    };

    // Get full path to file where binaries are saved
    let paths_file = Path::new(app_config_dir).join("binary_paths.json");
    let file_path = match paths_file.to_str() {
        Some(v) => v,
        None => {
            return Err(format!(
                "Invalid UTF-8 in binary file path {:?}",
                paths_file
            ))
        }
    }; // Read binary paths from file
    match fs::read_to_string(file_path) {
        Ok(contents) => Ok(contents), // Return the file contents (JSON string)
        Err(_) => Ok("".to_string()), // Return empty string if file doesn't exist or can't be read
    }
}
