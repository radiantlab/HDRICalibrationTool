use crate::pipeline::DEBUG;
use std::{
    path::Path,
    process::{Command, ExitStatus},
};
use image::{GenericImageView, Pixel};

use super::ConfigSettings;

// Merges multiple LDR images into an HDR image using hdrgen. If images are in JPG or TIFF format,
// runs hdrgen command regularly. If images are not in JPG or TIFF format, converts the inputs
// to TIFF raw images first using dcraw_emu, then runs hdrgen.
//
// input_images:
//    vector of the paths to the input images. Input images must be in .JPG or .CR2 format.
// response_function:
//    string for the path to the camera response function, must be a .rsp file
// output_path:
//    a string for the path and filename where the resulting HDR image will be saved.
#[tauri::command]
pub fn merge_exposures(
    config_settings: &ConfigSettings,
    mut input_images: Vec<String>,
    response_function: String,
    output_path: String,
    diameter: String,
    xleft: String,
    ydown: String,
    xdim: String,
    ydim: String,
) -> Result<String, String> {
    if DEBUG {
        println!("merge_exposures Tauri command was called!");
    }

    // Check whether images are in raw format that needs to be converted to TIF
    let convert_to_tiff: bool = input_images.len() > 0 && is_raw(&input_images[0]);

    if DEBUG {
        println!(
            "\n\nMerge exposures {}...\n\n",
            if convert_to_tiff {
                "CONVERTING TO TIFF"
            } else {
                "NOT CONVERTING TO TIFF"
            }
        );
    }

    let mut command: Command;

    // If raw image format other than TIFF, need to first convert them to TIFF to be used by hdrgen
    if convert_to_tiff {
        let mut index = 1;
        for input_image in &input_images {
            // Create a new command for dcraw_emu
            command = Command::new(config_settings.dcraw_emu_path.join("dcraw_emu"));

            // Add command arguments
            command.args([
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
                config_settings
                    .temp_path
                    .join(format!("input{}.tiff", index))
                    .display()
                    .to_string()
                    .as_str(),
                format!("{}", input_image).as_str(),
            ]);

            let status: Result<ExitStatus, std::io::Error> = command.status();

            if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
                // On error, return an error message
                return Err("Error, non-zero exit status. dcraw_emu command (converting to tiff images) failed.".into());
            }

            index += 1;
        }

        // Update input images vector to contain the newly converted tiff images instead
        let mut new_inputs = Vec::new();
        for i in 1..input_images.len() + 1 {
            new_inputs.push(
                config_settings
                    .temp_path
                    .join(format!("input{}.tiff", i))
                    .display()
                    .to_string(),
            );
        }

        input_images = new_inputs;
    } else { // images might include jpeg, so try to filter them
        // convert float strings to f32
        let diameter_f32 = diameter.parse::<f32>()
            .map_err(|error| format!("pipeline: merge_exposures: failed to parse diameter as float - {}", error))?;
        let xleft_f32 = xleft.parse::<f32>()
            .map_err(|error| format!("pipeline: merge_exposures: failed to parse xleft as float - {}", error))?;
        let ydown_f32 = ydown.parse::<f32>()
            .map_err(|error| format!("pipeline: merge_exposures: failed to parse ydown as float - {}", error))?;
        let xdim_f32 = xdim.parse::<f32>()
            .map_err(|error| format!("pipeline: merge_exposures: failed to parse xdim as float - {}", error))?;
        let ydim_f32 = ydim.parse::<f32>()
            .map_err(|error| format!("pipeline: merge_exposures: failed to parse ydim as float - {}", error))?;
        
        // try and filter images, updating input images if successful
        let filtered_images = match filter_images(input_images, diameter_f32, xleft_f32, ydown_f32, xdim_f32, ydim_f32) {
            Ok(image_vec) => image_vec,
            Err(error) => return Err(format!("pipeline: merge_exposures: failed to filter images - {}", error)),
        };
        input_images = filtered_images;
    }

    // Create a new command for hdrgen
    command = Command::new(config_settings.hdrgen_path.join("hdrgen"));

    // Add input LDR images as args
    for input_image in input_images {
        command.arg(format!("{}", input_image));
    }

    // Add output path for HDR image
    command.arg("-o");
    command.arg(format!("{}", output_path));

    // Add camera response function if user provided one
    if response_function != "" {
        command.arg("-r");
        command.arg(format!("{}", response_function));
    }

    // Add remaining flags for hdrgen step
    command.args(["-a", "-e", "-f", "-g", "-F"]);

    // Run the command
    let status: Result<ExitStatus, std::io::Error> = command.status();

    if DEBUG {
        println!("\nCommand exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether hdrgen command was successful
    if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
        // On error, return an error message
        Err("Error, non-zero exit status. hdrgen command failed.".into())
    } else {
        // On success, return output path of HDR image
        Ok(output_path.into())
    }
}

fn filter_images(input_images: Vec<String>, diameter: f32, xleft: f32, ydown: f32, xdim: f32, ydim: f32) -> Result<Vec<String>, String> {
    let radius = diameter / 2.0;
    let xcenter = xleft + radius;
    let ycenter = ydown + radius;
    let mut filtered_images = Vec::new();
    let mut pixel_counts = Vec::new();
    let mut pixels_below = 0;
    let mut pixels_above = 0;
    let mut skip_image = false;
    // println!("Diameter: {}", diameter);
    // println!("Radius: {}", radius);
    // println!("xleft: {}", xleft);
    // println!("ydown: {}", ydown);
    // println!("xdim: {}", xdim);
    // println!("ydim: {}", ydim);
    // println!("xcenter: {}", xcenter);
    // println!("ycenter: {}", ycenter);

    // iterate through every image and count how many pixels of each is either below 27 or above 228 luminance 
    for input_image in &input_images {
        println!("Processing image: {}", input_image);
        if !is_jpeg(&input_image) { // skip trying to filter non-jpeg images
            continue;
        }
        let image = image::open(input_image)
            .map_err(|error| format!("pipeline: merge_exposures: filter_images: failed to open image - {}\n", error))?;
        let (width, height) = image.dimensions();
        for y in 0..height {
            for x in 0..width {
                let dx = x as f32 - xcenter; // figure out where pixel sits relative to center of fisheye view
                let dy = y as f32 - ycenter;
                if (dx * dx + dy * dy).sqrt() <= radius { // if it's in the fisheye view
                    let pixel = image.get_pixel(x, y).to_rgb();
                    let [r, g, b] = pixel.0;
                    if r < 27 && g < 27 && b < 27 { // all values below allowed threshold
                        // println!("Viewing pixel ({},{}): ", x, y);
                        // println!("RGB: {:?}", pixel.0);
                        pixels_below += 1;
                    } else if r > 228 && g > 228 && b > 228 { // all values above allowed threshold
                        // println!("Viewing pixel ({},{}): ", x, y);
                        // println!("RGB: {:?}", pixel.0);
                        pixels_above += 1;
                    }
                }
            }
        }
        pixel_counts.push((pixels_below, pixels_above));
        pixels_below = 0;
        pixels_above = 0;
        // if !skip_image {
        //     println!("Pushing image to filtered_images: {}", input_image);
        //     filtered_images.push(input_image.clone());
        // }
        // skip_image = false;
    }
    let mut start_index: i32 = -1;
    let mut end_index: i32 = -1;
    for (i, (pixels_below, pixels_above)) in pixel_counts.iter().enumerate() {
        if *pixels_below == 0 {
            println!("Start_Index: {}", i);
            start_index = i as i32;
        }
    }
    if start_index == -1 {
        start_index = 0;
    }
    for (i, (pixels_below, pixels_above)) in pixel_counts.iter().enumerate() {
        if i > start_index as usize && *pixels_above == 0 {
            println!("End_Index: {}", i);
            end_index = i as i32;
        }
    }
    if end_index == -1 {
        end_index = pixel_counts.len() as i32;
    }
    for i in start_index..end_index {
        filtered_images.push(input_images[i as usize].clone());
    }
    println!("{:?}", filtered_images);
    Ok(filtered_images)
}

// Returns a boolean representing whether the image file is in jpeg format.
fn is_jpeg(file_name: &String) -> bool {
    let image_ext = Path::new(file_name)
        .extension()
        .unwrap_or_default()
        .to_ascii_lowercase();

    if image_ext == "jpg" || image_ext == "jpeg" {
        true
    } else {
        false
    }
}

// Returns a boolean representing whether the image file is in raw format. Returns false if JPG or TIF.
fn is_raw(file_name: &String) -> bool {
    let image_ext = Path::new(file_name)
        .extension()
        .unwrap_or_default()
        .to_ascii_lowercase();

    if image_ext == "jpg" || image_ext == "jpeg" || image_ext == "tiff" || image_ext == "tif" {
        // Image is JPG or TIF
        false
    } else {
        // Image is in raw format
        true
    }
}
