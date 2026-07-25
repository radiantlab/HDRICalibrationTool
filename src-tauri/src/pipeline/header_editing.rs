use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub fn header_editing(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    vertical_angle: f64,
    horizontal_angle: f64,
    evalglare_value: Option<String>,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("header_editing() was called with parameters:");
        println!("\tvertical_angle: {vertical_angle}");
        println!("\thorizontal_angle: {horizontal_angle}");
    }

    let view_arg = format!("VIEW= -vta -vv {} -vh {}", vertical_angle, horizontal_angle);

    let mut spec = CommandSpec::new(config_settings.radiance_path.join("getinfo"))
        .arg("-a")
        .arg(view_arg);

    // evalglare needs the VIEW angles already written into the header to
    // evaluate correctly, so this function is called once beforehand
    // without a value, and again afterward to record it.
    if let Some(evalglare_value) = evalglare_value {
        let illuminance_arg = format!("PHOTOPIC_ILLUMINANCE={}", evalglare_value);
        spec = spec.arg("-c").arg(illuminance_arg);
    }

    let spec = spec
        .stdin_file(input_file.as_str())
        .stdout_file(output_file.as_str());

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}
