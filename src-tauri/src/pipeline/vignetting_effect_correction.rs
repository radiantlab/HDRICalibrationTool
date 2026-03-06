use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn vignetting_effect_correction(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    vignetting_correction_cal: String,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("vignetting_effect_correction() was called with parameters:");
        println!("\tvignetting_correction_cal: {vignetting_correction_cal}");
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("pcomb"))
        .arg("-f")
        .arg(vignetting_correction_cal.as_str())
        .arg(input_file.as_str())
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
