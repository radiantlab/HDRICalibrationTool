use std::path::Path;

use crate::image_cache::ensure_tiff_for_raw;

// converts raw image(s) into .tiff image(s) with caching. Returns temp cache paths.
#[tauri::command]
pub async fn convert_raw_img(
    app_handle: tauri::AppHandle,
    dcraw: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut outputs: Vec<String> = Vec::with_capacity(paths.len());

    for p in paths {
        let output = ensure_tiff_for_raw(
            &app_handle,
            if !dcraw.is_empty() {
                Some(Path::new(&dcraw))
            } else {
                None
            },
            Path::new(&p),
        )?;
        outputs.push(output.display().to_string());
    }

    Ok(outputs)
}
