use std::path::{Path, PathBuf};
use tauri::command;

use crate::image_cache;

#[command]
pub async fn convert_hdr_img(
    app_handle: tauri::AppHandle,
    radiance_path: String,
    file_path: String,
) -> Result<String, String> {
    let radiance_dir = Path::new(&radiance_path);
    let input = Path::new(&file_path);

    let tiff_path: PathBuf =
        image_cache::ensure_tiff_for_hdr(&app_handle, radiance_dir, input)?;

    tiff_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert TIFF path to string".to_string())
}