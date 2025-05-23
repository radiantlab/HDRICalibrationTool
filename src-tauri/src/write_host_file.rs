use std::fs;

#[tauri::command]
pub fn write_host_file(file_path: String, text: String) -> Result<(), String> {
    match fs::write(file_path, text) {
        Ok(()) => Ok(()),
        Err(error) => Err(format!("Error writing to file: {:?}", error)),
    }
}