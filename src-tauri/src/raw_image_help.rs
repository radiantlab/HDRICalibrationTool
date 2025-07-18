use std::{
    env, fs,
    path::Path,
    process::{Command, ExitStatus},
    str::Chars,
};

use tauri_plugin_shell::ShellExt;

use tauri::Manager;

/// Converts raw image into .tiff image for front end use.
#[tauri::command]
pub async fn convert_raw_img(
    app_handle: tauri::AppHandle,
    dcraw: String,
    pths: Vec<String>,
) -> Result<Vec<String>, String> {
    // Get app directory
    let b_res = app_handle.path().app_config_dir();
    let b = match b_res {
        Ok(v) => v,
        Err(_) => return Err("Unable to get app directory (binding)".to_string()),
    };

    let data_dir_res = b.to_str();
    let data_dir = match data_dir_res {
        Some(r) => r,
        None => return Err("Unable to get dir".to_string()),
    };

    // Prevent buildup of unneeded images
    let _clear = fs::remove_dir_all(Path::new(data_dir).join("converted_raws"));

    let dir = Path::new(data_dir).join("converted_raws");
    if fs::create_dir_all(&dir).is_err() {
        return Err("Couldn't create new directory".to_string());
    }

    let cur_exe = env::current_exe().unwrap().parent().unwrap().to_path_buf();

    // Get working directory of libraw.dll (only really needed for windows)
    let dcraw_emu_build_working_directory = if cfg!(target_os = "macos") {
        if cfg!(debug_assertions) {
            // macOS dev mode
            cur_exe.join("binaries")
        } else {
            // macOS release mode (inside .app bundle)
            cur_exe.join("../Resources/binaries")
        }
    } else {
        // Linux and Windows
        cur_exe.join("binaries")
    };

    let mut cmd: Command;
    let mut tiffs: Vec<String> = Vec::new();
    let mut tst2;
    for i in 0..pths.len() {
        let tst = pths[i].chars();
        tst2 = get_file_name(tst);
        if dcraw.len() < 1 {
            cmd = app_handle.shell().sidecar("dcraw_emu").unwrap().into();
            cmd.current_dir(&dcraw_emu_build_working_directory); // Set the working directory to find libraw.dll
        } else {
            cmd = Command::new(Path::new(&dcraw).join("dcraw_emu"));
        }
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
            dir.join(format!("{}.tiff", tst2))
                .display()
                .to_string()
                .as_str(),
            format!("{}", pths[i]).as_str(),
        ]);

        let stat = cmd.status();
        if !stat.is_ok() || !stat.unwrap_or(ExitStatus::default()).success() {
            return Err("Error, non-zero exit status. dcraw_emu command (converting to tiff images) failed.".to_string());
        }

        tiffs.push(dir.join(format!("{}.tiff", tst2)).display().to_string());
    }

    return Ok(tiffs);
}

fn get_file_name(img: Chars<'_>) -> String {
    let mut check = false;
    let mut name: String = "".to_string();
    for c in img.rev() {
        if c == '/' || c == '\\' {
            break;
        } else if check == true {
            name.insert(0, c);
        } else if c == '.' {
            check = true;
        }
    }
    return name;
}
