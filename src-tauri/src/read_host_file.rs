/**
 * Module for reading files from the host filesystem.
 *
 * This module provides a Tauri command to read text content from a file at a specified path.
 * It is used for loading configuration files, response curves, and other text files needed
 * by the application.
 */
use std::fs;

/**
 * Tauri command to read text content from a file
 *
 * This function reads text content from a file at the specified path.
 * It returns an empty string if the file doesn't exist or can't be read,
 * rather than returning an error.
 *
 * @param file_path - Path of the file to read
 * @returns Result containing the file contents as a string or an empty string if the file can't be read
 */
#[tauri::command]
pub fn read_host_file(file_path: String) -> Result<String, String> {
    match fs::read_to_string(file_path) {
        Ok(contents) => Ok(contents), // Return the file contents
        Err(_) => Ok("".to_string()), // Return empty string if file doesn't exist or can't be read
    }
}
