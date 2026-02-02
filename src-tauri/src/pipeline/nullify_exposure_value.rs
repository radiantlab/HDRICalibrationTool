use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn nullify_exposure_value(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("nullify_exposure_value was called!");
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("ra_xyze"))
        .arg("-r")
        .arg("-o")
        .arg(input_file.as_str())
        .arg(output_file.as_str())
        .inherit_stdout();

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
