use std::path::Path;

use crate::image_cache::ensure_avif_for_hdr;

// converts hdr image(s) into .avif image(s) with caching. Returns temp cache paths.
#[tauri::command]
pub async fn convert_hdr_to_avif(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut outputs: Vec<String> = Vec::with_capacity(paths.len());

    for p in paths {
        let output = ensure_avif_for_hdr(&app_handle, Path::new(&p))?;
        outputs.push(output.display().to_string());
    }

    Ok(outputs)
}
