use crate::pipeline::DEBUG;
use std::{
    path::Path,
    process::{Command, ExitStatus},
};

#[tauri::command]
pub fn display_hdr_img(
    radiance_path: String,
    image_path: String
) -> Result<String, String> {
    let mut cmd = Command::new(Path::new(&radiance_path).join("ximage"));
    let args = ["-g", "2.2", "-e", "auto", &format!("{}", image_path)];
    cmd.args(args);

    let stat_res = cmd.status();
    if !stat_res.is_ok() || !stat_res.unwrap_or(ExitStatus::default()).success() {
        return Err("Error, non-zero exit status. ximage command (display hdr image) failed.".to_string());
    }
    if DEBUG {
        println!("Display HDR Image: Success\n");
    }

    return Ok("Display HDR Image Success".to_string());

}