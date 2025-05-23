use std::fs;

#[tauri::command]
pub fn read_dynamic_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            entry.ok().map(|e| e.path().display().to_string())
        })
        .collect();
    Ok(entries)
}