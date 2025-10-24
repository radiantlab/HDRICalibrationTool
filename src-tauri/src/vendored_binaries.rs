use std::path::PathBuf;
use std::env;

const VENDOR_DIR: &str = "vendor";

// returns the working directory where vendored sidecars can be found.
pub fn vendored_working_dir() -> PathBuf {
    let cur_exe_dir = env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();

    if cfg!(target_os = "macos") {
        if cfg!(debug_assertions) {
            // macOS dev mode
            cur_exe_dir.join(VENDOR_DIR)
        } else {
            // macOS release mode (inside .app bundle)
            cur_exe_dir.join(format!("../Resources/{}", VENDOR_DIR))
        }
    } else {
        // Linux and Windows
        cur_exe_dir.join(VENDOR_DIR)
    }
}


