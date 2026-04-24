use image::{GenericImageView, Pixel};
use rayon::prelude::*;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri_plugin_shell::ShellExt;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn merge_exposures(
    app: &tauri::AppHandle,
    config_settings: &ConfigSettings,
    mut input_images: Vec<String>,
    response_function: String,
    output_path: String,
    diameter: f64,
    xleft: f64,
    ydown: f64,
    xdim: f64,
    ydim: f64,
    filter_images_flag: bool,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("merge_exposures() was called!");
    }

    let convert_to_tiff: bool = !input_images.is_empty() && is_raw(&input_images[0]);

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

    let runner = SystemCommandRunner;

    if convert_to_tiff {
        let (program, working_dir) =
            resolve_program(app, &config_settings.dcraw_emu_path, "dcraw_emu")?;

        let mut index = 1;
        for input_image in &input_images {
            let output_arg = config_settings
                .temp_path
                .join(format!("input{}.tiff", index))
                .display()
                .to_string();
            let input_arg = format!("{}", input_image);

            let args = vec![
                "-T".to_string(),
                "-o".to_string(),
                "1".to_string(),
                "-W".to_string(),
                "-j".to_string(),
                "-q".to_string(),
                "3".to_string(),
                "-g".to_string(),
                "2".to_string(),
                "0".to_string(),
                "-t".to_string(),
                "0".to_string(),
                "-b".to_string(),
                "1.1".to_string(),
                "-Z".to_string(),
                output_arg,
                input_arg,
            ];

            let mut spec = CommandSpec::new(program.clone())
                .args(args)
                .inherit_stdout();

            if let Some(dir) = &working_dir {
                spec = spec.working_dir(dir.clone());
            }

            run_with_io(&spec, &runner)?;
            index += 1;
        }

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
        if is_jpeg(&input_images[0]) {
            input_images = filter_images(
                input_images,
                diameter as f32,
                xleft as f32,
                ydown as f32,
                xdim as f32,
                ydim as f32,
            )?;
        }
    }

    let (program, working_dir) = resolve_program(app, &config_settings.hdrgen_path, "hdrgen")?;

    let mut spec = CommandSpec::new(program).inherit_stdout();
    if let Some(dir) = working_dir {
        spec = spec.working_dir(dir);
    }

    for input_image in &input_images {
        spec = spec.arg(input_image.as_str());
    }

    spec = spec.arg("-o").arg(output_path.as_str());

    if !response_function.is_empty() {
        spec = spec.arg("-r").arg(response_function.as_str());
    }

    spec = spec.args(["-a", "-e", "-f", "-g", "-F"]);

    if DEBUG {
        println!("About to execute hdrgen...");
    }

    run_with_io(&spec, &runner)?;

    Ok(PathBuf::from(output_path))
}

fn resolve_program(
    app: &tauri::AppHandle,
    configured_path: &PathBuf,
    binary_name: &str,
) -> Result<(PathBuf, Option<PathBuf>), PipelineError> {
    if configured_path.as_os_str().is_empty() {
        let command: Command = app
            .shell()
            .sidecar(binary_name)
            .map_err(|error| PipelineError::Processing {
                message: format!(
                    "merge_exposures: failed to resolve sidecar {binary_name}: {error}"
                ),
            })?
            .into();

        let working_dir = sidecar_working_dir()?;
        Ok((PathBuf::from(command.get_program()), Some(working_dir)))
    } else {
        Ok((configured_path.join(binary_name), None))
    }
}

fn sidecar_working_dir() -> Result<PathBuf, PipelineError> {
    let exe_path = env::current_exe().map_err(|error| PipelineError::Processing {
        message: format!("merge_exposures: failed to resolve current executable: {error}"),
    })?;
    let exe_dir = exe_path.parent().ok_or_else(|| PipelineError::Processing {
        message: "merge_exposures: executable path has no parent directory".to_string(),
    })?;

    let working_dir = if cfg!(target_os = "macos") {
        if cfg!(debug_assertions) {
            exe_dir.join("binaries")
        } else {
            exe_dir.join("../Resources/binaries")
        }
    } else {
        exe_dir.join("binaries")
    };

    Ok(working_dir)
}

fn filter_images(
    input_images: Vec<String>,
    diameter: f32,
    xleft: f32,
    ydown: f32,
    _xdim: f32,
    _ydim: f32,
) -> Result<Vec<String>, PipelineError> {
    if DEBUG {
        println!("filter_images was called...");
    }

    let radius = diameter / 2.0;
    let xcenter = xleft + radius;
    let ycenter = ydown + radius;
    let mut filtered_images = Vec::new();

    if !is_jpeg(&input_images[0]) {
        return Ok(input_images);
    }

    let image = image::open(&input_images[0]).map_err(|error| PipelineError::Processing {
        message: format!(
            "merge_exposures: filter_images: failed to open image {}: {error}",
            input_images[0]
        ),
    })?;
    let (width, height) = image.dimensions();
    let mask = compute_circle_mask(height as usize, width as usize, xcenter, ycenter, radius);

    let pixel_counts: Result<Vec<(usize, u32, u32, f32)>, PipelineError> = input_images
        .par_iter()
        .enumerate()
        .map(
            |(index, input_image)| -> Result<(usize, u32, u32, f32), PipelineError> {
                if DEBUG {
                    println!("Processing image: {}", input_image);
                }

                if !is_jpeg(input_image) {
                    return Err(PipelineError::Processing {
                        message: format!(
                            "merge_exposures: filter_images: image is not a JPEG: {input_image}"
                        ),
                    });
                }

                let image =
                    image::open(input_image).map_err(|error| PipelineError::Processing {
                        message: format!(
                            "merge_exposures: filter_images: failed to open image {}: {error}",
                            input_image
                        ),
                    })?;

                let mut pixels_below = 0;
                let mut pixels_above = 0;
                let mut avg_brightness: f32 = 0.0;
                let (width, height) = image.dimensions();

                for y in 0..height {
                    for x in 0..width {
                        let mask_index = (y * width + x) as usize;
                        if mask[mask_index] {
                            let pixel = image.get_pixel(x, y).to_rgb();
                            let [r, g, b] = pixel.0;
                            avg_brightness +=
                                0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;
                            if r < 27 && g < 27 && b < 27 {
                                pixels_below += 1;
                            } else if r > 228 && g > 228 && b > 228 {
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
                Ok((index, pixels_below, pixels_above, avg_brightness))
            },
        )
        .collect();

    let mut sorted_array = pixel_counts?;
    sorted_array.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    if DEBUG {
        println!("Sorted Pixel Counts: {:?}", sorted_array);
    }
    let mut start_index: i32 = -1;
    let mut end_index: i32 = -1;

    for (i, (_index, pixels_below, _pixels_above, _avg_brightness)) in
        sorted_array.iter().enumerate()
    {
        if *pixels_below == 0 {
            start_index = i as i32;
            break;
        }
    }
    if start_index == -1 {
        start_index = 0;
    }

    for (i, (_index, _pixels_below, pixels_above, _avg_brightness)) in
        sorted_array.iter().enumerate()
    {
        if i > start_index as usize && *pixels_above == 0 {
            end_index = i as i32;
        }
    }
    if end_index == -1 {
        end_index = sorted_array.len() as i32;
    }
    if DEBUG {
        println!("Selecting images: {}:{}", start_index, end_index);
    }

    for i in start_index..end_index {
        filtered_images.push(input_images[sorted_array[i as usize].0 as usize].clone());
    }
    Ok(filtered_images)
}

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

fn is_jpeg(file_name: &String) -> bool {
    let image_ext = Path::new(file_name)
        .extension()
        .unwrap_or_default()
        .to_ascii_lowercase();

    image_ext == "jpg" || image_ext == "jpeg"
}

fn is_raw(file_name: &String) -> bool {
    let image_ext = Path::new(file_name)
        .extension()
        .unwrap_or_default()
        .to_ascii_lowercase();

    !(image_ext == "jpg" || image_ext == "jpeg" || image_ext == "tiff" || image_ext == "tif")
}
