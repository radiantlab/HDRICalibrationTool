/**
 * Module for retrieving the default output path for the application.
 * 
 * This module provides a Tauri command to get the suggested directory
 * for storing application data files, such as generated HDR images.
 * The path is platform-specific and is the documents folder.
 */
use tauri::Manager;
use directories_next::UserDirs;
use std::fs;
use std::path::PathBuf;
use std::io;

/**
 * Tauri command to get the default path for storing application data
 * 
 * This function retrieves the platform-specific documents directory for storing
 * application data files. It's used as the default location for saving
 * generated HDR images and other output files.
 * 
 * @returns The default output path as a string, or an empty string if unavailable
 */
#[tauri::command]
pub async fn get_default_output_path() -> Result<String, String> {
    if let Some(user_dirs) = UserDirs::new() {
        if let Some(documents_dir) = user_dirs.document_dir() {
            let target_dir = documents_dir.join("HDRICalibrationInterface");
            if !target_dir.exists() { // if the directory doesn't exist, create it
                if let Err(error) = fs::create_dir_all(&target_dir) {
                    return Err(format!("get_default_output_path: create_dir_all: {}", error));
                }
                fs::create_dir_all(&target_dir);
            }
            return Ok(target_dir.to_string_lossy().to_string()); // return the path as a string
        }
        return Err("get_default_output_path: could not find 'documents' directory".to_string()); // documents_dir is None
    }
    return Err("get_default_output_path: could not find 'user' directory".to_string()); // user_dirs is None
}