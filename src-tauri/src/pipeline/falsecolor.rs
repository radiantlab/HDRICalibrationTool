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
            luminance_args.legend_width,
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
            .args(falsecolor_args(luminance_args))
            .arg(input_file.as_str());
    }

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}

/// falsecolor is a Perl script that matches its options by substring, so `-lw`
/// and `-lh` have to be separate arguments each followed by its own numeric
/// value. Passing "-lw/-lh" matched `-lw` and swallowed the pair of dimensions
/// as a single non-numeric width, which falsecolor then discarded along with
/// the whole legend.
fn falsecolor_args(luminance_args: &LuminanceArgs) -> Vec<String> {
    let mut args = vec![
        "-s".to_string(),
        luminance_args.scale_limit.clone(),
        "-l".to_string(),
        luminance_args.scale_label.clone(),
        "-n".to_string(),
        luminance_args.scale_levels.clone(),
        "-e".to_string(),
    ];

    let width = luminance_args.legend_width.trim().parse::<u32>();
    let height = luminance_args.legend_height.trim().parse::<u32>();
    if let (Ok(width), Ok(height)) = (width, height) {
        if width > 0 && height > 0 {
            args.push("-lw".to_string());
            args.push(width.to_string());
            args.push("-lh".to_string());
            args.push(height.to_string());
        }
    }

    args.push("-i".to_string());
    args
}

fn path_separator() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(width: &str, height: &str) -> LuminanceArgs {
        LuminanceArgs {
            scale_limit: "1000".to_string(),
            scale_label: "cd/m2".to_string(),
            scale_levels: "8".to_string(),
            legend_width: width.to_string(),
            legend_height: height.to_string(),
        }
    }

    #[test]
    fn passes_legend_dimensions_as_two_options() {
        let spec = falsecolor_args(&args("100", "200"));
        let joined = spec.join(" ");
        assert!(joined.contains("-lw 100 -lh 200"), "got {joined}");
        assert!(!joined.contains("-lw/-lh"));
    }

    #[test]
    fn omits_the_legend_when_a_dimension_is_missing() {
        let spec = falsecolor_args(&args("", "200"));
        assert!(!spec.iter().any(|arg| arg == "-lw" || arg == "-lh"));
    }

    #[test]
    fn omits_the_legend_when_a_dimension_is_not_numeric() {
        let spec = falsecolor_args(&args("100 200", ""));
        assert!(!spec.iter().any(|arg| arg == "-lw"));
    }
}
