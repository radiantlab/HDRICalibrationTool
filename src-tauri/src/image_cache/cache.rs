use std::{
    env,
    fs::{self},
    io::Read,
    path::{Path, PathBuf},
};

pub fn get_cache_dir(_app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    // use OS-designated temporary directory so the cache can be evicted by the OS when necessary,
    // and we don't have to worry about cleanup.
    let base_dir = env::temp_dir().join(env!("CARGO_PKG_NAME"));
    let cache_dir = base_dir.join("image_cache");
    if fs::create_dir_all(&cache_dir).is_err() {
        return Err("Couldn't create image cache directory".to_string());
    }

    Ok(cache_dir)
}

pub fn compute_hash_for_file(path: &Path, context: &str) -> Result<String, String> {
    let file_result = std::fs::File::open(path);
    if file_result.is_err() {
        return Err("Unable to open image for hashing.".to_string());
    }
    let mut file = file_result.unwrap();

    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 8192];
    loop {
        let read_result = file.read(&mut buffer);
        if read_result.is_err() {
            return Err("Error reading image for hashing.".to_string());
        }
        let read = read_result.unwrap();
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    hasher.update(context.as_bytes());
    Ok(hasher.finalize().to_hex().to_string())
}
