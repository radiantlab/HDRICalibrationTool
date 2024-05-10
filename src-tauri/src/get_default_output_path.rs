#[tauri::command]
pub async fn get_default_output_path(app_handle: tauri::AppHandle) -> String {
    // Retrieved part of this code from https://github.com/tauri-apps/tauri/discussions/5557
    let binding_result = app_handle.path_resolver().app_data_dir();
    match binding_result {
        Some(v) => v.to_string_lossy().to_string(),
        None => "".to_string(),
    }
}
