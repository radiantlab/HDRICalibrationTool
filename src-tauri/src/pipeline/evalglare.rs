use std::path::Path;

use crate::command::{run_with_io, CommandError, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub struct EvalglareResult {
    pub value: String,
    pub warning: Option<String>,
}

/// evalglare only accepts an angular fisheye view. `-vtv` is rejected outright
/// with "invalid view specified", which is why the pipeline skips this step for
/// a non-fisheye projection rather than passing the flag through.
fn evalglare_spec(
    radiance_path: &Path,
    input_file: &str,
    projection: &str,
    vertical_angle: f64,
    horizontal_angle: f64,
) -> CommandSpec {
    CommandSpec::new(radiance_path.join("evalglare"))
        .arg(format!("-{projection}"))
        .arg("-vv")
        .arg(vertical_angle.to_string())
        .arg("-vh")
        .arg(horizontal_angle.to_string())
        .arg("-V")
        .arg(input_file)
        .capture_stdout()
}

pub fn evalglare(
    config_settings: &ConfigSettings,
    input_file: String,
    projection: &str,
    vertical_angle: f64,
    horizontal_angle: f64,
) -> Result<EvalglareResult, PipelineError> {
    if DEBUG {
        println!("evalglare() was called.");
    }

    let spec = evalglare_spec(
        &config_settings.radiance_path,
        &input_file,
        projection,
        vertical_angle,
        horizontal_angle,
    );

    match run_with_io(&spec, &SystemCommandRunner) {
        Ok(output) => Ok(EvalglareResult {
            value: output.stdout,
            warning: None,
        }),
        Err(error) => match error {
            CommandError::NonZeroExit {
                program,
                args,
                status_code,
                stdout,
                stderr,
            } => {
                if !stdout.trim().is_empty() {
                    Ok(EvalglareResult {
                        value: stdout,
                        warning: None,
                    })
                } else {
                    Err(PipelineError::Command {
                        error: CommandError::NonZeroExit {
                            program,
                            args,
                            status_code,
                            stdout,
                            stderr,
                        },
                    })
                }
            }
            other => Err(PipelineError::Command { error: other }),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn builds_the_requested_projection() {
        let spec = evalglare_spec(&PathBuf::from("/radiance/bin"), "in.hdr", "vth", 186.0, 186.0);
        assert_eq!(
            spec.args,
            vec!["-vth", "-vv", "186", "-vh", "186", "-V", "in.hdr"]
        );
    }

    #[test]
    fn defaults_stay_equidistant() {
        let spec = evalglare_spec(&PathBuf::from("/radiance/bin"), "in.hdr", "vta", 180.0, 180.0);
        assert_eq!(spec.args[0], "-vta");
    }
}
