mod crop;
mod evalglare;
mod header_editing;
mod merge_exposures;
mod neutral_density;
mod nullify_exposure_value;
mod photometric_adjustment;
mod projection_adjustment;
mod resize;
mod vignetting_effect_correction;

use serde::Serialize;
use tauri::Emitter;
mod falsecolor;

use std::{
    fs::{self, copy, create_dir_all},
    path::{Path, PathBuf},
};

use crate::command::CommandError;
use chrono::prelude::*;
use crop::crop;
use evalglare::{evalglare, EvalglareResult};
use falsecolor::falsecolor;
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

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PipelineError {
    Command { error: CommandError },
    InvalidInput { field: String, value: String },
    Processing { message: String },
    Event { message: String },
}

impl From<CommandError> for PipelineError {
    fn from(error: CommandError) -> Self {
        PipelineError::Command { error }
    }
}

// Struct to hold some configuration settings (e.g. path settings).
// Used when various stages of the pipeline are called.
pub struct ConfigSettings {
    radiance_path: PathBuf,
    hdrgen_path: PathBuf,
    dcraw_emu_path: PathBuf,
    output_path: PathBuf,
    temp_path: PathBuf, // used to store temp path in output dir, i.e. "output_path/tmp/"
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStatusKind {
    Step,
    Progress,
    Warning,
    Error,
    Done,
}

#[derive(Debug, Serialize, Clone)]
pub struct PipelineStatusPayload {
    pub kind: PipelineStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn emit_status(
    app: &tauri::AppHandle,
    payload: PipelineStatusPayload,
) -> Result<(), PipelineError> {
    app.emit("pipeline-status", payload)
        .map_err(|e| PipelineError::Event {
            message: format!("Failed to emit status event: {}", e),
        })
}

// Helper functon to emit progress events
fn emit_progress(
    app: &tauri::AppHandle,
    current_step: usize,
    total_steps: usize,
) -> Result<(), PipelineError> {
    let progress = ((current_step as f64 / total_steps as f64) * 100.0) as i32;
    app.emit("pipeline-progress", progress)
        .map_err(|e| PipelineError::Event {
            message: format!("Failed to emit progress event: {}", e),
        })?;
    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Progress,
            progress: Some(progress),
            step: None,
            message: None,
        },
    )
}

// Struct to hold argument values for falsecolor2/luminance mapping
pub struct LuminanceArgs {
    scale_limit: String,
    scale_label: String,
    scale_levels: String,
    legend_dimensions: String,
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
    app: tauri::AppHandle,
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
    diameter: f64,
    xleft: f64,
    ydown: f64,
    xdim: f64,
    ydim: f64,
    vertical_angle: f64,
    horizontal_angle: f64,
    scale_limit: String,
    scale_label: String,
    scale_levels: String,
    legend_dimensions: String,
    filter_images: bool,
) -> Result<String, PipelineError> {
    // Return error if pipeline was called with no input images
    if input_images.is_empty() {
        return Err(PipelineError::InvalidInput {
            field: "inputImages".to_string(),
            value: "empty".to_string(),
        });
    }

    let is_directory = if input_images.len() > 0 {
        Path::new(&input_images[0]).is_dir()
    } else {
        false
    };

    // let the frontend handle defaults
    // if xdim.len() < 1 {
    //     xdim = "1000".to_string();
    //     ydim = "1000".to_string();
    // }
    // if vertical_angle.len() < 1 {
    //     vertical_angle = "180".to_string();
    // }
    // if horizontal_angle.len() < 1 {
    //     horizontal_angle = "180".to_string();
    // }

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

    // Add arguments for falsecolor2 to luminance arguments struct
    let luminance_args = LuminanceArgs {
        scale_limit: scale_limit,
        scale_label: scale_label,
        scale_levels: scale_levels,
        legend_dimensions: legend_dimensions,
    };

    // Creates output directory with /tmp subdirectory
    if create_dir_all(&config_settings.temp_path).is_err() {
        return Err(PipelineError::Processing {
            message: "Error creating tmp and output directories.".to_string(),
        });
    }

    //Define total steps for progress bar (adjust this count as needed)
    let total_steps: usize = if is_directory { 5 } else { 5 };

    let current_step: usize = 0;
    emit_progress(&app, current_step, total_steps)?; // Initial progress (0%)

    let mut return_path: PathBuf = PathBuf::new();
    if is_directory {
        // Directories were selected (batch processing)

        // Run pipeline for each directory selected
        for input_dir in &input_images {
            // Create a subdirectory inside tmp for this directory with input images (same name as input dir)
            config_settings.temp_path = Path::new(&config_settings.output_path)
                .join("tmp")
                .join(Path::new(input_dir).file_name().unwrap_or_default());

            if create_dir_all(&config_settings.temp_path).is_err() {
                return Err(PipelineError::Processing {
                    message: "Error creating directories for outputs in temp directory."
                        .to_string(),
                });
            }

            // Grab all JPG or CR2 images from the directory and ignore all other files
            let input_images_from_dir = get_images_from_dir(&input_dir)?;

            if input_images_from_dir.is_empty() {
                return Err(PipelineError::InvalidInput {
                    field: "inputImages".to_string(),
                    value: "directory-without-images".to_string(),
                });
            }

            // Run the HDRGen and Radiance pipeline on the input images
            let result = process_image_set(
                &app,
                &config_settings,
                &luminance_args,
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
                current_step,
                total_steps,
                filter_images,
            );
            if let Err(error) = result {
                emit_status(
                    &app,
                    PipelineStatusPayload {
                        kind: PipelineStatusKind::Error,
                        progress: None,
                        step: None,
                        message: Some(format!("{:?}", error)),
                    },
                )?;
                return Err(error);
            }

            // Set output file name to be the same as the input directory name (i.e. <dir_name>.hdr)
            // Get current local date and time and format output name with it
            let datetime = format!("{}", Local::now().format("%F_%H-%M-%S"));
            return_path = config_settings.output_path.join(Path::new(input_dir));
            let base_name = Path::new(input_dir)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy();

            let output_file_name = config_settings
                .output_path
                .join(format!("{}_{}.hdr", base_name, datetime));

            // Copy the final output hdr image to output directory
            let mut copy_result = copy(
                &config_settings.temp_path.join("header_editing.hdr"),
                output_file_name,
            );
            if copy_result.is_err() {
                return Err(PipelineError::Processing {
                    message: "Error copying final hdr image to output directory.".to_string(),
                });
            }
            if copy_result.is_err() {
                return Err(PipelineError::Processing {
                    message: "Error copying evalglare value to output directory.".to_string(),
                });
            }
            let base_name2 = Path::new(input_dir)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy();
            let luminance_file_name = config_settings
                .output_path
                .join(format!("{}_{}_fc.hdr", base_name2, datetime));
            copy_result = copy(
                &config_settings.temp_path.join("falsecolor_output.hdr"),
                luminance_file_name,
            );
            if copy_result.is_err() {
                return Err(PipelineError::Processing {
                    message: "Error copying final luminance map hdr image to output directory."
                        .to_string(),
                });
            }
        }
    } else {
        // Individual images were selected (single scene)

        // Ensure images are a supported format
        for input_image in &input_images {
            if !is_supported_format(&PathBuf::from(input_image)) {
                return Err(PipelineError::InvalidInput {
                    field: "inputImages".to_string(),
                    value: "unsupported-format".to_string(),
                });
            }
        }

        // Run the HDRGen and Radiance pipeline on the images
        let result = process_image_set(
            &app,
            &config_settings,
            &luminance_args,
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
            current_step,
            total_steps,
            filter_images,
        );
        if let Err(error) = result {
            emit_status(
                &app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Error,
                    progress: None,
                    step: None,
                    message: Some(format!("{:?}", error)),
                },
            )?;
            return Err(error);
        }

        // Get current local date and time and format output name with it
        let datetime = format!("{}", Local::now().format("%F_%H-%M-%S"));
        let output_file_name = config_settings
            .output_path
            .join(format!("{}.hdr", datetime));

        // Copy the final output hdr image to output directory
        let mut copy_result = copy(
            &config_settings.temp_path.join("header_editing.hdr"),
            output_file_name,
        );
        if copy_result.is_err() {
            return Err(PipelineError::Processing {
                message: "Error copying final hdr image to output directory.".to_string(),
            });
        }

        let luminance_file_name = config_settings
            .output_path
            .join(format!("{}_fc.hdr", datetime));
        copy_result = copy(
            &config_settings.temp_path.join("falsecolor_output.hdr"),
            luminance_file_name,
        );
        if copy_result.is_err() {
            return Err(PipelineError::Processing {
                message: "Error copying final hdr luminance image to output directory.".to_string(),
            });
        }
        return_path = config_settings.output_path;
    }

    emit_status(
        &app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Done,
            progress: Some(100),
            step: None,
            message: Some("Pipeline complete.".to_string()),
        },
    )?;

    // If no errors, return Ok
    Ok(return_path.to_string_lossy().to_string())
}

/*
 * Retrieves all JPG and CR2 images from a directory, ignoring other files or directories.
 * Does not check for images to be of the same format.
 */
pub fn get_images_from_dir(input_dir: &String) -> Result<Vec<String>, PipelineError> {
    // Taken from example code at https://doc.rust-lang.org/std/fs/fn.read_dir.html

    // Get everything in the directory (all files and directories)
    let entries = fs::read_dir(input_dir)
        .map_err(|_| PipelineError::Processing {
            message: format!("Error reading input directory: {input_dir}."),
        })?
        .map(|res| res.map(|e| e.path()))
        .collect::<Result<Vec<_>, std::io::Error>>()
        .map_err(|_| PipelineError::Processing {
            message: format!("Error getting input directory contents: {input_dir}."),
        })?;

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
 * Returns a Result<String, PipelineError> either indicating images processed successfully
 * or representing an error, which is passed to the frontend in the pipeline function.
 */
pub fn process_image_set(
    app: &tauri::AppHandle,
    config_settings: &ConfigSettings,
    luminance_args: &LuminanceArgs,
    input_images: Vec<String>,
    response_function: String,
    fisheye_correction_cal: String,
    vignetting_correction_cal: String,
    photometric_adjustment_cal: String,
    neutral_density_cal: String,
    diameter: f64,
    xleft: f64,
    ydown: f64,
    xdim: f64,
    ydim: f64,
    vertical_angle: f64,
    horizontal_angle: f64,
    mut current_step: usize,
    total_steps: usize,
    filter_images: bool,
) -> Result<String, PipelineError> {
    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Step,
            progress: None,
            step: Some("merge_exposures".to_string()),
            message: Some("Merging exposures".to_string()),
        },
    )?;

    merge_exposures(
        app,
        &config_settings,
        input_images,
        response_function,
        config_settings
            .temp_path
            .join("merge_exposures.hdr")
            .display()
            .to_string(),
        diameter.clone(),
        xleft.clone(),
        ydown.clone(),
        xdim.clone(),
        ydim.clone(),
        filter_images,
    )?;

    current_step += 1;
    emit_progress(app, current_step, total_steps)?;

    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Step,
            progress: None,
            step: Some("nullify_exposure".to_string()),
            message: Some("Normalizing exposure".to_string()),
        },
    )?;

    nullify_exposure_value(
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
    )?;

    current_step += 1;
    emit_progress(app, current_step, total_steps)?;

    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Step,
            progress: None,
            step: Some("crop".to_string()),
            message: Some("Cropping HDR image".to_string()),
        },
    )?;

    crop(
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
        diameter.clone(),
        xleft,
        ydown,
    )?;

    let mut next_path = "crop.hdr";

    current_step += 1;
    emit_progress(app, current_step, total_steps)?;

    if diameter > 1000.0 {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("resize".to_string()),
                message: Some("Resizing HDR image".to_string()),
            },
        )?;

        resize(
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
        )?;

        next_path = "resize.hdr";
    }

    if !fisheye_correction_cal.is_empty() {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("projection_adjustment".to_string()),
                message: Some("Applying fisheye correction".to_string()),
            },
        )?;

        projection_adjustment(
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
        )?;

        next_path = "projection_adjustment.hdr"
    }

    if !vignetting_correction_cal.is_empty() {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("vignetting_correction".to_string()),
                message: Some("Applying vignetting correction".to_string()),
            },
        )?;

        vignetting_effect_correction(
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
        )?;

        next_path = "vignetting_correction.hdr";
    }

    if !neutral_density_cal.is_empty() {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("neutral_density".to_string()),
                message: Some("Applying neutral density correction".to_string()),
            },
        )?;

        neutral_density(
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
        )?;

        next_path = "neutral_density.hdr";
    }

    if !photometric_adjustment_cal.is_empty() {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("photometric_adjustment".to_string()),
                message: Some("Applying photometric adjustment".to_string()),
            },
        )?;

        photometric_adjustment(
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
        )?;

        next_path = "photometric_adjustment.hdr";
    }

    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Step,
            progress: None,
            step: Some("evalglare".to_string()),
            message: Some("Evaluating glare".to_string()),
        },
    )?;

    let evalglare_result = evalglare(
        &config_settings,
        config_settings
            .temp_path
            .join(next_path)
            .display()
            .to_string(),
        vertical_angle.clone(),
        horizontal_angle.clone(),
    )?;
    if let Some(message) = evalglare_result.warning {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Warning,
                progress: None,
                step: Some("evalglare".to_string()),
                message: Some(message),
            },
        )?;
    }
    let evalglare_value = evalglare_result.value;

    current_step += 1;
    emit_progress(app, current_step, total_steps)?;

    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Step,
            progress: None,
            step: Some("header_editing".to_string()),
            message: Some("Updating HDR header".to_string()),
        },
    )?;

    header_editing(
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
        evalglare_value,
    )?;

    current_step += 1;
    emit_progress(app, current_step, total_steps)?;

    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Step,
            progress: None,
            step: Some("falsecolor".to_string()),
            message: Some("Generating luminance map".to_string()),
        },
    )?;

    falsecolor(
        &config_settings,
        config_settings
            .temp_path
            .join("header_editing.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("falsecolor_output.hdr")
            .display()
            .to_string(),
        luminance_args,
    )?;

    Ok("Image set processed.".to_string())
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
