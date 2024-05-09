use std::{
    fs::{copy, create_dir_all, write},
    path::Path,
};

use serde::Serialize;
use serde_json::to_string;

#[derive(Serialize)]
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

#[tauri::command]
pub async fn save_config(
    app_handle: tauri::AppHandle,
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
) -> Result<String, String> {
    let mut config = Config {
        name,
        response_paths,
        fe_correction_paths,
        v_correction_paths,
        nd_correction_paths,
        cf_correction_paths,
        diameter,
        xleft,
        ydown,
        target_res,
        vh,
        vv,
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

    println!("\n\n\n\nAPP CONFIG DIR: {app_config_dir}\n\n\n\n");

    let dir = Path::new(app_config_dir)
        .join("configurations")
        .join(&config.name);
    if create_dir_all(&dir).is_err() {
        return Err("Error saving config.".to_string());
    }

    let mut is_error = false;
    if config.response_paths != "" {
        is_error =
            is_error || copy(&config.response_paths, &dir.join("responseFunction.rsp")).is_err();
        config.response_paths = "responseFunction.rsp".to_string();
    };

    if config.fe_correction_paths != "" {
        is_error =
            is_error || copy(&config.fe_correction_paths, &dir.join("fe_correction.cal")).is_err();
        config.fe_correction_paths = "fe_correction.cal".to_string();
    };

    if config.v_correction_paths != "" {
        is_error =
            is_error || copy(&config.v_correction_paths, &dir.join("v_correction.cal")).is_err();
        config.v_correction_paths = "v_correction.cal".to_string();
    };

    if config.nd_correction_paths != "" {
        is_error =
            is_error || copy(&config.nd_correction_paths, &dir.join("nd_correction.cal")).is_err();
        config.nd_correction_paths = "nd_correction.cal".to_string();
    };

    if config.cf_correction_paths != "" {
        is_error =
            is_error || copy(&config.cf_correction_paths, &dir.join("cf_correction.cal")).is_err();
        config.cf_correction_paths = "cf_correction.cal".to_string();
    };

    let json = match to_string(&config) {
        Ok(v) => v,
        Err(_) => return Err("Error saving config: Could not convert to JSON.".to_string()),
    };

    is_error = is_error || write(&dir.join("configuration.json"), json).is_err();

    if is_error {
        return Err("Error saving config.".to_string());
    }

    Ok(format!(
        "Successfully saved configuration to {app_config_dir}"
    ))
}
