/// How an HDR-derived vertical illuminance compares to a measured one.
///
/// Thresholds are from Pierson et al. 2019 section 3.1: an error under 10
/// percent is expected, and an image with more than 25 percent should be
/// rejected as a luminance map.
#[derive(Debug, PartialEq)]
pub enum ValidityOutcome {
    Pass { error_pct: f64 },
    AboveExpected { error_pct: f64 },
    Failed { error_pct: f64 },
}

pub fn evaluate_validity(ev_hdr: f64, ev_measured: f64) -> Option<ValidityOutcome> {
    if !ev_measured.is_finite() || ev_measured <= 0.0 || !ev_hdr.is_finite() {
        return None;
    }

    let error_pct = (ev_hdr - ev_measured).abs() / ev_measured * 100.0;

    Some(if error_pct > 25.0 {
        ValidityOutcome::Failed { error_pct }
    } else if error_pct > 10.0 {
        ValidityOutcome::AboveExpected { error_pct }
    } else {
        ValidityOutcome::Pass { error_pct }
    })
}

pub fn validity_message(outcome: &ValidityOutcome, ev_hdr: f64, ev_measured: f64) -> String {
    match outcome {
        ValidityOutcome::Failed { error_pct } => format!(
            "Validity check FAILED: HDR-derived vertical illuminance {ev_hdr:.1} lux vs measured \
             {ev_measured:.1} lux ({error_pct:.1}% error). The tutorial recommends rejecting HDR \
             images with more than 25% error (Pierson et al. 2019, section 3.1)."
        ),
        ValidityOutcome::AboveExpected { error_pct } => format!(
            "Validity check: HDR-derived vertical illuminance {ev_hdr:.1} lux vs measured \
             {ev_measured:.1} lux ({error_pct:.1}% error), above the 10% typically expected."
        ),
        ValidityOutcome::Pass { error_pct } => {
            format!("Validity check passed ({error_pct:.1}% error).")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn under_ten_percent_passes() {
        assert!(matches!(
            evaluate_validity(1050.0, 1000.0),
            Some(ValidityOutcome::Pass { .. })
        ));
    }

    #[test]
    fn between_ten_and_twentyfive_percent_is_above_expected() {
        assert!(matches!(
            evaluate_validity(1150.0, 1000.0),
            Some(ValidityOutcome::AboveExpected { .. })
        ));
    }

    #[test]
    fn over_twentyfive_percent_fails() {
        match evaluate_validity(1260.0, 1000.0) {
            Some(ValidityOutcome::Failed { error_pct }) => {
                assert!((error_pct - 26.0).abs() < 1e-9);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn underestimates_are_measured_the_same_way() {
        assert!(matches!(
            evaluate_validity(740.0, 1000.0),
            Some(ValidityOutcome::Failed { .. })
        ));
    }

    #[test]
    fn a_non_positive_measurement_yields_nothing() {
        assert_eq!(evaluate_validity(1000.0, 0.0), None);
        assert_eq!(evaluate_validity(1000.0, -5.0), None);
    }
}
