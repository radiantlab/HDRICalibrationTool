use std::{
    path::Path, 
    process::{Command, ExitStatus},
    fs,
}; 

/// Converts raw images into .tiff images for front end use.
#[tauri::command]
pub async fn convert_raw_img(app_handle: tauri::AppHandle, dcraw: String, pths: Vec<String>) -> Result<Vec<String>, String> {
    // Get app directory
    let b_res = app_handle.path_resolver().app_config_dir();
    let b = match b_res {
        Some(r) => r,
        None => return Err("Unable to get dir (binding)".to_string()),
    };

    let data_dir_res = b.to_str();
    let data_dir = match data_dir_res {
        Some(r) => r,
        None => return Err("Unable to get dir".to_string()),
    }; 

    let _tst = fs::remove_dir_all(Path::new(data_dir).join("converted_raws"));

    let dir = Path::new(data_dir).join("converted_raws");
    if fs::create_dir_all(&dir).is_err() {
        return Err("Couldn't create new directory".to_string());
    }

    let mut cmd: Command;
    let mut tiffs: Vec<String> = Vec::new();
    for i in 0..pths.len() {
        cmd = Command::new(Path::new(&dcraw).join("dcraw_emu"));
        cmd.args([
            "-T",
            "-o",
            "1",
            "-W",
            "-j",
            "-q",
            "3",
            "-g",
            "2",
            "0",
            "-t",
            "0",
            "-b",
            "1.1",
            "-Z",
            dir.join(format!("raw_to_tiff.tiff")).display().to_string().as_str(),
            format!("{}", pths[i]).as_str(),
        ]);
        
        let stat = cmd.status();
        if !stat.is_ok() || !stat.unwrap_or(ExitStatus::default()).success() {
            return Err("Convert to tiff failed (dcraw_emu)".to_string());
        }

        tiffs.push(dir.join(format!("raw_to_tiff.tiff")).display().to_string());
    }

    return Ok(tiffs); 
}
