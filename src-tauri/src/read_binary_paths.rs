use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct Paths {
    hdrgenpath: String,
    dcrawemupath: String,
}

#[tauri::command]
pub fn read_binary_paths(app_handle: tauri::AppHandle) -> Result<String, String> {
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
    };

    // Read binary paths
    match fs::read_to_string(file_path) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok("".to_string()),
    }
}
