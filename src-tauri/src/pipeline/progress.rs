/// Counts pipeline stages and reports completion as a percentage.
///
/// This replaces a hand-incremented counter compared against a hardcoded
/// total, which had drifted out of step: six increments against a total of
/// five, so the bar reported 120 percent.
pub struct StepProgress {
    current: usize,
    total: usize,
}

impl StepProgress {
    pub fn new(total: usize) -> Self {
        Self { current: 0, total }
    }

    pub fn advance(&mut self) -> i32 {
        self.current += 1;
        self.percent()
    }

    pub fn percent(&self) -> i32 {
        if self.total == 0 {
            return 100;
        }
        let ratio = self.current as f64 / self.total as f64;
        (ratio.min(1.0) * 100.0) as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_at_zero() {
        assert_eq!(StepProgress::new(7).percent(), 0);
    }

    #[test]
    fn reaches_exactly_one_hundred_on_the_last_step() {
        let mut progress = StepProgress::new(7);
        let mut last = 0;
        for _ in 0..7 {
            last = progress.advance();
        }
        assert_eq!(last, 100);
    }

    #[test]
    fn never_exceeds_one_hundred_when_over_advanced() {
        let mut progress = StepProgress::new(7);
        for _ in 0..20 {
            progress.advance();
        }
        assert_eq!(progress.percent(), 100);
    }

    #[test]
    fn set_fields_are_omitted_when_absent() {
        let payload = crate::pipeline::PipelineStatusPayload {
            kind: crate::pipeline::PipelineStatusKind::Step,
            progress: None,
            step: Some("merge_exposures".to_string()),
            message: None,
            set_index: None,
            set_total: None,
        };
        let json = serde_json::to_string(&payload).expect("serialises");
        assert!(!json.contains("set_index"));
    }

    #[test]
    fn set_fields_are_present_when_supplied() {
        let payload = crate::pipeline::PipelineStatusPayload {
            kind: crate::pipeline::PipelineStatusKind::Step,
            progress: None,
            step: None,
            message: Some("Processing set 2 of 3".to_string()),
            set_index: Some(2),
            set_total: Some(3),
        };
        let json = serde_json::to_string(&payload).expect("serialises");
        assert!(json.contains("\"set_index\":2"));
        assert!(json.contains("\"set_total\":3"));
    }

    #[test]
    fn a_zero_total_does_not_divide_by_zero() {
        let mut progress = StepProgress::new(0);
        assert_eq!(progress.advance(), 100);
    }
}
