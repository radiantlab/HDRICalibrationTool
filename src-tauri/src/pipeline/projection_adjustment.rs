use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn projection_adjustment(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    fisheye_correction_cal: String,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("projection_adjustment() was called with parameters:");
        println!("\tfisheye_correction_cal: {fisheye_correction_cal}");
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("pcomb"))
        .arg("-f")
        .arg(fisheye_correction_cal.as_str())
        .arg(input_file.as_str())
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
