use crate::pipeline::DEBUG;
use anyhow::{Context, Result};
use image::{GenericImageView, Pixel};
use rayon::prelude::*;
use std::env;
use std::{
    path::Path,
    process::{Command, ExitStatus},
};

use super::ConfigSettings;
use tauri_plugin_shell::ShellExt;

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
    app: &tauri::AppHandle,
    config_settings: &ConfigSettings,
    mut input_images: Vec<String>,
    response_function: String,
    output_path: String,
    diameter: String,
    xleft: String,
    ydown: String,
    xdim: String,
    ydim: String,
    filter_images_flag: bool,
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
        // Get working directory of libraw.dll (only needed for windows)
        let cur_exe = env::current_exe().unwrap().parent().unwrap().to_path_buf();

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

        let mut index = 1;
        for input_image in &input_images {
            // Add command arguments
            let output_arg = config_settings
                .temp_path
                .join(format!("input{}.tiff", index))
                .display()
                .to_string();
            let input_arg = format!("{}", input_image);
            let args = [
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
                &output_arg,
                &input_arg,
            ];

            if config_settings.dcraw_emu_path.as_os_str().is_empty() {
                command = app.shell().sidecar("dcraw_emu").unwrap().into();

                command.current_dir(&dcraw_emu_build_working_directory); // Set the working directory to find libraw.dll

                if DEBUG {
                    let sidecar_path = command.get_program();
                    println!("Executing bundled sidecar at: {:?}\n", sidecar_path);
                }
            } else {
                if DEBUG {
                    println!(
                        "Overwriting bundled sidecar, running command at: {:?}\n",
                        config_settings.dcraw_emu_path.join("dcraw_emu")
                    );
                }
                command = Command::new(config_settings.dcraw_emu_path.join("dcraw_emu"));
            }

            command.args(args);
            let status: Result<ExitStatus, std::io::Error> = command.status();

            if !status.is_ok() || !status.unwrap_or(ExitStatus::default()).success() {
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
    } else if filter_images_flag {
        // images might include jpeg, so try to filter them if allowed
        // convert float strings to f32
        let diameter_f32 = diameter.parse::<f32>().map_err(|error| {
            format!(
                "pipeline: merge_exposures: failed to parse diameter as float - {}",
                error
            )
        })?;
        let xleft_f32 = xleft.parse::<f32>().map_err(|error| {
            format!(
                "pipeline: merge_exposures: failed to parse xleft as float - {}",
                error
            )
        })?;
        let ydown_f32 = ydown.parse::<f32>().map_err(|error| {
            format!(
                "pipeline: merge_exposures: failed to parse ydown as float - {}",
                error
            )
        })?;
        let xdim_f32 = xdim.parse::<f32>().map_err(|error| {
            format!(
                "pipeline: merge_exposures: failed to parse xdim as float - {}",
                error
            )
        })?;
        let ydim_f32 = ydim.parse::<f32>().map_err(|error| {
            format!(
                "pipeline: merge_exposures: failed to parse ydim as float - {}",
                error
            )
        })?;

        // try and filter images, updating input images if successful
        if is_jpeg(&input_images[0]) {
            let filtered_images = match filter_images(
                input_images,
                diameter_f32,
                xleft_f32,
                ydown_f32,
                xdim_f32,
                ydim_f32,
            ) {
                Ok(image_vec) => image_vec,
                Err(error) => {
                    return Err(format!(
                        "pipeline: merge_exposures: failed to filter images - {}",
                        error
                    ))
                }
            };
            input_images = filtered_images;
        }
    }

    // Create a new command for hdrgen
    if config_settings.hdrgen_path.as_os_str().is_empty() {
        command = app.shell().sidecar("hdrgen").unwrap().into();
        
        // Get working directory for libraries (same approach as dcraw_emu)
        let cur_exe = env::current_exe().unwrap().parent().unwrap().to_path_buf();
        
        let hdrgen_working_directory = if cfg!(target_os = "macos") {
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
        
        // Set the working directory to find libraries
        command.current_dir(&hdrgen_working_directory);
        
        if DEBUG {
            let sidecar_path = command.get_program();
            println!("Executing bundled sidecar at: {:?}", sidecar_path);
            println!("Working directory: {:?}", hdrgen_working_directory);
        }
    } else {
        if DEBUG {
            println!(
                "Overwriting bundled sidecar, running command at: {:?}\n",
                config_settings.hdrgen_path.join("hdrgen")
            );
        }
        command = Command::new(config_settings.hdrgen_path.join("hdrgen"));
    }

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

    if DEBUG {
        println!("Full hdrgen command: {:?}", command);
        println!("About to execute hdrgen...");
    }

    // START
    // let output_result = command.output();
    // if output_result.is_err() {
    //     if DEBUG {
    //         println!("Failed to start hdrgen command: {:?}", output_result.err());
    //     }
    //     return Err("pipeline: merge_exposures: failed to start command.".into());
    // }
    // let output = output_result.unwrap();
    // if DEBUG {
    //     println!("\nCommand exit status: {:?}", output.status);
    //     if let Some(code) = output.status.code() {
    //         println!("Exit code: {}", code);
    //     }
    //     println!("stdout: {}", String::from_utf8_lossy(&output.stdout));
    //     println!("stderr: {}", String::from_utf8_lossy(&output.stderr));
    // }
    // STOP

    // Run the command
    let status_result = command.status();
    if status_result.is_err() {
        return Err("pipeline: merge_exposures: failed to start command.".into());
    }
    let status = status_result.unwrap();

    if DEBUG {
        println!("\nCommand exit status: {:?}\n", status);
    }

    // Return a Result object to indicate whether hdrgen command was successful
    if !status.success() {
        // On error, return an error message
        Err("PIPELINE ERROR: command 'hdrgen' failed.".into())
    } else {
        // On success, return output path of HDR image
        Ok(output_path.into())
    }
}

// Filters images that bring no value to the HDR generation process; returns a Result containing the array of images that were not discarded
// Images are filtered by checking the luminance values of pixels inside the fisheye view
// Pixels with luminance values either below 27 or above 228 are counted respectively
// Once all images have had their pixel counts resolved, the input array is filtered by starting at the first brighter image that doesn't have \
// any pixel below 27; and ending at the first darker image that doesn't have any pixel above 228
fn filter_images(
    input_images: Vec<String>,
    diameter: f32,
    xleft: f32,
    ydown: f32,
    xdim: f32,
    ydim: f32,
) -> Result<Vec<String>> {
    if DEBUG {
        println!("filter_images was called...");
    }
    let radius = diameter / 2.0;
    let xcenter = xleft + radius;
    let ycenter = ydown + radius;
    let mut filtered_images = Vec::new();

    // If the first image isn't a jpeg, don't bother trying to filter
    if !is_jpeg(&input_images[0]) {
        return Ok(input_images);
    }

    // Compute mask using first image
    let image = image::open(&input_images[0]).with_context(|| {
        format!(
            "pipeline: merge_exposures: filter_images: failed to open image: {}",
            input_images[0]
        )
    })?;
    let (width, height) = image.dimensions();
    let mask = compute_circle_mask(height as usize, width as usize, xcenter, ycenter, radius);

    // Iterate through every image in parallel and count how many pixels of each is either below 27 or above 228 luminance
    let pixel_counts: Result<Vec<(usize, u32, u32, f32)>, anyhow::Error> = input_images
        .par_iter() // create parallel iterator
        .enumerate()
        .map(|(index, input_image)| {
            // allow for skipping images
            if DEBUG {
                println!("Processing image: {}", input_image);
            }

            if !is_jpeg(input_image) {
                return Err(anyhow::anyhow!(
                    "pipeline: merge_exposures: filter_images: image is not a JPEG: {}",
                    input_image
                ));
            }

            let image = image::open(input_image).with_context(|| {
                format!(
                    "pipeline: merge_exposures: filter_images: failed to open image: {}",
                    input_image
                )
            })?;

            // Start processing the image
            let mut pixels_below = 0;
            let mut pixels_above = 0;
            let mut avg_brightness: f32 = 0.0;
            let (width, height) = image.dimensions();

            for y in 0..height {
                for x in 0..width {
                    let mask_index = (y * width + x) as usize;
                    if mask[mask_index] {
                        // if it's in the fisheye view
                        let pixel = image.get_pixel(x, y).to_rgb();
                        let [r, g, b] = pixel.0;
                        // weighted average is used to get "perceived brightness" to the human eye
                        avg_brightness += 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;
                        if r < 27 && g < 27 && b < 27 {
                            // all values below allowed threshold
                            pixels_below += 1;
                        } else if r > 228 && g > 228 && b > 228 {
                            // all values above allowed threshold
                            pixels_above += 1;
                        }
                    }
                }
            }
            avg_brightness = avg_brightness / ((width * height) as f32);
            if DEBUG {
                println!(
                    "Processed Image: {:?}",
                    (input_image, pixels_below, pixels_above, avg_brightness)
                );
            }
            Ok((index, pixels_below, pixels_above, avg_brightness)) // return the tuple of pixel values
        })
        .collect(); // collect everything into the vector
                    // The vector returned by the above logic has a bunch of 4-element tuples; the first element
                    // is the index of the input image so they can be filtered appropriately; the second and third
                    // elements are the counts for the number of pixels below and above 27 and 228 respectively; and the
                    // fourth element is the average brightness of the image so the images can be sorted from brightest to darkest

    // The below is not the cleanest and could be written in a more idiomatic Rust way/a fancier way
    // However, it is very understandable as written
    let mut sorted_array = pixel_counts?; // unwrap result
                                          // sort images in descending order of brightness by comparing the avg_brightness
    sorted_array.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    if DEBUG {
        println!("Sorted Pixel Counts: {:?}", sorted_array);
    }
    let mut start_index: i32 = -1;
    let mut end_index: i32 = -1;

    // Go from the start and find the FIRST pixel of the brighter images that has no pixel below 27
    for (i, (index, pixels_below, pixels_above, avg_brightness)) in sorted_array.iter().enumerate()
    {
        if *pixels_below == 0 {
            start_index = i as i32;
            break;
        }
    }
    if start_index == -1 {
        start_index = 0;
    }
    // Go from the start and find the FIRST pixel of the darker images that has no pixel above 228
    for (i, (index, pixels_below, pixels_above, avg_brightness)) in sorted_array.iter().enumerate()
    {
        if i > start_index as usize && *pixels_above == 0 {
            end_index = i as i32; // don't break, cause the loop starts from the first array element
        }
    }
    if end_index == -1 {
        end_index = sorted_array.len() as i32;
    }
    if DEBUG {
        println!("Selecting images: {}:{}", start_index, end_index);
    }
    // Push and return all the images
    for i in start_index..end_index {
        filtered_images.push(input_images[sorted_array[i as usize].0 as usize].clone());
    }
    Ok(filtered_images)
}

// Returns an index mask for the pixels that fall inside the fisheye view
fn compute_circle_mask(
    height: usize,
    width: usize,
    xcenter: f32,
    ycenter: f32,
    radius: f32,
) -> Vec<bool> {
    let mut mask = vec![false; width * height];
    let rsquare = radius * radius;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - xcenter;
            let dy = y as f32 - ycenter;
            if dx * dx + dy * dy <= rsquare {
                mask[y * width + x] = true;
            }
        }
    }
    mask
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
