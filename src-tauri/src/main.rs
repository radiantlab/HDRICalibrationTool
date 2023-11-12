// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use::std::process::Command;

const DEBUG: bool = true;
const HDRGEN_PATH: &str = "../../hdrgen_macosx/bin/hdrgen";

fn main() {

  let fake_input_images: Vec<String> = [
    "../examples/inputs/input_images/IMG_6955.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6956.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6957.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6958.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6959.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6960.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6961.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6962.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6963.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6964.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6965.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6966.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6967.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6968.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6969.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6970.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6971.JPG".to_string(),
    "../examples/inputs/input_images/IMG_6972.JPG".to_string()
  ].to_vec();

  let fake_response_function = "../examples/inputs/parameters/response_function_files/Response_function.rsp".to_string();

  let _result = merge_exposures(fake_input_images, fake_response_function);


  tauri::Builder::default()
    // UNCOMMENT THE BELOW LINE WHEN THIS IS INTEGRATED WITH FRONTEND
    // TO ALLOW merge_exposures COMMAND TO BE CALLED
    // .invoke_handler(tauri::generate_handler![merge_exposures])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


#[tauri::command]
fn merge_exposures(input_images: Vec<String>, response_function: String) -> Result<String, String> {

  if DEBUG {
    println!("merge_exposures Tauri command was called!");
  }

  let output_path = "../results/output1.hdr";


  // Create a new command for hdrgen
  let mut command = Command::new(HDRGEN_PATH);

  // Add input LDR images as args
  for input_image in input_images {
    command.arg(format!("{}", input_image));
  }

  // Add output path for HDR image
  command.arg("-o");
  command.arg(format!("{}", output_path));

  // Add camera response function
  command.arg("-r");
  command.arg(format!("{}", response_function));

  // Add remaining flags for hdrgen step
  command.arg("-a");
  command.arg("-e");
  command.arg("-f");
  command.arg("-g");

  // Run the command
  let status = command.status().unwrap();
  
  if DEBUG {
    println!("\nCommand exit status: {:?}\n", status);
  }
  

  // Check if hdrgen command was successful
  if status.success() {
    Ok(output_path.into())
  }
  else { 
    Err("Error, non-zero exit status. hdrgen command failed.".into())
  }

}