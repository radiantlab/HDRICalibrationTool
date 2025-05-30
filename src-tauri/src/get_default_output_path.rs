/**
 * Module for retrieving the default output path for the application.
 * 
 * This module provides a Tauri command to get the suggested directory
 * for storing application data files, such as generated HDR images.
 * The path is platform-specific and managed by the Tauri framework.
 */
use tauri::Manager;

/**
 * Tauri command to get the default path for storing application data
 * 
 * This function retrieves the platform-specific directory for storing
 * application data files. It's used as the default location for saving
 * generated HDR images and other output files.
 * 
 * @param app_handle - Tauri application handle for accessing app paths
 * @returns The default output path as a string, or an empty string if unavailable
 */
#[tauri::command]
pub async fn get_default_output_path(app_handle: tauri::AppHandle) -> String {
    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
    let binding_result = app_handle.path().app_data_dir();
    match binding_result {
        Ok(v) => v.to_string_lossy().to_string(), // Return path as string
        Err(_) => "".to_string(), // Return empty string if path can't be determined
    }
}
