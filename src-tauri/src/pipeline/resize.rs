use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn resize(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    xdim: f64,
    ydim: f64,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("resize() was called with parameters:");
        println!("\txdim: {xdim}");
        println!("\tydim: {ydim}");
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("pfilt"))
        .arg("-1")
        .arg("-x")
        .arg(xdim.to_string())
        .arg("-y")
        .arg(ydim.to_string())
        .arg(input_file.as_str())
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
