// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import pipeline module
mod pipeline;
use pipeline::pipeline;

// Command to query operating system from frontend
mod query_os_platform;
use query_os_platform::query_os_platform;

// Command to read saved binary paths from config file
mod read_binary_paths;
use read_binary_paths::read_binary_paths;

// Command to read the contents of a directory
mod read_dynamic_dir;
use read_dynamic_dir::read_dynamic_dir;

// Commands to read the header or a specific header value from an HDR file
mod read_header;
use read_header::read_header_value;
use read_header::read_header;

// Command used to read from a file and return its contents to frontend
mod read_host_file;
use read_host_file::read_host_file;

// Command to write new binary paths to config file
mod write_binary_paths;
use write_binary_paths::write_binary_paths;

// Command to write to a file given its contents from frontend
mod write_host_file;
use write_host_file::write_host_file;

// Command to delete a saved config
mod delete_config;
use delete_config::delete_config;

// Command to get app's data directory
mod get_default_output_path;
use get_default_output_path::get_default_output_path;

// Command to save configuration
mod save_config;
use save_config::save_config;

// Command to retrieve saved configurations
mod get_saved_configs;
use get_saved_configs::get_saved_configs;

// Command to convert raw image into tiff image
mod raw_image_help;
use raw_image_help::convert_raw_img;

// Command to display HDR image using ximage utility
mod display_hdr_img;
use display_hdr_img::display_hdr_img;

use std::env;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pipeline,
            query_os_platform,
            read_binary_paths,
            read_dynamic_dir,
            read_header_value,
            read_header,
            read_host_file,
            write_binary_paths,
            write_host_file,
            delete_config,
            get_default_output_path, 
            save_config,
            get_saved_configs,
            convert_raw_img,
            display_hdr_img,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
