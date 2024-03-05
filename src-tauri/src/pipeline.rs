mod crop;
mod header_editing;
mod merge_exposures;
mod neutral_density;
mod nullify_exposure_value;
mod photometric_adjustment;
mod projection_adjustment;
mod resize;
mod vignetting_effect_correction;

use std::{
    fs::{self, copy, create_dir, create_dir_all},
    io,
    path::{Path, PathBuf},
};

use chrono::Utc; // For getting UTC and formatting in ISO 8601

use crop::crop;
use header_editing::header_editing;
use merge_exposures::merge_exposures;
use neutral_density::neutral_density;
use nullify_exposure_value::nullify_exposure_value;
use photometric_adjustment::photometric_adjustment;
use projection_adjustment::projection_adjustment;
use resize::resize;
use vignetting_effect_correction::vignetting_effect_correction;

// Used to print out debug information
pub const DEBUG: bool = true;

// Struct to hold some configuration settings (e.g. path settings).
// Used when various stages of the pipeline are called.
pub struct ConfigSettings {
    radiance_path: PathBuf,
    hdrgen_path: PathBuf,
    output_path: PathBuf,
    temp_path: PathBuf,
}

// Runs the radiance and hdrgen pipeline.
// radiance_path:
//      The path to radiance binaries
// hdrgen_path:
//      The path to the hdrgen binary
// output_path: (NOT CURRENTLY USED)
//      Place for final HDR image to be stored
// temp_path: (CURRENTLY WHERE OUTPUTS ARE STORED)
//      Place for intermediate HDR image outputs to be stored
// input_images:
//      vector of the paths to the input images. Input images must be in .JPG format.
// response_function:
//      string for the path to the camera response function, must be a .rsp file
// fisheye_correction_cal:
//      a string for the fisheye correction calibration file
// vignetting_correction_cal:
//      a string for the vignetting correction calibration file
// diameter:
//      the fisheye view diameter in pixels
// xleft:
//      The x-coordinate of the bottom left corner of the circumscribed square
//      of the fisheye view (in pixels)
// ydown:
//      The y-coordinate of the bottom left corner of the circumscribed square
//      of the fisheye view (in pixels)
// xdim:
//      The x-dimensional resolution to resize the HDR image to (in pixels)
// ydim:
//      The y-dimensional resolution to resize the HDR image to (in pixels)
#[tauri::command]
pub async fn pipeline(
    radiance_path: String,
    hdrgen_path: String,
    output_path: String,
    temp_path: String,
    input_images: Vec<String>,
    response_function: String,
    fisheye_correction_cal: String,
    vignetting_correction_cal: String,
    photometric_adjustment_cal: String,
    neutral_density_cal: String,
    diameter: String,
    xleft: String,
    ydown: String,
    xdim: String,
    ydim: String,
    vertical_angle: String,
    horizontal_angle: String,
) -> Result<String, String> {
    let time = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let is_directory = if input_images.len() > 0 {
        Path::new(&input_images[0]).is_dir()
    } else {
        false
    };

    if DEBUG {
        println!("Pipeline module called...");
        println!("\tradiance path: {radiance_path}");
        println!("\thdrgen path: {hdrgen_path}");
        println!("\toutput path: {output_path}");
        println!("\ttemp path: {temp_path}");
        println!("\tinput images: {:?}", input_images);
        println!("\tresponse function: {response_function}");
        println!("\tfisheye correction cal: {fisheye_correction_cal}");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");

        println!("\n\n");
        if is_directory {
            println!("User selected directories.");
        } else {
            println!("User selected images, not directories.");
        }

        println!("\nSystem time: {}", time);
    }

    // Add path to radiance and temp directory info to config settings
    let mut config_settings = ConfigSettings {
        radiance_path: Path::new(&radiance_path).to_owned(),
        hdrgen_path: Path::new(&hdrgen_path).to_owned(),
        output_path: Path::new(&output_path).to_owned(),
        temp_path: Path::new(&temp_path).to_owned(),
    };

    let create_temp_dir_result = create_dir_all(config_settings.temp_path.as_path());
    let create_output_dir_result = create_dir_all(config_settings.output_path.as_path());

    if create_temp_dir_result.is_err() && create_output_dir_result.is_err() {
        return Result::Err(("Error creating temp and output directories.").to_string());
    } else if create_temp_dir_result.is_err() {
        return Result::Err(("Error creating temp directory.").to_string());
    } else if create_output_dir_result.is_err() {
        return Result::Err(("Error creating output directory.").to_string());
    }

    if is_directory {
        for input_dir in &input_images {
            // println!("TEMP PATH {:?}", &temp_path);

            config_settings.temp_path =
                Path::new(&temp_path).join(Path::new(input_dir).file_name().unwrap());

            if create_dir_all(&config_settings.temp_path).is_err() {
                return Result::Err(
                    ("Error creating directories for outputs in temp directory.").to_string(),
                );
            }

            let input_images_from_dir = get_images_from_dir(&input_dir);
            let result = process_image_set(
                &config_settings,
                input_images_from_dir,
                response_function.clone(),
                fisheye_correction_cal.clone(),
                vignetting_correction_cal.clone(),
                photometric_adjustment_cal.clone(),
                neutral_density_cal.clone(),
                diameter.clone(),
                xleft.clone(),
                ydown.clone(),
                xdim.clone(),
                ydim.clone(),
                vertical_angle.clone(),
                horizontal_angle.clone(),
            );
            if result.is_err() {
                return result;
            }

            let mut output_file_name = config_settings
                .output_path
                .join(Path::new(input_dir).file_name().unwrap());
            output_file_name.set_extension("hdr");
            let copy_result = copy(
                &config_settings.temp_path.join("output9.hdr"),
                output_file_name,
            );
            if copy_result.is_err() {
                return Result::Err(
                    ("Error copying final hdr image to output directory.").to_string(),
                );
            }
        }
    } else {
        let result = process_image_set(
            &config_settings,
            input_images,
            response_function.clone(),
            fisheye_correction_cal.clone(),
            vignetting_correction_cal.clone(),
            photometric_adjustment_cal.clone(),
            neutral_density_cal.clone(),
            diameter.clone(),
            xleft.clone(),
            ydown.clone(),
            xdim.clone(),
            ydim.clone(),
            vertical_angle.clone(),
            horizontal_angle.clone(),
        );
        if result.is_err() {
            return result;
        }

        // let output_file_name =  config_settings.output_path.join("output_".to_owned() + &time + ".hdr");
        let output_file_name = config_settings.output_path.join("output.hdr");

        // output_file_name.set_extension("hdr");
        let copy_result = copy(
            &config_settings.temp_path.join("output9.hdr"),
            output_file_name,
        );
        if copy_result.is_err() {
            return Result::Err(("Error copying final hdr image to output directory.").to_string());
        }
    }

    // If no errors, return Ok
    return Result::Ok(("Completed image generation.").to_string());
}

pub fn get_images_from_dir(input_dir: &String) -> Vec<String> {
    // TODO: Find code that doesn't panic? i.e. Don't use unwrap()?
    // Taken from example code at https://doc.rust-lang.org/std/fs/fn.read_dir.html
    let entries = fs::read_dir(input_dir)
        .unwrap()
        .map(|res| res.map(|e| e.path()))
        .collect::<Result<Vec<_>, io::Error>>()
        .unwrap();

    let mut input_image_paths: Vec<String> = Vec::new();
    for entry in entries {
        if entry.extension().unwrap_or_default() == "jpg"
            || entry.extension().unwrap_or_default() == "JPG"
            || entry.extension().unwrap_or_default() == "jpeg"
            || entry.extension().unwrap_or_default() == "JPEG"
            || entry.extension().unwrap_or_default() == "CR2"
        {
            let x = entry.into_os_string().into_string().unwrap_or_default();
            input_image_paths.push(x);
        }
    }
    input_image_paths
}

pub fn process_image_set(
    config_settings: &ConfigSettings,
    input_images: Vec<String>,
    response_function: String,
    fisheye_correction_cal: String,
    vignetting_correction_cal: String,
    photometric_adjustment_cal: String,
    neutral_density_cal: String,
    diameter: String,
    xleft: String,
    ydown: String,
    xdim: String,
    ydim: String,
    vertical_angle: String,
    horizontal_angle: String,
) -> Result<String, String> {
    // TODO: Examine a safer way to convert paths to strings that works for non utf-8?
    let merge_exposures_result = merge_exposures(
        &config_settings,
        input_images,
        response_function,
        config_settings
            .temp_path
            .join("output1.hdr")
            .display()
            .to_string(),
    );

    // If the command to merge exposures encountered an error, abort pipeline
    if merge_exposures_result.is_err() {
        return merge_exposures_result;
    };

    // Nullify the exposure value
    let nullify_exposure_result = nullify_exposure_value(
        &config_settings,
        config_settings
            .temp_path
            .join("output1.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output2.hdr")
            .display()
            .to_string(),
    );

    // If the command to nullify the exposure value encountered an error, abort pipeline
    if nullify_exposure_result.is_err() {
        return nullify_exposure_result;
    }

    // Crop the HDR image to a square fitting the fisheye view
    let crop_result = crop(
        &config_settings,
        config_settings
            .temp_path
            .join("output2.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output3.hdr")
            .display()
            .to_string(),
        diameter,
        xleft,
        ydown,
    );

    // If the cropping command encountered an error, abort pipeline
    if crop_result.is_err() {
        return crop_result;
    }

    // Resize the HDR image
    let resize_result = resize(
        &config_settings,
        config_settings
            .temp_path
            .join("output3.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output4.hdr")
            .display()
            .to_string(),
        xdim,
        ydim,
    );

    // If the resizing command encountered an error, abort pipeline
    if resize_result.is_err() {
        return resize_result;
    }

    // Apply the projection adjustment to the HDR image
    let projection_adjustment_result = projection_adjustment(
        &config_settings,
        config_settings
            .temp_path
            .join("output4.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output5.hdr")
            .display()
            .to_string(),
        fisheye_correction_cal,
    );

    // If the command to apply projection adjustment encountered an error, abort pipeline
    if projection_adjustment_result.is_err() {
        return projection_adjustment_result;
    }

    // Correct for the vignetting effect
    let vignetting_effect_correction_result = vignetting_effect_correction(
        &config_settings,
        config_settings
            .temp_path
            .join("output5.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output6.hdr")
            .display()
            .to_string(),
        vignetting_correction_cal,
    );

    if vignetting_effect_correction_result.is_err() {
        return vignetting_effect_correction_result;
    }

    // Apply the neutral density filter.
    let neutral_density_result: Result<String, String> = neutral_density(
        &config_settings,
        config_settings
            .temp_path
            .join("output6.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output7.hdr")
            .display()
            .to_string(),
        neutral_density_cal,
    );

    if neutral_density_result.is_err() {
        return neutral_density_result;
    }

    // Correct for photometric adjustments
    let photometric_adjustment_result = photometric_adjustment(
        &config_settings,
        config_settings
            .temp_path
            .join("output7.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output8.hdr")
            .display()
            .to_string(),
        photometric_adjustment_cal,
    );

    if photometric_adjustment_result.is_err() {
        return photometric_adjustment_result;
    }

    // Edit the header
    let header_editing_result = header_editing(
        &config_settings,
        config_settings
            .temp_path
            .join("output8.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("output9.hdr")
            .display()
            .to_string(),
        vertical_angle,
        horizontal_angle,
    );

    if header_editing_result.is_err() {
        return header_editing_result;
    }

    return Result::Ok(("Image set processed.").to_string());
}
