/**
 * Module for reading directory contents from the host filesystem.
 *
 * This module provides a Tauri command to list all files and directories
 * within a specified directory path. It's used by the application to browse
 * directories and locate image files.
 */
use std::fs;

/**
 * Tauri command to list all entries in a directory
 *
 * This function reads the contents of a directory at the specified path
 * and returns a list of full paths to all files and subdirectories.
 *
 * @param path - Path of the directory to read
 * @returns Result containing a vector of file/directory paths as strings, or an error message
 */
#[tauri::command]
pub fn read_dynamic_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(path)
        .map_err(|e| e.to_string())? // Convert IO error to string error
        .filter_map(|entry| {
            // For each directory entry that can be read successfully,
            // convert its path to a string
            entry.ok().map(|e| e.path().display().to_string())
        })
        .collect(); // Collect all path strings into a Vec<String>

    Ok(entries) // Return the list of paths
}
