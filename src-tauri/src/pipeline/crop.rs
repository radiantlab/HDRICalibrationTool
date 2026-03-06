use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn crop(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    diameter: f64,
    xleft: f64,
    ydown: f64,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("crop() was called with parameters:");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("pcompos"))
        .arg("-x")
        .arg(diameter.to_string())
        .arg("-y")
        .arg(diameter.to_string())
        .arg(input_file.as_str())
        .arg(format!("-{xleft}"))
        .arg(format!("-{ydown}"))
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
