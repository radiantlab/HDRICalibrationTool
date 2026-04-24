use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn neutral_density(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    neutral_density: String,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!(
            "neutral_density() was called with parameters:\n\t neutral_density: {neutral_density}"
        );
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("pcomb"))
        .arg("-f")
        .arg(neutral_density.as_str())
        .arg(input_file.as_str())
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
