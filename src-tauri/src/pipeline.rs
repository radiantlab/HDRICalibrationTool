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
    fs::{self, copy, create_dir_all},
    io,
    path::{Path, PathBuf},
};
use serde::Deserialize;

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
    dcraw_emu_path: PathBuf,
    output_path: PathBuf,
    temp_path: PathBuf, // used to store temp path in output dir, i.e. "output_path/tmp/"
}

#[derive(Deserialize)]
pub struct UserCommands {
    pub dcraw: String,
    pub hdrgen: String,
    pub raxyze: String,
    pub pcompos: String,
    pub pfilt: String,
    pub pcomb_projection_adj: String,
    pub pcomb_vignetting_corr: String,
    pub pcomb_neutral_dens: String,
    pub pcomb_photometric_adj: String,
    pub getinfo: String,
}

// Runs the radiance and hdrgen pipeline.
// radiance_path:
//      The path to radiance binaries
// hdrgen_path:
//      The path to the hdrgen binary
// dcraw_emu_path:
//      The path to the dcraw_emu binary, used for converting raw images to tiff format
// output_path:
//      Place for final HDR image to be stored. Temp dir is created within the ouput dir.
// input_images:
//      vector of the paths to the input images, or the input directories if batch processing.
//      Input images must be in .JPG format or .CR2 format.
// response_function:
//      string for the path to the camera response function (.rsp)
// fisheye_correction_cal:
//      a string for the path to fisheye correction calibration file (.cal)
// vignetting_correction_cal:
//      a string for the path to vignetting correction calibration file (.cal)
// photometric_adjustment_cal:
//      a string for the path to photometric adjustment calibration file (.cal)
// neutral_density_cal:
//      a string for the path to neutral density adjustment calibration file (.cal)
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
    dcraw_emu_path: String,
    output_path: String,
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
    commands: UserCommands,
) -> Result<String, String> {
    // Return error if pipeline was called with no input images
    if input_images.len() == 0 {
        return Err("No input images were provided.".into());
    }

    let is_directory = if input_images.len() > 0 {
        Path::new(&input_images[0]).is_dir()
    } else {
        false
    };

    if DEBUG {
        println!("Pipeline module called...");
        println!("\tradiance path: {radiance_path}");
        println!("\thdrgen path: {hdrgen_path}");
        println!("\tdcraw_emu path: {dcraw_emu_path}");
        println!("\toutput path: {output_path}");
        println!("\tinput images: {:?}", input_images);
        println!("\tresponse function: {response_function}");
        println!("\tfisheye correction cal: {fisheye_correction_cal}");
        println!("\tvignetting correction cal: {vignetting_correction_cal}");
        println!("\tphotometric adjustment cal: {photometric_adjustment_cal}");
        println!("\tneutral density cal: {neutral_density_cal}");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");
        println!("\txdim: {xdim}");
        println!("\tydim: {ydim}");

        println!("\n\nPROCESSING MODE");
        if is_directory {
            println!("\tUser selected directories. (Batch processing)");
        } else {
            println!("\tUser selected images. (Single scene)");
        }
    }

    // Add paths to radiance, hdrgen, raw2hdr, and output and temp directories to config settings
    let mut config_settings = ConfigSettings {
        radiance_path: Path::new(&radiance_path).to_owned(),
        hdrgen_path: Path::new(&hdrgen_path).to_owned(),
        dcraw_emu_path: Path::new(&dcraw_emu_path).to_owned(),
        output_path: Path::new(&output_path).to_owned(),
        temp_path: Path::new(&output_path).join("tmp").to_owned(), // Temp directory is located in output directory
    };

    // Creates output directory with /tmp subdirectory
    let create_dirs_result = create_dir_all(&config_settings.temp_path);

    if create_dirs_result.is_err() {
        return Result::Err(("Error creating tmp and output directories.").to_string());
    }

    if is_directory {
        // Directories were selected (batch processing)

        // Run pipeline for each directory selected
        for input_dir in &input_images {
            // Create a subdirectory inside tmp for this directory with input images (same name as input dir)
            config_settings.temp_path = Path::new(&config_settings.output_path)
                .join("tmp")
                .join(Path::new(input_dir).file_name().unwrap_or_default());

            if create_dir_all(&config_settings.temp_path).is_err() {
                return Result::Err(
                    ("Error creating directories for outputs in temp directory.").to_string(),
                );
            }

            // Grab all JPG or CR2 images from the directory and ignore all other files
            let input_images_from_dir_result = get_images_from_dir(&input_dir);
            if input_images_from_dir_result.is_err() {
                return Err(input_images_from_dir_result.unwrap_err());
            }
            let input_images_from_dir = input_images_from_dir_result.unwrap();

            if input_images_from_dir.len() == 0 {
                return Err("All directories must contain at least one LDR image".to_string());
            }

            // Run the HDRGen and Radiance pipeline on the input images
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
                &commands,
            );
            if result.is_err() {
                return result;
            }

            // Set output file name to be the same as the input directory name (i.e. <dir_name>.hdr)
            let mut output_file_name = config_settings
                .output_path
                .join(Path::new(input_dir).file_name().unwrap_or_default());
            output_file_name.set_extension("hdr");

            // Copy the final output hdr image to output directory
            let copy_result = copy(
                &config_settings.temp_path.join("header_editing.hdr"),
                output_file_name,
            );
            if copy_result.is_err() {
                return Result::Err(
                    ("Error copying final hdr image to output directory.").to_string(),
                );
            }
        }
    } else {
        // Individual images were selected (single scene)

        // Ensure images are a supported format
        for input_image in &input_images {
            if !is_supported_format(&PathBuf::from(input_image)) {
                return Err("Unsupported image format.".to_string());
            }
        }

        // Run the HDRGen and Radiance pipeline on the images
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
            &commands,
        );
        if result.is_err() {
            return result;
        }

        let output_file_name = config_settings.output_path.join("output.hdr");

        // Copy the final output hdr image to output directory
        let copy_result = copy(
            &config_settings.temp_path.join("header_editing.hdr"),
            output_file_name,
        );
        if copy_result.is_err() {
            return Result::Err(("Error copying final hdr image to output directory.").to_string());
        }
    }

    // If no errors, return Ok
    return Result::Ok(("Completed image generation.").to_string());
}

/*
 * Retrieves all JPG and CR2 images from a directory, ignoring other files or directories.
 * Does not check for images to be of the same format.
 */
pub fn get_images_from_dir(input_dir: &String) -> Result<Vec<String>, String> {
    // Taken from example code at https://doc.rust-lang.org/std/fs/fn.read_dir.html

    // Get everything in the directory (all files and directories)
    let read_dir_result = fs::read_dir(input_dir);
    if read_dir_result.is_err() {
        return Err(format!("Error reading input directory: {input_dir}."));
    }

    let collect_files_result = read_dir_result
        .unwrap()
        .map(|res| res.map(|e| e.path()))
        .collect::<Result<Vec<_>, io::Error>>();
    if collect_files_result.is_err() {
        return Err(format!(
            "Error getting input directory contents: {input_dir}."
        ));
    }

    let entries = collect_files_result.unwrap();

    // Find the files that have a JPG, TIFF, or CR2 extension
    let mut input_image_paths: Vec<String> = Vec::new();
    for entry in entries {
        if is_supported_format(&entry) {
            let x = entry.into_os_string().into_string().unwrap_or_default();
            input_image_paths.push(x);
        }
    }

    // Return the paths to the JPG and CR2 images
    Ok(input_image_paths)
}

/*
 * Run the HDRGen and Radiance pipeline on one set of LDR images
 * Returns a Result<String, String> either indicating images processed successfully
 * or representing an error, which is passed to the frontend in the pipeline function.
 */
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
    commands: &UserCommands,
) -> Result<String, String> {
    // Merge exposures
    // TODO: Examine a safer way to convert paths to strings that works for non utf-8?
    let merge_exposures_result = merge_exposures(
        &config_settings,
        input_images,
        response_function,
        config_settings
            .temp_path
            .join("merge_exposures.hdr")
            .display()
            .to_string(),
        &commands
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
            .join("merge_exposures.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("nullify_exposure_value.hdr")
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
            .join("nullify_exposure_value.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("crop.hdr")
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
            .join("crop.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("resize.hdr")
            .display()
            .to_string(),
        xdim,
        ydim,
    );

    // If the resizing command encountered an error, abort pipeline
    if resize_result.is_err() {
        return resize_result;
    }

    /* Start Calibration Files - able to be skipped in some instances */

    let mut next_path = "resize.hdr";

    if fisheye_correction_cal.len() > 0 {
        // Apply the projection adjustment to the HDR image
        let projection_adjustment_result = projection_adjustment(
            &config_settings,
            config_settings
                .temp_path
                .join(next_path)
                .display()
                .to_string(),
            config_settings
                .temp_path
                .join("projection_adjustment.hdr")
                .display()
                .to_string(),
            fisheye_correction_cal,
        );

        // If the command to apply projection adjustment encountered an error, abort pipeline
        if projection_adjustment_result.is_err() {
            return projection_adjustment_result;
        }

        next_path = "projection_adjustment.hdr"
    }

    if vignetting_correction_cal.len() > 0 {
        // Correct for the vignetting effect
        let vignetting_effect_correction_result = vignetting_effect_correction(
            &config_settings,
            config_settings
                .temp_path
                .join(next_path)
                .display()
                .to_string(),
            config_settings
                .temp_path
                .join("vignetting_correction.hdr")
                .display()
                .to_string(),
            vignetting_correction_cal,
        );

        // If the command encountered an error, abort pipeline
        if vignetting_effect_correction_result.is_err() {
            return vignetting_effect_correction_result;
        }

        next_path = "vignetting_correction.hdr";
    }

    if neutral_density_cal.len() > 0 {
        // Apply the neutral density filter.
        let neutral_density_result: Result<String, String> = neutral_density(
            &config_settings,
            config_settings
                .temp_path
                .join(next_path)
                .display()
                .to_string(),
            config_settings
                .temp_path
                .join("neutral_density.hdr")
                .display()
                .to_string(),
            neutral_density_cal,
        );

        // If the command encountered an error, abort pipeline
        if neutral_density_result.is_err() {
            return neutral_density_result;
        }

        next_path = "neutral_density.hdr";
    }

    if photometric_adjustment_cal.len() > 0 {
        // Correct for photometric adjustments
        let photometric_adjustment_result = photometric_adjustment(
            &config_settings,
            config_settings
                .temp_path
                .join(next_path)
                .display()
                .to_string(),
            config_settings
                .temp_path
                .join("photometric_adjustment.hdr")
                .display()
                .to_string(),
            photometric_adjustment_cal,
        );

        // If the command encountered an error, abort pipeline
        if photometric_adjustment_result.is_err() {
            return photometric_adjustment_result;
        }

        next_path = "photometric_adjustment.hdr";
    }

    /* End Calibration Files */

    // Edit the header
    let header_editing_result = header_editing(
        &config_settings,
        config_settings
            .temp_path
            .join(next_path)
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("header_editing.hdr")
            .display()
            .to_string(),
        vertical_angle,
        horizontal_angle,
    );

    // If the command encountered an error, abort pipeline
    if header_editing_result.is_err() {
        return header_editing_result;
    }

    // Pipeline has completed successfully. Return Ok
    return Result::Ok(("Image set processed.").to_string());
}

fn is_supported_format(entry: &PathBuf) -> bool {
    let supported_extensions: Vec<&str> = Vec::from([
        "jpg", "jpeg", "3fr", "ari", "arw", "bay", "braw", "crw", "cr2", "cr3", "cap", "data",
        "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef",
        "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rwl",
        "rw2", "rwz", "sr2", "srf", "srw", "tif", "tiff", "x3f",
    ]);
    let entry_ext = entry.extension().unwrap_or_default().to_ascii_lowercase();

    for i in supported_extensions {
        if entry_ext == i {
            return true;
        }
    }

    return false;
}
