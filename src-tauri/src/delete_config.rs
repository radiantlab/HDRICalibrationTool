use std::{
    fs::{self, read_to_string},
    io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{from_str};

use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct Config {
    name: String,
    response_paths: String,
    fe_correction_paths: String,
    v_correction_paths: String,
    nd_correction_paths: String,
    cf_correction_paths: String,
    diameter: String,
    xleft: String,
    ydown: String,
    target_res: String,
    vh: String,
    vv: String,
    scale_limit: String,
    scale_label: String,
    scale_levels: String,
    legend_dimensions: String,
}

// Retrieves saved configurations by looking for directories in "{app_config_dir}/configurations/".
#[tauri::command]
pub async fn delete_config(app_handle: tauri::AppHandle, config_name: String) -> Result<(), String> {
    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
    let binding_result = app_handle.path().app_config_dir();
    let binding = match binding_result {
        Ok(v) => v,
        Err(_) => return Err("Error getting saved configs".to_string()),
    };

    // Get suggested config directory for the app from Tauri
    let app_config_dir_result = binding.to_str();
    let app_config_dir = match app_config_dir_result {
        Some(v) => v,
        None => return Err("Error deleting saved config".to_string()),
    };

    let dir = Path::new(app_config_dir).join("configurations");

    // If the configurations directory doesn't exist, return JSON with empty config list
    if !dir.exists() {
        return Err("Error deleting saved config: no configurations".to_string());
    }

    // Get everything in the configurations dir
    let dir_contents = match fs::read_dir(dir) {
        Ok(v) => match v
            .map(|res| res.map(|e| e.path()))
            .collect::<Result<Vec<_>, io::Error>>()
        {
            Ok(entry) => entry,
            Err(_) => return Err("Error deleting saved config".to_string()),
        },
        Err(_) => return Err("Error deleting saved config".to_string()),
    };

    // Look through all subdirectories in {app_config_dir}/configurations/ and delete config which matches given name
    for entry in dir_contents {
        let config_path = entry.join("configuration.json");
        if check_configuration(entry, &config_name) {
            fs::remove_file(config_path)
                .map_err(|error| format!("Error removing file {:?}", error))?;
        }
    }
    Ok(())
}

// Processes a directory to determine if it contains a valid configuration.
// Returns Some(Config) if valid, otherwise None.
fn check_configuration(dir: PathBuf, config_name: &String) -> bool {
    // Try to read the configuration.json file. Not a valid configuration dir if fails
    let config_info = match read_to_string(dir.join("configuration.json")) {
        Ok(v) => v,
        Err(_) => return false,
    };

    // Try to parse the JSON string into a config obj, not a valid configuration if it fails
    let config_obj: Config = match from_str(&config_info) {
        Ok(v) => v,
        Err(_) => return false,
    };

    if config_obj.name == *config_name {
        return true;
    }
    return false;
}
