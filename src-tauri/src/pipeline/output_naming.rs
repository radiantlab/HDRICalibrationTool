/// Long enough for a descriptive directory name, short enough that the stem
/// plus the timestamp and the `_fc.hdr` suffix stays well inside the 255-byte
/// filename limit every filesystem the app targets imposes.
const MAX_SET_NAME: usize = 64;

/// Builds the stem that one run's outputs share.
///
/// The set name arrives from the frontend and becomes part of a filename, so it
/// is sanitised here, where the file is written, rather than trusted from the
/// caller. Everything outside an ASCII-safe set becomes an underscore, which
/// leaves no path separator, no parent reference and no drive letter for a name
/// to escape the output directory with.
///
/// A run with no set name keeps the plain `<datetime>` stem, so a single scene
/// is named exactly as it was before batches existed.
pub fn output_stem(set_name: &str, datetime: &str) -> String {
    let sanitised = sanitise_set_name(set_name);
    if sanitised.is_empty() {
        datetime.to_string()
    } else {
        format!("{sanitised}_{datetime}")
    }
}

/// What the console shows when one run ends.
///
/// A batch calls the pipeline command once per set, so a bare "Pipeline
/// complete." would appear after the first of ten sets and read as though the
/// whole batch had finished. The raw name is used here rather than the
/// sanitised one: this is a sentence, not a path.
pub fn completion_message(set_name: &str) -> String {
    let trimmed = set_name.trim();
    if trimmed.is_empty() {
        "Pipeline complete.".to_string()
    } else {
        format!("Finished {trimmed}.")
    }
}

/// Dots are replaced along with everything else. It costs a directory named
/// `2026.07.28` its dots, and in exchange there is no `..` left to reason
/// about. Non-ASCII letters go the same way: a name is a filename here, not a
/// label, and the label the user sees comes from the frontend.
fn sanitise_set_name(set_name: &str) -> String {
    let replaced: String = set_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    // Trimmed before truncating so a leading run of separators does not eat the
    // budget, and after so truncation cannot leave a trailing underscore.
    let truncated: String = replaced
        .trim_matches('_')
        .chars()
        .take(MAX_SET_NAME)
        .collect();
    truncated.trim_matches('_').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const DATETIME: &str = "2026-07-28_14-30-00";

    #[test]
    fn a_named_set_leads_the_stem() {
        assert_eq!(
            output_stem("kitchen", DATETIME),
            format!("kitchen_{DATETIME}")
        );
    }

    #[test]
    fn an_empty_name_keeps_the_single_scene_stem() {
        assert_eq!(output_stem("", DATETIME), DATETIME);
    }

    #[test]
    fn a_name_with_nothing_usable_in_it_keeps_the_single_scene_stem() {
        assert_eq!(output_stem("///", DATETIME), DATETIME);
        assert_eq!(output_stem("   ", DATETIME), DATETIME);
    }

    #[test]
    fn a_traversing_name_cannot_escape_the_output_directory() {
        let stem = output_stem("../../etc/passwd", DATETIME);

        assert!(!stem.contains('/'));
        assert!(!stem.contains(".."));

        let output_dir = Path::new("/tmp/hdri-output");
        let written = output_dir.join(format!("{stem}.hdr"));
        assert_eq!(written.parent(), Some(output_dir));
    }

    #[test]
    fn a_windows_traversing_name_cannot_escape_either() {
        let stem = output_stem("..\\..\\Windows", DATETIME);

        assert!(!stem.contains('\\'));
        assert_eq!(stem, format!("Windows_{DATETIME}"));
    }

    #[test]
    fn a_long_name_is_truncated() {
        let stem = output_stem(&"a".repeat(200), DATETIME);

        assert_eq!(stem, format!("{}_{DATETIME}", "a".repeat(64)));
    }

    #[test]
    fn an_unnamed_run_reports_the_pipeline_finishing() {
        assert_eq!(completion_message(""), "Pipeline complete.");
    }

    #[test]
    fn a_named_run_reports_which_set_finished() {
        assert_eq!(completion_message("kitchen"), "Finished kitchen.");
    }
}
