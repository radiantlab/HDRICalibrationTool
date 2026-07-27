use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use super::PipelineError;

/// Returns the `(width, height)` of a Radiance picture in pixels.
///
/// The header is ASCII and ends at the first empty line; the resolution line
/// follows it. Only the standard `-Y <rows> +X <cols>` orientation is accepted,
/// because a crop offset computed against the wrong row order is silently wrong
/// rather than loudly broken.
pub fn read_resolution(path: &Path) -> Result<(u32, u32), PipelineError> {
    let file = File::open(path).map_err(|error| PipelineError::Processing {
        message: format!("read_resolution: failed to open {}: {error}", path.display()),
    })?;
    let mut reader = BufReader::new(file);

    loop {
        match read_line_lossy(&mut reader, path)? {
            None => {
                return Err(PipelineError::Processing {
                    message: format!(
                        "read_resolution: {} ended before the end of its header",
                        path.display()
                    ),
                })
            }
            Some(line) if line.trim().is_empty() => break,
            Some(_) => {}
        }
    }

    let resolution =
        read_line_lossy(&mut reader, path)?.ok_or_else(|| PipelineError::Processing {
            message: format!(
                "read_resolution: {} ended before its resolution line",
                path.display()
            ),
        })?;

    parse_resolution(resolution.trim(), path)
}

fn read_line_lossy(
    reader: &mut BufReader<File>,
    path: &Path,
) -> Result<Option<String>, PipelineError> {
    let mut buffer = Vec::new();
    let read = reader
        .read_until(b'\n', &mut buffer)
        .map_err(|error| PipelineError::Processing {
            message: format!("read_resolution: failed to read {}: {error}", path.display()),
        })?;
    if read == 0 {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&buffer).into_owned()))
}

fn parse_resolution(line: &str, path: &Path) -> Result<(u32, u32), PipelineError> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if let ["-Y", rows, "+X", cols] = parts.as_slice() {
        if let (Ok(rows), Ok(cols)) = (rows.parse::<u32>(), cols.parse::<u32>()) {
            return Ok((cols, rows));
        }
    }
    Err(PipelineError::Processing {
        message: format!(
            "read_resolution: {} has resolution line {line:?}; only the standard \
             \"-Y <rows> +X <cols>\" orientation is supported",
            path.display()
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn write_picture(label: &str, bytes: &[u8]) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("hdri-picture-{label}-{nanos}.hdr"));
        fs::write(&path, bytes).expect("failed to write test picture");
        path
    }

    #[test]
    fn reads_standard_orientation() {
        let path = write_picture(
            "standard",
            b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8 +X 4\n\x80\x80\x80\x80",
        );
        assert_eq!(read_resolution(&path).unwrap(), (4, 8));
    }

    #[test]
    fn rejects_non_standard_orientation() {
        let path = write_picture(
            "flipped",
            b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+Y 8 +X 4\n\x80\x80\x80\x80",
        );
        let error = read_resolution(&path).unwrap_err();
        assert!(format!("{error:?}").contains("+Y 8 +X 4"));
    }

    #[test]
    fn rejects_header_without_terminator() {
        let path = write_picture("truncated", b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n");
        assert!(read_resolution(&path).is_err());
    }
}
