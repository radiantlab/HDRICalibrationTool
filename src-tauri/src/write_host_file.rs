use std::fs;

#[tauri::command]
pub fn write_host_file(filePath: String, text: String) -> Result<(), String> {
    match fs::write(filePath, text) {
        Ok(()) => Ok(()),
        Err(error) => Err(format!("Error writing to file: {:?}", error)),
    }
}