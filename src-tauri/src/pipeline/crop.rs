use std::path::{Path, PathBuf};

use crate::command::{run_with_io, CommandSpec, SystemCommandRunner};

use super::picture::read_resolution;
use super::{ConfigSettings, PipelineError, DEBUG};

pub fn crop(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    diameter: f64,
    xleft: f64,
    ytop: f64,
) -> Result<PathBuf, PipelineError> {
    if DEBUG {
        println!("crop() was called with parameters:");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tytop: {ytop}");
    }

    let (_width, height) = read_resolution(Path::new(&input_file))?;

    let spec = crop_spec(
        &config_settings.radiance_path,
        &input_file,
        &output_file,
        diameter,
        xleft,
        ytop,
        height,
    )?;

    run_with_io(&spec, &SystemCommandRunner)?;

    Ok(PathBuf::from(output_file))
}

/// `ytop` is the distance from the top of the image to the top of the
/// circumscribed square, which is what the lens-mask overlay produces and what
/// `filter_images` masks with. `pcompos` measures its y offset from the bottom.
/// The two conventions are reconciled here and nowhere else.
fn crop_spec(
    radiance_path: &Path,
    input_file: &str,
    output_file: &str,
    diameter: f64,
    xleft: f64,
    ytop: f64,
    image_height: u32,
) -> Result<CommandSpec, PipelineError> {
    let ydown = f64::from(image_height) - (ytop + diameter);

    if ytop < 0.0 || ydown < 0.0 {
        return Err(PipelineError::InvalidInput {
            field: "ytop".to_string(),
            value: format!(
                "{ytop} with diameter {diameter} does not fit in an image {image_height} px tall"
            ),
        });
    }

    Ok(CommandSpec::new(radiance_path.join("pcompos"))
        .arg("-x")
        .arg(diameter.to_string())
        .arg("-y")
        .arg(diameter.to_string())
        .arg(input_file)
        .arg(format!("-{xleft}"))
        .arg(format!("-{ydown}"))
        .stdout_file(output_file))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn radiance() -> PathBuf {
        PathBuf::from("/radiance/bin")
    }

    #[test]
    fn converts_top_offset_to_bottom_offset() {
        // 4x8 picture, 4px circle flush with the top: pcompos must be told 4,
        // which is the offset that selects the top half.
        let spec = crop_spec(&radiance(), "in.hdr", "out.hdr", 4.0, 0.0, 0.0, 8).unwrap();
        assert_eq!(spec.args, vec!["-x", "4", "-y", "4", "in.hdr", "-0", "-4"]);
    }

    #[test]
    fn centred_mask_is_unchanged() {
        // 3744 tall, 3612 circle, centred: 66 from the top is also 66 from the
        // bottom, so existing centred setups produce identical output.
        let spec =
            crop_spec(&radiance(), "in.hdr", "out.hdr", 3612.0, 1019.0, 66.0, 3744).unwrap();
        assert_eq!(spec.args.last().unwrap(), "-66");
    }

    #[test]
    fn rejects_a_mask_past_the_bottom_edge() {
        let error = crop_spec(&radiance(), "in.hdr", "out.hdr", 4.0, 0.0, 5.0, 8).unwrap_err();
        match error {
            PipelineError::InvalidInput { field, .. } => assert_eq!(field, "ytop"),
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn rejects_a_negative_top_offset() {
        let error = crop_spec(&radiance(), "in.hdr", "out.hdr", 4.0, 0.0, -1.0, 8).unwrap_err();
        assert!(matches!(error, PipelineError::InvalidInput { .. }));
    }
}
