use crate::command::{run_with_io, CommandError, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

pub struct EvalglareResult {
    pub value: String,
    pub warning: Option<String>,
}

pub fn evalglare(
    config_settings: &ConfigSettings,
    input_file: String,
    vertical_angle: f64,
    horizontal_angle: f64,
) -> Result<EvalglareResult, PipelineError> {
    if DEBUG {
        println!("evalglare() was called.");
    }

    let spec = CommandSpec::new(config_settings.radiance_path.join("evalglare"))
        .arg("-vta")
        .arg("-vv")
        .arg(vertical_angle.to_string())
        .arg("-vh")
        .arg(horizontal_angle.to_string())
        .arg("-V")
        .arg(input_file.as_str())
        .capture_stdout();

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
