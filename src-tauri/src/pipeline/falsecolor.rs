use std::env;
use std::path::PathBuf;

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, LuminanceArgs, PipelineError, DEBUG};

pub fn falsecolor(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    luminance_args: &LuminanceArgs,
) -> Result<PathBuf, PipelineError> {
    let radiance_root = config_settings
        .radiance_path
        .parent()
        .unwrap_or(&config_settings.radiance_path);

    let raypath = if cfg!(target_os = "windows") {
        format!(r"{}\lib", radiance_root.display())
    } else {
        format!("{}/lib", radiance_root.display())
    };

    if DEBUG {
        println!(
            "falsecolor() was called with parameters:\n\t {},\n\t {},\n\t {},\n\t {}\n",
            luminance_args.scale_limit,
            luminance_args.scale_label,
            luminance_args.scale_levels,
            luminance_args.legend_dimensions,
        );
    }

    let env_path = env::var("PATH").map_err(|error| PipelineError::Processing {
        message: format!("falsecolor: PATH environment variable unavailable: {error}"),
    })?;

    let mut spec = CommandSpec::new(config_settings.radiance_path.join("falsecolor"))
        .env("RAYPATH", raypath)
        .env(
            "PATH",
            format!(
                "{}{}{}",
                config_settings.radiance_path.to_string_lossy(),
                path_separator(),
                env_path
            ),
        )
        .stdout_file(output_file.as_str());

    if luminance_args.scale_label.is_empty() {
        spec = spec.arg("-e").arg("-i").arg(input_file.as_str());
    } else {
        spec = spec
            .arg("-s")
            .arg(luminance_args.scale_limit.as_str())
            .arg("-l")
            .arg(luminance_args.scale_label.as_str())
            .arg("-n")
            .arg(luminance_args.scale_levels.as_str())
            .arg("-e")
            .arg("-lw/-lh")
            .arg(luminance_args.legend_dimensions.as_str())
            .arg("-i")
            .arg(input_file.as_str());
    }

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}

fn path_separator() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}
