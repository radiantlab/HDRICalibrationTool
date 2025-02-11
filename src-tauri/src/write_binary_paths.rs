use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Paths {
    hdrgenpath: String,
    dcrawemupath: String
}

#[tauri::command]
pub fn write_binary_paths(app_handle: tauri::AppHandle, hdrgenPath: String, dcrawEmuPath: String) -> Result<(), String> {
    let new_paths = Paths { hdrgenpath: hdrgenPath, dcrawemupath: dcrawEmuPath};
    let paths_string = match serde_json::to_string(&new_paths) {
        Ok(v) => v,
        Err(error) => return Err(format!("Error serializing JSON: {:?}", error)),
    };

    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
    let binding_result = app_handle.path_resolver().app_config_dir();
    let binding = match binding_result {
        Some(v) => v,
        None => return Err("Error saving config".to_string()),
    };

    // Get suggested config directory for the app from Tauri
    let app_config_dir_result = binding.to_str();
    let app_config_dir = match app_config_dir_result {
        Some(v) => v,
        None => return Err("Error saving config".to_string()),
    };

    // Get full path to file where binaries are being saved
    let paths_file = Path::new(app_config_dir)
        .join("binary_paths.json");
    let file_path = match paths_file.to_str() {
        Some(v) => v,
        None => return Err(format!("Invalid UTF-8 in binary file path {:?}", paths_file)),
    };
    
    // Write binary paths to file
    match fs::write(file_path, paths_string) {
        Ok(()) => Ok(()),
        Err(error) => Err(format!("Error writing to file: {:?}", error)),
    }
}