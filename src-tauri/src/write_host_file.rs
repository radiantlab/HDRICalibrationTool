/**
 * Module for writing files to the host filesystem.
 *
 * This module provides a Tauri command to write text content to a file at a specified path.
 * It is used for saving configuration files, response curves, and other text files needed
 * by the application.
 */
use std::fs;

/**
 * Tauri command to write text content to a file
 *
 * This function writes the provided text to a file at the specified path.
 * It is a general-purpose file writing function used by the frontend.
 *
 * @param file_path - Path where the file should be written
 * @param text - Text content to write to the file
 * @returns Result indicating success or an error message
 */
#[tauri::command]
pub fn write_host_file(file_path: String, text: String) -> Result<(), String> {
    match fs::write(file_path, text) {
        Ok(()) => Ok(()),                                                 // Return success
        Err(error) => Err(format!("Error writing to file: {:?}", error)), // Return error message
    }
}
