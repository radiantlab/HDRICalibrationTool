use std::fs;

#[tauri::command]
pub fn read_host_file(file_path: String) -> Result<String, String> {
    match fs::read_to_string(file_path) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok("".to_string())
    }
}