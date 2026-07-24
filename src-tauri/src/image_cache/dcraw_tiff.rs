use std::{
    env,
    fs::{self},
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
};

use tauri_plugin_shell::ShellExt;

use super::cache::{compute_hash_for_file, get_cache_dir};

fn dcraw_base_args() -> &'static [&'static str] {
    &[
        "-T", "-o", "1", "-W", "-j", "-q", "3", "-g", "2", "0", "-t", "0", "-b", "1.1",
    ]
}

fn dcraw_context() -> String {
    format!("dcraw_emu|{}", dcraw_base_args().join(" "))
}

fn dcraw_working_dir() -> Option<PathBuf> {
    let cur_exe_result = env::current_exe();
    if cur_exe_result.is_err() {
        return None;
    }
    let cur_exe = cur_exe_result.unwrap();
    let parent = cur_exe.parent();
    if parent.is_none() {
        return None;
    }
    let parent = parent.unwrap().to_path_buf();

    if cfg!(target_os = "macos") {
        if cfg!(debug_assertions) {
            Some(parent.join("binaries"))
        } else {
            Some(parent.join("../Resources/binaries"))
        }
    } else {
        Some(parent.join("binaries"))
    }
}

fn run_dcraw_conversion(
    app_handle: &tauri::AppHandle,
    dcraw_dir: Option<&Path>,
    input: &Path,
    output: &Path,
) -> Result<(), String> {
    let mut cmd: Command;

    if dcraw_dir.is_none() || dcraw_dir.unwrap().as_os_str().is_empty() {
        cmd = app_handle.shell().sidecar("dcraw_emu").unwrap().into();
        if let Some(wd) = dcraw_working_dir() {
            cmd.current_dir(wd);
        }
    } else {
        cmd = Command::new(dcraw_dir.unwrap().join("dcraw_emu"));
    }

    let mut args: Vec<String> = dcraw_base_args().iter().map(|s| (*s).to_string()).collect();
    args.push("-Z".to_string());
    args.push(output.display().to_string());
    args.push(input.display().to_string());
    cmd.args(args);

    let stat = cmd.status();
    if !stat.is_ok() || !stat.unwrap_or(ExitStatus::default()).success() {
        return Err(
            "Error, non-zero exit status. dcraw_emu command (converting to tiff images) failed."
                .to_string(),
        );
    }

    Ok(())
}

pub fn ensure_tiff_for_raw(
    app_handle: &tauri::AppHandle,
    dcraw_dir: Option<&Path>,
    input: &Path,
) -> Result<PathBuf, String> {
    let cache_dir = get_cache_dir(app_handle)?;
    let key = compute_hash_for_file(input, &dcraw_context())?;
    let output_path = cache_dir.join(format!("{}.tiff", key));

    // if there is an entry in the cache, return it
    if output_path.exists() {
        println!("cache hit for {}", output_path.display());
        let meta_result = output_path.metadata();
        if meta_result.is_ok() && meta_result.unwrap().len() > 0 {
            return Ok(output_path);
        }
    }

    // otherwise perform the conversion
    let result = run_dcraw_conversion(app_handle, dcraw_dir, input, &output_path);
    if result.is_err() {
        let _ = fs::remove_file(&output_path);
        return Err(result.err().unwrap());
    }
    Ok(output_path)
}
