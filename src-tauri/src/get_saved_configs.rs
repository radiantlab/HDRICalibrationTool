use std::{
    fs::{self, read_to_string},
    io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{from_str, to_string};

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
}

#[derive(Serialize)]
struct SavedConfigs {
    configurations: Vec<Config>,
}

// Retrieves saved configurations by looking for directories in "{app_config_dir}/configurations/".
#[tauri::command]
pub async fn get_saved_configs(app_handle: tauri::AppHandle) -> Result<String, String> {
    let mut saved_configs = SavedConfigs {
        configurations: vec![],
    };

    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
    let binding_result = app_handle.path_resolver().app_config_dir();
    let binding = match binding_result {
        Some(v) => v,
        None => return Err("Error getting saved configs".to_string()),
    };

    // Get suggested config directory for the app from Tauri
    let app_config_dir_result = binding.to_str();
    let app_config_dir = match app_config_dir_result {
        Some(v) => v,
        None => return Err("Error getting saved configs".to_string()),
    };

    let dir = Path::new(app_config_dir).join("configurations");

    // If the configurations directory doesn't exist, return JSON with empty config list
    if !dir.exists() {
        return match to_string(&saved_configs) {
            Ok(v) => Ok(v.to_string()),
            Err(_) => {
                return Err("Error getting saved configs: Could not convert to JSON.".to_string())
            }
        };
    }

    // Get everything in the configurations dir
    let dir_contents = match fs::read_dir(dir) {
        Ok(v) => match v
            .map(|res| res.map(|e| e.path()))
            .collect::<Result<Vec<_>, io::Error>>()
        {
            Ok(entry) => entry,
            Err(_) => return Err("Error getting saved configs".to_string()),
        },
        Err(_) => return Err("Error getting saved configs".to_string()),
    };

    // Look through all subdirectories in {app_config_dir}/configurations/ and add to vector of saved configs if
    // it contains a valid configuration
    for entry in dir_contents {
        match process_configuration(entry) {
            Some(config) => saved_configs.configurations.push(config),
            None => (), // Error occured reading directory (may not be valid configuration), skip it
        };
    }

    // Convert saved configurations to JSON
    let saved_configs_json = match to_string(&saved_configs) {
        Ok(v) => v,
        Err(_) => return Err("Error getting saved configs: Could not convert to JSON.".to_string()),
    };

    return Ok(saved_configs_json.to_string());
}

// Processes a directory to determine if it contains a valid configuration.
// Returns Some(Config) if valid, otherwise None.
fn process_configuration(dir: PathBuf) -> Option<Config> {
    // Try to read the configuration.json file. Not a valid configuration dir if fails
    let config_info = match read_to_string(dir.join("configuration.json")) {
        Ok(v) => v,
        Err(_) => return None,
    };

    // Try to parse the JSON string into a config obj, not a valid configuration if it fails
    let mut config_obj: Config = match from_str(&config_info) {
        Ok(v) => v,
        Err(_) => return None,
    };

    // If config includes response function, check there's a file existing with a matching name
    if config_obj.response_paths != "" {
        config_obj.response_paths = dir
            .join(config_obj.response_paths)
            .to_string_lossy()
            .to_string();
        if !Path::new(&config_obj.response_paths).exists() {
            return None;
        }
    }

    // If config includes fisheye correction calibration file, check there's a file existing with a matching name
    if config_obj.fe_correction_paths != "" {
        config_obj.fe_correction_paths = dir
            .join(config_obj.fe_correction_paths)
            .to_string_lossy()
            .to_string();
        if !Path::new(&config_obj.fe_correction_paths).exists() {
            return None;
        }
    }

    // If config includes vignetting effect correction calibration file, check there's a file existing with a matching name
    if config_obj.v_correction_paths != "" {
        config_obj.v_correction_paths = dir
            .join(config_obj.v_correction_paths)
            .to_string_lossy()
            .to_string();
        if !Path::new(&config_obj.v_correction_paths).exists() {
            return None;
        }
    }

    // If config includes neutral density correction calibration file, check there's a file existing with a matching name
    if config_obj.nd_correction_paths != "" {
        config_obj.nd_correction_paths = dir
            .join(config_obj.nd_correction_paths)
            .to_string_lossy()
            .to_string();
        if !Path::new(&config_obj.nd_correction_paths).exists() {
            return None;
        }
    }

    // If config includes calibration factor calibration file, check there's a file existing with a matching name
    if config_obj.cf_correction_paths != "" {
        config_obj.cf_correction_paths = dir
            .join(config_obj.cf_correction_paths)
            .to_string_lossy()
            .to_string();
        if !Path::new(&config_obj.cf_correction_paths).exists() {
            return None;
        }
    }

    // Configuration is valid, return the parsed Config object
    return Some(config_obj);
}
