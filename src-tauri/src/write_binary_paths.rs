/**
 * Module for writing binary tool paths to the application's configuration.
 * 
 * This module provides functionality to save the paths to external binary tools
 * (HDRGen and dcraw_emu) that are required for HDR image processing. These paths
 * are stored in a JSON file in the application's configuration directory.
 */
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Manager;

/**
 * Represents the paths to binary tools that are serialized to JSON
 * 
 * @field hdrgenpath - Path to the HDRGen binary
 * @field dcrawemupath - Path to the dcraw_emu binary
 */
#[derive(Serialize, Deserialize)]
struct Paths {
    hdrgenpath: String,
    dcrawemupath: String,
}

/**
 * Tauri command to write binary paths to a configuration file
 * 
 * This function saves the provided paths to the HDRGen and dcraw_emu binaries
 * to a JSON file in the application's configuration directory. This allows the
 * application to remember these paths between sessions.
 * 
 * @param app_handle - Tauri application handle for accessing app paths
 * @param hdrgen_path - Path to the HDRGen binary
 * @param dcraw_emu_path - Path to the dcraw_emu binary
 * @returns Result indicating success or an error message
 */
#[tauri::command]
pub fn write_binary_paths(
    app_handle: tauri::AppHandle,
    hdrgen_path: String,
    dcraw_emu_path: String,
) -> Result<(), String> {
    // Create a new Paths struct with the provided binary paths
    let new_paths = Paths {
        hdrgenpath: hdrgen_path,
        dcrawemupath: dcraw_emu_path,
    };
    
    // Serialize the paths to JSON
    let paths_string = match serde_json::to_string(&new_paths) {
        Ok(v) => v,
        Err(error) => return Err(format!("Error serializing JSON: {:?}", error)),
    };

    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
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

    // Get full path to file where binaries are being saved
    let paths_file = Path::new(app_config_dir).join("binary_paths.json");
    let file_path = match paths_file.to_str() {
        Some(v) => v,
        None => return Err(format!("Invalid UTF-8 in binary file path {:?}", paths_file)),
    };    // Write binary paths to file
    match fs::write(file_path, paths_string) {
        Ok(()) => Ok(()), // Return success
        Err(error) => Err(format!("Error writing to file: {:?}", error)), // Return error message
    }
}
