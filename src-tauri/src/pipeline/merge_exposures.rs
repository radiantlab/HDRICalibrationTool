use image::{GenericImageView, Pixel};
use rayon::prelude::*;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::{env, fs};
use tauri_plugin_shell::ShellExt;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{
    emit_status, ConfigSettings, PipelineError, PipelineStatusKind, PipelineStatusPayload, DEBUG,
};

pub fn merge_exposures(
    app: &tauri::AppHandle,
    config_settings: &ConfigSettings,
    mut input_images: Vec<String>,
    response_function: String,
    output_path: String,
    diameter: f64,
    xleft: f64,
    ytop: f64,
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
            let before = input_images.len();
            input_images = filter_images(
                input_images,
                diameter as f32,
                xleft as f32,
                ytop as f32,
                xdim as f32,
                ydim as f32,
            )?;
            emit_status(
                app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Step,
                    progress: None,
                    step: Some("select_exposures".to_string()),
                    message: Some(format!(
                        "Selected {} of {before} useful exposures",
                        input_images.len()
                    )),
                    set_index: None,
                    set_total: None,
                },
            )?;
        }
    }

    let (program, working_dir) = resolve_program(app, &config_settings.hdrgen_path, "hdrgen")?;

    // Given no response function at all, hdrgen derives one from the exposures.
    // RAW input is already linear, so the square response below is the better
    // assumption than whatever hdrgen recovers from a linear bracket.
    let response_function = if convert_to_tiff && response_function.is_empty() {
        write_square_response(&config_settings.temp_path)?
    } else {
        response_function
    };

    let spec = hdrgen_spec(
        program,
        working_dir,
        &input_images,
        &response_function,
        &output_path,
    );

    if DEBUG {
        println!("About to execute hdrgen...");
    }

    run_with_io(&spec, &runner)?;

    Ok(PathBuf::from(output_path))
}

/// A simple square response: a polynomial of order 2 with a coefficient of 1
/// for x^2, one line per channel.
const SQUARE_RESPONSE: &str = "2 1 0 0\n2 1 0 0\n2 1 0 0\n";

/// Writes the square response function and returns its path.
fn write_square_response(temp_path: &Path) -> Result<String, PipelineError> {
    let path = temp_path.join("sqr.rsp");

    fs::write(&path, SQUARE_RESPONSE).map_err(|error| PipelineError::Processing {
        message: format!(
            "merge_exposures: failed to write the default response function to {}: {error}",
            path.display()
        ),
    })?;

    Ok(path.display().to_string())
}

/// Builds the hdrgen invocation.
///
/// Separated from `merge_exposures` so the argument list can be asserted on
/// without an AppHandle or a real hdrgen binary.
fn hdrgen_spec(
    program: PathBuf,
    working_dir: Option<PathBuf>,
    input_images: &[String],
    response_function: &str,
    output_path: &str,
) -> CommandSpec {
    let mut spec = CommandSpec::new(program).inherit_stdout();

    if let Some(dir) = working_dir {
        spec = spec.working_dir(dir);
    }

    // `-m` is the cache size in megabytes. hdrgen's online man page documents a
    // default of 100 and the man page bundled with the binaries documents 1000,
    // so the value in force depends on which build happens to be installed.
    // Stating it makes a run reproducible across installations; raw2hdr uses
    // 400, so 1000 is comfortably safe.
    //
    // Ahead of the filenames, unlike the output flags below. A cache size has
    // to be known before the first input is read to have any effect, and it is
    // not worth depending on hdrgen buffering its whole argument list first.
    spec = spec.args(["-m", "1000"]);

    for input_image in input_images {
        spec = spec.arg(input_image.as_str());
    }

    spec = spec.arg("-o").arg(output_path);

    if !response_function.is_empty() {
        spec = spec.arg("-r").arg(response_function);
    }

    spec.args(["-a", "-e", "-f", "-g", "-F"])
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
    ytop: f32,
    _xdim: f32,
    _ydim: f32,
) -> Result<Vec<String>, PipelineError> {
    if DEBUG {
        println!("filter_images was called...");
    }

    let radius = diameter / 2.0;
    let xcenter = xleft + radius;
    let ycenter = ytop + radius;
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
    // One mask is built from the first frame and reused for the rest, so every
    // frame has to share its dimensions or the mask lands on the wrong pixels.
    let (reference_width, reference_height) = (width, height);

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
                // Sum of luma over the masked pixels only, scaled by a divisor
                // that is identical for every frame in the set. Not a mean, but
                // a monotone score, which is all the brightness sort needs.
                let mut brightness_score: f32 = 0.0;
                let (width, height) = image.dimensions();

                if (width, height) != (reference_width, reference_height) {
                    return Err(PipelineError::Processing {
                        message: format!(
                            "merge_exposures: filter_images: {input_image} is {width}x{height} \
                             but the first image is {reference_width}x{reference_height}; \
                             the lens mask cannot be applied to both"
                        ),
                    });
                }

                for y in 0..height {
                    for x in 0..width {
                        let mask_index = (y * width + x) as usize;
                        if mask[mask_index] {
                            let pixel = image.get_pixel(x, y).to_rgb();
                            let [r, g, b] = pixel.0;
                            brightness_score +=
                                0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;
                            if r < 27 && g < 27 && b < 27 {
                                pixels_below += 1;
                            } else if r > 228 && g > 228 && b > 228 {
                                pixels_above += 1;
                            }
                        }
                    }
                }
                brightness_score = brightness_score / ((width * height) as f32);
                if DEBUG {
                    println!(
                        "Processed Image: {:?}",
                        (input_image, pixels_below, pixels_above, brightness_score)
                    );
                }
                Ok((index, pixels_below, pixels_above, brightness_score))
            },
        )
        .collect();

    let mut sorted_array = pixel_counts?;
    sorted_array.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    if DEBUG {
        println!("Sorted Pixel Counts: {:?}", sorted_array);
    }
    let frame_counts: Vec<(u32, u32)> = sorted_array
        .iter()
        .map(|(_, pixels_below, pixels_above, _)| (*pixels_below, *pixels_above))
        .collect();

    let (start_index, end_index) =
        select_exposure_range(&frame_counts).ok_or_else(|| PipelineError::Processing {
            message: "merge_exposures: filter_images: no input images to select from".to_string(),
        })?;

    if DEBUG {
        println!("Selecting images: {}..={}", start_index, end_index);
    }

    for i in start_index..=end_index {
        filtered_images.push(input_images[sorted_array[i].0].clone());
    }
    Ok(filtered_images)
}

/// Selects the useful span of a bracketed sequence, per Pierson et al. 2019
/// section 2.4.2: from the darkest frame with no black pixels through the
/// lightest frame with no white pixels. Frames brighter than the start add no
/// shadow information the start does not already hold, and frames darker than
/// the end add no highlight information.
///
/// `frames` is `(pixels_below, pixels_above)` ordered brightest to darkest.
/// The returned range is inclusive at both ends.
fn select_exposure_range(frames: &[(u32, u32)]) -> Option<(usize, usize)> {
    let last = frames.len().checked_sub(1)?;

    // No frame free of black pixels means every exposure is clipped in shadow,
    // so keep them all from the brightest.
    let start = (0..=last)
        .filter(|&i| frames[i].0 == 0)
        .next_back()
        .unwrap_or(0);

    // No frame free of white pixels means every exposure is clipped in
    // highlight, so keep them all through the darkest.
    let end = (start..=last).find(|&i| frames[i].1 == 0).unwrap_or(last);

    Some((start, end))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn frames(below: &[u32], above: &[u32]) -> Vec<(u32, u32)> {
        below.iter().copied().zip(above.iter().copied()).collect()
    }

    #[test]
    fn selects_the_tutorial_band() {
        // A realistic 15 frame bracket, brightest first.
        let f = frames(
            &[
                0, 0, 0, 0, 0, 0, 0, 120, 900, 3000, 7000, 12000, 20000, 31000, 44000,
            ],
            &[
                41000, 29000, 18000, 9500, 4200, 1500, 400, 90, 12, 0, 0, 0, 0, 0, 0,
            ],
        );
        // Darkest frame with no black pixels is 6; lightest with no white is 9.
        assert_eq!(select_exposure_range(&f), Some((6, 9)));
    }

    #[test]
    fn keeps_every_bright_frame_when_none_is_free_of_black_pixels() {
        let f = frames(&[5, 9, 20, 30, 40], &[100, 50, 10, 0, 0]);
        assert_eq!(select_exposure_range(&f), Some((0, 3)));
    }

    #[test]
    fn keeps_every_dark_frame_when_none_is_free_of_white_pixels() {
        let f = frames(&[0, 0, 7, 20], &[100, 50, 10, 5]);
        assert_eq!(select_exposure_range(&f), Some((1, 3)));
    }

    #[test]
    fn single_frame_is_kept() {
        assert_eq!(select_exposure_range(&frames(&[0], &[0])), Some((0, 0)));
    }

    #[test]
    fn empty_input_selects_nothing() {
        assert_eq!(select_exposure_range(&[]), None);
    }

    fn spec_with_response(response_function: &str) -> CommandSpec {
        hdrgen_spec(
            PathBuf::from("/tools/hdrgen"),
            None,
            &["a.tiff".to_string(), "b.tiff".to_string()],
            response_function,
            "out.hdr",
        )
    }

    #[test]
    fn states_the_cache_size_rather_than_inheriting_it() {
        let spec = spec_with_response("");
        let position = spec
            .args
            .iter()
            .position(|arg| arg == "-m")
            .expect("expected an explicit cache size");

        assert_eq!(
            spec.args.get(position + 1).map(String::as_str),
            Some("1000")
        );
    }

    // A cache size read after the inputs would be a cache size that never
    // applied to them, so its position is part of the fix, not incidental.
    #[test]
    fn states_the_cache_size_before_the_first_input() {
        let spec = spec_with_response("");
        let cache = spec.args.iter().position(|arg| arg == "-m").unwrap();
        let first_input = spec.args.iter().position(|arg| arg == "a.tiff").unwrap();

        assert!(cache < first_input, "args were {:?}", spec.args);
    }

    #[test]
    fn passes_the_inputs_then_the_output_then_the_flags() {
        assert_eq!(
            spec_with_response("").args,
            vec!["-m", "1000", "a.tiff", "b.tiff", "-o", "out.hdr", "-a", "-e", "-f", "-g", "-F"],
        );
    }

    #[test]
    fn omits_the_response_flag_when_none_is_supplied() {
        assert!(!spec_with_response("").args.iter().any(|arg| arg == "-r"));
    }

    #[test]
    fn points_at_the_response_function_when_one_is_supplied() {
        let spec = spec_with_response("/calib/camera.rsp");
        let position = spec
            .args
            .iter()
            .position(|arg| arg == "-r")
            .expect("expected a response function flag");

        assert_eq!(
            spec.args.get(position + 1).map(String::as_str),
            Some("/calib/camera.rsp")
        );
    }

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!("hdricalibrationtool-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_a_square_response_hdrgen_can_read() {
        let dir = unique_temp_dir("square-response");
        let path =
            write_square_response(&dir).expect("expected the response function to be written");

        assert_eq!(path, dir.join("sqr.rsp").display().to_string());
        // One line per channel, each a polynomial of order 2 with a coefficient
        // of 1 for x^2.
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "2 1 0 0\n2 1 0 0\n2 1 0 0\n"
        );

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reports_where_the_square_response_could_not_be_written() {
        let missing = env::temp_dir().join("hdricalibrationtool-no-such-dir-for-sqr-rsp");
        fs::remove_dir_all(&missing).ok();

        let error = write_square_response(&missing).expect_err("expected a write failure");
        let PipelineError::Processing { message } = error else {
            panic!("expected a processing error");
        };
        assert!(message.contains("sqr.rsp"), "message was {message}");
    }
}
