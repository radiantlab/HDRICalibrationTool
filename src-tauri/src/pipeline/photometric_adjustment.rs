use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn photometric_adjustment(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    photometric_adjustment: String,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!(
            "photometric_adjustment() was called with parameters:\n\t photometric_adjustment: {photometric_adjustment}"
        );
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("pcomb"))
        .arg("-h")
        .arg("-f")
        .arg(photometric_adjustment.as_str())
        .arg(input_file.as_str())
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
