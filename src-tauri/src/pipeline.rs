mod crop;
mod header_editing;
mod merge_exposures;
mod neutral_density;
mod nullify_exposure_value;
mod photometric_adjustment;
mod projection_adjustment;
mod resize;
mod vignetting_effect_correction;

use std::{fmt::Debug, fs, io, path::Path, time::SystemTime, vec};
// use chrono::{DateTime, Utc}

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
    radiance_path: String,
    hdrgen_path: String,
    output_path: String,
    temp_path: String,
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
    // let sys_time: DateTime<Utc> = SystemTime::now().into();
    // let sys_time_str = sys_time.to_rfc3339();
    // let SystemTime
    let sys_time: SystemTime = SystemTime::now().into();

    let is_directory = if input_images[0].contains(".JPG")
        || input_images[0].contains(".jpg")
        || input_images[0].contains(".JPEG")
        || input_images[0].contains(".jpeg")
    {
        false
    } else {
        true
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
        if input_images[0].contains(".JPG") {
            println!("User selected images, not directories.");
        } else {
            println!("User selected directories.");
        }

        println!("System time: {:?}\n\n", sys_time);
    }

    // Add path to radiance and temp directory info to config settings
    let config_settings = ConfigSettings {
        radiance_path: radiance_path,
        hdrgen_path: hdrgen_path,
        output_path: output_path,
        temp_path: temp_path,
    };


    let input_image_paths = 
    if is_directory {

        let entries = fs::read_dir(&input_images[0]).unwrap()
        .map(|res| res.map(|e| e.path()))
        .collect::<Result<Vec<_>, io::Error>>().unwrap();

        // The order in which `read_dir` returns entries is not guaranteed. If reproducible
        // ordering is required the entries should be explicitly sorted.

        // entries.sort();

        println!("=== ENTRIES: {:?}", entries);


        // // input_images += "/*"
        // let path = Path::new(&input_images[0]);
        // let new_path = path.join("*").into_os_string().into_string().unwrap();
        // // input_images = vec![new_path];
        // if DEBUG {
        //     println!("WOULD INPUT TO HDRGEN: {:?}", new_path);
        // }

        let mut input_image_paths: Vec<String> = Vec::new();
        for entry in entries {
            let x = entry.into_os_string().into_string().unwrap();
            // x.into_string().unwrap();
            input_image_paths.push(x);
            // input_image_paths;

        }
        input_image_paths
    }
    else {
        input_images
    };

    let _merge_exposures_result = merge_exposures(
        &config_settings,
        input_image_paths,
        response_function,
        format!("{}output1.hdr", config_settings.temp_path),
    );

    // If the command to merge exposures encountered an error, abort pipeline
    // if merge_exposures_result.is_err() {
    //     return merge_exposures_result;
    // };

    // Nullify the exposure value
    let nullify_exposure_result = nullify_exposure_value(
        &config_settings,
        format!("{}output1.hdr", config_settings.temp_path),
        format!("{}output2.hdr", config_settings.temp_path),
    );

    // If the command to nullify the exposure value encountered an error, abort pipeline
    if nullify_exposure_result.is_err() {
        return nullify_exposure_result;
    }

    // Crop the HDR image to a square fitting the fisheye view
    let crop_result = crop(
        &config_settings,
        format!("{}output2.hdr", config_settings.temp_path),
        format!("{}output3.hdr", config_settings.temp_path),
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
        format!("{}output3.hdr", config_settings.temp_path),
        format!("{}output4.hdr", config_settings.temp_path),
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
        // format!("{}output4.hdr", config_settings.temp_path),
        format!("{}output4.hdr", config_settings.temp_path),
        format!("{}output5.hdr", config_settings.temp_path),
        fisheye_correction_cal,
    );

    // If the command to apply projection adjustment encountered an error, abort pipeline
    if projection_adjustment_result.is_err() {
        return projection_adjustment_result;
    }

    // Correct for the vignetting effect
    let vignetting_effect_correction_result = vignetting_effect_correction(
        &config_settings,
        format!("{}output5.hdr", config_settings.temp_path),
        format!("{}output6.hdr", config_settings.temp_path),
        vignetting_correction_cal,
    );

    if vignetting_effect_correction_result.is_err() {
        return vignetting_effect_correction_result;
    }

    // Apply the neutral density filter.
    let neutral_density_result = neutral_density(
        &config_settings,
        format!("{}output6.hdr", config_settings.temp_path),
        format!("{}output7.hdr", config_settings.temp_path),
        neutral_density_cal,
    );

    if neutral_density_result.is_err() {
        return neutral_density_result;
    }

    // Correct for photometric adjustments
    let photometric_adjustment_result = photometric_adjustment(
        &config_settings,
        format!("{}output7.hdr", config_settings.temp_path),
        format!("{}output8.hdr", config_settings.temp_path),
        photometric_adjustment_cal,
    );

    if photometric_adjustment_result.is_err() {
        return photometric_adjustment_result;
    }

    // Edit the header
    let header_editing_result = header_editing(
        &config_settings,
        format!("{}output8.hdr", config_settings.temp_path),
        format!("{}output9.hdr", config_settings.temp_path),
        vertical_angle,
        horizontal_angle,
    );

    return header_editing_result;
}
