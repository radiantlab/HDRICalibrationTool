use std::path::{Path, PathBuf};

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::{ConfigSettings, PipelineError, DEBUG};

/// The view information written into a Radiance picture header.
pub struct ViewArgs {
    pub projection: String,
    pub vertical_angle: f64,
    pub horizontal_angle: f64,
}

/// Appends header entries with `getinfo -a`.
///
/// The pipeline calls this twice: once before evalglare to write the view
/// information evalglare reads out of the header, and once afterwards to record
/// the results. Only the first call passes `view`, so the finished picture
/// carries exactly one `VIEW=` line.
pub fn header_editing(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    view: Option<ViewArgs>,
    evalglare_value: Option<String>,
    measured_illuminance: Option<String>,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("header_editing() was called.");
    }

    let spec = header_editing_spec(
        &config_settings.radiance_path,
        &input_file,
        &output_file,
        view.as_ref(),
        evalglare_value.as_deref(),
        measured_illuminance.as_deref(),
    );

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}

fn header_editing_spec(
    radiance_path: &Path,
    input_file: &str,
    output_file: &str,
    view: Option<&ViewArgs>,
    evalglare_value: Option<&str>,
    measured_illuminance: Option<&str>,
) -> CommandSpec {
    // `getinfo -a` appends every remaining argument to the header as its own
    // line. It is not a flag parser, so anything passed here that looks like an
    // option lands in the picture verbatim.
    let mut spec = CommandSpec::new(radiance_path.join("getinfo")).arg("-a");

    if let Some(view) = view {
        spec = spec.arg(format!(
            "VIEW= -{} -vv {} -vh {}",
            view.projection, view.vertical_angle, view.horizontal_angle
        ));
    }

    // evalglare prints its value with a trailing newline. getinfo happens to
    // normalise that, but the entry is built here so it does not have to.
    if let Some(value) = evalglare_value {
        spec = spec.arg(format!("COMPUTED_VERTICAL_ILLUMINANCE={}", value.trim()));
    }

    if let Some(value) = measured_illuminance {
        spec = spec.arg(format!("MEASURED_VERTICAL_ILLUMINANCE={}", value.trim()));
    }

    spec.stdin_file(input_file).stdout_file(output_file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn radiance() -> PathBuf {
        PathBuf::from("/radiance/bin")
    }

    fn view() -> ViewArgs {
        ViewArgs {
            projection: "vta".to_string(),
            vertical_angle: 180.0,
            horizontal_angle: 180.0,
        }
    }

    #[test]
    fn first_call_writes_only_the_view() {
        let spec = header_editing_spec(&radiance(), "in.hdr", "out.hdr", Some(&view()), None, None);
        assert_eq!(spec.args, vec!["-a", "VIEW= -vta -vv 180 -vh 180"]);
    }

    #[test]
    fn second_call_writes_no_view_and_no_dash_c() {
        let spec = header_editing_spec(
            &radiance(),
            "in.hdr",
            "out.hdr",
            None,
            Some("297.230100\n"),
            None,
        );
        assert_eq!(spec.args, vec!["-a", "COMPUTED_VERTICAL_ILLUMINANCE=297.230100"]);
        assert!(!spec.args.iter().any(|arg| arg == "-c"));
        assert!(!spec.args.iter().any(|arg| arg.contains("VIEW=")));
    }

    #[test]
    fn records_both_illuminances() {
        let spec = header_editing_spec(
            &radiance(),
            "in.hdr",
            "out.hdr",
            None,
            Some("297.23"),
            Some(" 1240 "),
        );
        assert_eq!(
            spec.args,
            vec![
                "-a",
                "COMPUTED_VERTICAL_ILLUMINANCE=297.23",
                "MEASURED_VERTICAL_ILLUMINANCE=1240",
            ]
        );
    }

    #[test]
    fn honours_the_projection() {
        let mut args = view();
        args.projection = "vth".to_string();
        let spec = header_editing_spec(&radiance(), "in.hdr", "out.hdr", Some(&args), None, None);
        assert_eq!(spec.args[1], "VIEW= -vth -vv 180 -vh 180");
    }
}
