use std::fs;

#[tauri::command]
pub fn read_host_file(filePath: String) -> Result<String, String> {
    match fs::read_to_string(filePath) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok("".to_string())
    }
}