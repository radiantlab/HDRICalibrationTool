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
    fs::{self, create_dir, create_dir_all},
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

    // TODO: CHANGE TO USE is_dir HERE
    // let is_directory = if input_images[0].contains(".JPG")
    //     || input_images[0].contains(".jpg")
    //     || input_images[0].contains(".JPEG")
    //     || input_images[0].contains(".jpeg")
    // {
    //     false
    // } else {
    //     true
    // };
    let is_directory = Path::new(&input_images[0]).is_dir();

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
    let config_settings = ConfigSettings {
        radiance_path: Path::new(&radiance_path).to_owned(),
        hdrgen_path: Path::new(&hdrgen_path).to_owned(),
        output_path: Path::new(&output_path).to_owned(),
        temp_path: Path::new(&temp_path).to_owned(),
    };

    let create_temp_dir_result = create_dir_all(config_settings.temp_path.as_path());
    let create_output_dir_result = create_dir_all(config_settings.output_path.as_path());
    
    if create_temp_dir_result.is_err() && create_output_dir_result.is_err() {
        return Result::Err(("Error creating temp and output directories.").to_string());
    }
    else if create_temp_dir_result.is_err() {
        return Result::Err(("Error creating temp directory.").to_string());
    }
    else if create_output_dir_result.is_err() {
        return Result::Err(("Error creating output directory.").to_string());
    }


    let input_image_paths = if is_directory {
        // let dir_name =
        let a = Path::new(&input_images[0]).file_name();
        // let dir_name = Path::new(&config_settings.temp_path).join(time + "_" + a);
        // create_dir_all()
        // println!("PATH GOING TO BE CREATED: {:?}", time_dir);

        // Taken from example code at https://doc.rust-lang.org/std/fs/fn.read_dir.html
        let entries = fs::read_dir(&input_images[0])
            .unwrap()
            .map(|res| res.map(|e| e.path()))
            .collect::<Result<Vec<_>, io::Error>>()
            .unwrap();

        // The order in which `read_dir` returns entries is not guaranteed. If reproducible
        // ordering is required the entries should be explicitly sorted.

        // entries.sort();

        println!("=== ENTRIES: {:?}", entries);

        // TODO: use something different than unwrap to avoid panicking
        let mut input_image_paths: Vec<String> = Vec::new();
        for entry in entries {
            let x = entry.into_os_string().into_string().unwrap();
            // let x = entry.into_os_string().display().to_string();
            input_image_paths.push(x);
        }
        input_image_paths
    } else {
        input_images
    };

    // TODO: Examine a safer way to convert paths to strings that works for non utf-8?
    let _merge_exposures_result = merge_exposures(
        &config_settings,
        input_image_paths,
        response_function,
        config_settings
            .temp_path
            .join("output1.hdr")
            .display()
            .to_string(),
    );

    // If the command to merge exposures encountered an error, abort pipeline
    // if merge_exposures_result.is_err() {
    //     return merge_exposures_result;
    // };

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

    return header_editing_result;
}
