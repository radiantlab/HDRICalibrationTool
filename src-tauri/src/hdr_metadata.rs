use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufRead, BufReader};

#[tauri::command]
pub fn read_hdr_metadata(path: String) -> Result<BTreeMap<String, String>, String> {
    let file = File::open(&path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file);
    let mut metadata = BTreeMap::new();

    for line in reader.lines() {
        let line = line.map_err(|error| error.to_string())?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }

        if let Some((key, value)) = trimmed.split_once('=') {
            let parsed_key = key.trim();
            let parsed_value = value.trim();
            if !parsed_key.is_empty() && !parsed_value.is_empty() {
                metadata.insert(parsed_key.to_string(), parsed_value.to_string());
            }
        }
    }

    Ok(metadata)
}
