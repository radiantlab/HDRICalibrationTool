use std::env;

// Returns a string representing the OS platform. Used for configuring default paths
// for binaries on frontend.
#[tauri::command]
pub async fn query_os_platform() -> String {
    let platform = env::consts::OS;
    return platform.to_string();
}
