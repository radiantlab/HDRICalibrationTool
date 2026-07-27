/// The most constants named in a warning before it stops being readable.
const MAX_REPORTED_CONSTANTS: usize = 8;

/// The smallest numeric literal treated as a candidate pixel coordinate.
const PIXEL_SCALE_THRESHOLD: f64 = 100.0;

/// Returns `None` when a `.cal` file derives its geometry from the picture, and
/// `Some(constants)` when it cannot, listing the numeric literals large enough
/// to be pixel coordinates.
///
/// A file that mentions `xres` or `yres` adapts to whatever resolution it is
/// handed. One that does not was calibrated for a fixed resolution, and the
/// tutorial (section 2.5.2) warns that cropping or resizing invalidates it.
///
/// Both geometric `.cal` files are user-supplied, derived per camera and lens
/// during the one-time setup, so this checks the file's content and never which
/// input slot it arrived in.
pub fn resolution_dependent_constants(text: &str) -> Option<Vec<f64>> {
    if text.contains("xres") || text.contains("yres") {
        return None;
    }

    let mut constants: Vec<f64> = Vec::new();
    for fragment in text.split(|c: char| !(c.is_ascii_digit() || c == '.')) {
        if fragment.is_empty() {
            continue;
        }
        if let Ok(value) = fragment.parse::<f64>() {
            if value >= PIXEL_SCALE_THRESHOLD && !constants.contains(&value) {
                constants.push(value);
            }
        }
    }
    constants.truncate(MAX_REPORTED_CONSTANTS);

    Some(constants)
}

pub fn cal_warning(label: &str, path: &str, width: u32, height: u32, constants: &[f64]) -> String {
    let listed = if constants.is_empty() {
        "no pixel-scale constants were found, so check it by hand".to_string()
    } else {
        format!(
            "it contains the constants {}",
            constants
                .iter()
                .map(|value| format!("{value}"))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    format!(
        "The {label} calibration file {path} does not reference xres/yres, so it cannot adapt to \
         the working resolution. The image is {width}x{height} at this step and {listed}. If those \
         are pixel coordinates calibrated for a different resolution, the correction will be \
         applied about the wrong centre."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const VIGNETTING: &str = "sq(x)=x*x;\n\
        r=sqrt(sq(x-500)+sq(y-500))/500;\n\
        sf=(1/(((-0.528613562104476)*(r^4))+((0.1755458928191)*(r^2))+1));\n\
        ro=sf*ri(1);\n";

    const FISHEYE: &str = "xc : xres/2;\nyc : yres/2;\n\
        inp_r = sqrt(sq((x-xc)/xres) + sq((y-yc)/yres));\n";

    #[test]
    fn flags_a_file_with_hardcoded_pixel_constants() {
        assert_eq!(resolution_dependent_constants(VIGNETTING), Some(vec![500.0]));
    }

    #[test]
    fn clears_a_file_that_uses_xres_and_yres() {
        assert_eq!(resolution_dependent_constants(FISHEYE), None);
    }

    #[test]
    fn ignores_small_numbers() {
        assert_eq!(
            resolution_dependent_constants("ro=ri(1)*1.18;\n"),
            Some(Vec::new())
        );
    }

    #[test]
    fn caps_the_reported_constants() {
        let text = (100..120)
            .map(|n| format!("a{n}=xy-{n}00;"))
            .collect::<String>();
        assert_eq!(
            resolution_dependent_constants(&text).unwrap().len(),
            MAX_REPORTED_CONSTANTS
        );
    }

    #[test]
    fn message_names_the_file_and_the_resolution() {
        let message = cal_warning("vignetting", "/cal/vignetting.cal", 900, 900, &[500.0]);
        assert!(message.contains("vignetting.cal"));
        assert!(message.contains("900x900"));
        assert!(message.contains("500"));
    }
}
