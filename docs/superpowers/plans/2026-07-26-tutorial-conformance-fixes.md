# Tutorial Conformance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the HDR pipeline into conformance with the Pierson et al. (2019) tutorial by fixing the mirrored crop, the inert exposure selection, the polluted picture header, the hardcoded projection type, the uncomputed validity check, silent `.cal` resolution mismatches, and the malformed falsecolor legend arguments.

**Architecture:** Each Radiance stage keeps its current shape (a function that builds a `CommandSpec` and hands it to `run_with_io`), but the argument construction is extracted into a pure, private `*_spec` function so the exact argv can be asserted in a unit test without Radiance installed. Coordinate conversion, exposure-range selection, validity evaluation and `.cal` inspection likewise become pure functions with their own tests. The frontend gains one extracted pure function, `buildPipelineParams`, so the IPC payload can be tested without rendering.

**Tech Stack:** Rust 2021 + Tauri v2 (`src-tauri`), Next.js 15 + React + react-hook-form + Tailwind (`src`), Jest + Testing Library (`__tests__`), WebdriverIO (`e2e-tests`).

**Source spec:** `docs/superpowers/specs/2026-07-26-tutorial-conformance-fixes.md`. Read the issue it names before starting each task; this plan gives the code, the spec gives the reasoning and the proof.

## Global Constraints

- **No new Rust crates.** `src-tauri/Cargo.toml` has no `regex`; all parsing uses `std`.
- **No new npm dependencies.** There is no `@radix-ui/react-select`; the projection selector uses a native `<select>` styled to match the existing `Input`.
- **Rust test command:** `cd src-tauri && cargo test`. This crate has **no lib target** (`cargo test --lib` fails with "no library targets found"); tests live in `#[cfg(test)] mod tests` blocks compiled into the binary. Filter with `cargo test <module>::tests`. Cold build is about 19 seconds.
- **JS test command:** `npm test` (Jest, jsdom). Single file: `npm test -- <path>`.
- **Lint command:** `npm run check` (ultracite/biome). Run before each commit that touches `src/`.
- **e2e is not a gate for this work.** `npm run test:e2e` fixtures and goldens are unverified (see Task 4). Do not use a green or red e2e run as evidence for any task here.
- **Tauri v2 converts camelCase payload keys to snake_case command parameters automatically.** `ytop` maps to `ytop`, `measuredVerticalIlluminance` maps to `measured_vertical_illuminance`. Renaming a `#[tauri::command]` parameter without renaming the payload key compiles cleanly and fails at runtime.
- **Follow the existing test style** in `src-tauri/src/command.rs:233-338`: a `#[cfg(test)] mod tests` block, `use super::*`, plain `#[test]` functions, and a locally defined unique temp path helper where files are needed.
- **`ConfigSettings` fields are private to the `pipeline` module.** Tests inside `pipeline::<child>::tests` can construct it because they are descendants of the defining module.
- **Prose in comments and messages uses no em dashes.**

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src-tauri/src/pipeline/picture.rs` | Read the pixel dimensions of a Radiance picture. |
| `src-tauri/src/pipeline/validity.rs` | Compare HDR-derived and measured vertical illuminance, classify the result. |
| `src-tauri/src/pipeline/cal_check.rs` | Detect `.cal` files that cannot adapt to the working resolution. |
| `src/app/home-page/build-pipeline-params.ts` | Build the pipeline IPC payload from form data. Pure. |
| `src/components/ui/select-input.tsx` | Native `<select>` styled to match `Input`. |
| `__tests__/build-pipeline-params.test.ts` | Tests for the payload builder. |

**Modified files:** `src-tauri/src/pipeline.rs`, `src-tauri/src/pipeline/{crop,merge_exposures,header_editing,evalglare,falsecolor}.rs`, `src/app/home-page/page.tsx`, `src/app/home-page/(pipeline-configuration)/config-provider.tsx`, `e2e-tests/test/specs/app.e2e.ts`, `e2e-tests/test/inputs/{CR2,JPEG}/ImageLensInformation.txt`.

**Task order and dependencies:** 1 to 4 are the crop fix and must land in that order. 5 is independent. 6 must precede 7 and 9 (it changes the `header_editing` signature those tasks call). 8 depends on 7, 10 depends on 9. 11 and 12 are independent.

---

### Task 1: Read the resolution of a Radiance picture

**Files:**
- Create: `src-tauri/src/pipeline/picture.rs`
- Modify: `src-tauri/src/pipeline.rs:1-10` (module declarations)

**Interfaces:**
- Consumes: `PipelineError` from `src-tauri/src/pipeline.rs:40`.
- Produces: `pub fn read_resolution(path: &Path) -> Result<(u32, u32), PipelineError>` returning `(width, height)`. Task 2 uses the height.

Background: a Radiance picture is an ASCII header, a blank line, a resolution line, then binary pixels. `getinfo -d tb.hdr` prints `tb.hdr: -Y 8 +X 4`. Every tool in this pipeline emits that standard orientation; anything else is rejected rather than guessed at, because the crop offset depends on which way the rows run.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/pipeline/picture.rs` containing only the test module for now:

```rust
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test picture::tests`
Expected: FAIL to compile, `cannot find function read_resolution in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/pipeline/picture.rs`, above the test module:

```rust
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
```

Add the module to `src-tauri/src/pipeline.rs`, after `mod nullify_exposure_value;` on line 6:

```rust
mod picture;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test picture::tests`
Expected: PASS, 3 tests. A `dead_code` warning for `read_resolution` is expected until Task 2.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/picture.rs src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): read Radiance picture resolution"
```

---

### Task 2: Convert the top-left mask offset to Radiance's bottom-left origin

**Files:**
- Modify: `src-tauri/src/pipeline/crop.rs` (whole file)

**Interfaces:**
- Consumes: `read_resolution` from Task 1.
- Produces: `pub fn crop(config_settings, input_file, output_file, diameter, xleft, ytop) -> Result<PathBuf, PipelineError>`. The sixth parameter is renamed from `ydown` to `ytop` and its meaning changes to "distance from the top of the image". Task 3 updates the caller.

Background: spec Issue 1. `pcompos` measures its y offset from the bottom, verified with `pcompos -x 4 -y 4 tb.hdr -0 -0` returning the dark bottom half of a bright-top/dark-bottom picture. The UI produces a top-left value.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/pipeline/crop.rs`:

```rust
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
        assert_eq!(
            spec.args,
            vec!["-x", "4", "-y", "4", "in.hdr", "-0", "-4"]
        );
    }

    #[test]
    fn centred_mask_is_unchanged() {
        // 3744 tall, 3612 circle, centred: 66 from the top is also 66 from the
        // bottom, so existing centred setups produce identical output.
        let spec = crop_spec(&radiance(), "in.hdr", "out.hdr", 3612.0, 1019.0, 66.0, 3744).unwrap();
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test crop::tests`
Expected: FAIL to compile, `cannot find function crop_spec in this scope`.

- [ ] **Step 3: Write the implementation**

Replace the body of `src-tauri/src/pipeline/crop.rs` above the test module with:

```rust
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test crop::tests` then `cd src-tauri && cargo test`
Expected: PASS, 4 new tests and the full suite. The `crop(...)` call site in `pipeline.rs` still compiles unchanged, because Rust arguments are positional and only the parameter name changed.

**The runtime bug is fixed at the end of this task.** The frontend was already sending a top-left value, so the moment `crop_spec` converts it the crop is correct. Task 3 is naming hygiene plus the `buildPipelineParams` extraction; stopping between Task 2 and Task 3 leaves the app in a correct state, just with a parameter whose name lies in three files.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/crop.rs
git commit -m "fix(pipeline): crop from the top-left mask origin, not the bottom"
```

---

### Task 3: Rename `ydown` to `ytop` across the IPC boundary

**Files:**
- Modify: `src-tauri/src/pipeline.rs:169-171` (doc comment), `:191` (command parameter), `:322,414` (call sites), `:537,622` (`process_image_set`)
- Modify: `src-tauri/src/pipeline/merge_exposures.rs:19,101,189,200`
- Create: `src/app/home-page/build-pipeline-params.ts`
- Create: `__tests__/build-pipeline-params.test.ts`
- Modify: `src/app/home-page/page.tsx:329-393`

**Interfaces:**
- Consumes: `crop` from Task 2.
- Produces: `buildPipelineParams(data: pipelineConfig, settings: PipelineToolSettings, inputImages: string[])`. Tasks 8, 10 and 12 add keys to its return value.

Tauri matches command parameters by name at runtime, so the Rust signature and the JS payload key must change together. There is no compile-time guard.

- [ ] **Step 1: Write the failing test**

Create `__tests__/build-pipeline-params.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { buildPipelineParams } from "../src/app/home-page/build-pipeline-params";
import type { pipelineConfig } from "../src/app/home-page/(pipeline-configuration)/config-provider";

const settings = {
  dcrawEmuPath: "/tools/dcraw",
  hdrgenPath: "/tools/hdrgen",
  outputPath: "/out",
  radiancePath: "/radiance/bin",
};

const config: pipelineConfig = {
  cameraResponseLocation: "/cal/response.rsp",
  correctionFiles: {
    calibrationFactor: null,
    fisheye: null,
    neutralDensity: null,
    vignetting: null,
  },
  fisheyeView: { horizontalViewDegrees: 180, verticalViewDegrees: 180 },
  inputSets: [],
  lensMask: { radius: 100, x: 300, y: 164 },
  outputSettings: { filterIrrelevantSrcImages: false, targetRes: 1000 },
};

describe("buildPipelineParams", () => {
  it("sends the mask offset from the top as ytop", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"]);

    expect(params.ytop).toBe(64);
    expect(params.xleft).toBe(200);
    expect(params.diameter).toBe(200);
  });

  it("no longer sends a ydown key", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"]);

    expect(params).not.toHaveProperty("ydown");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/build-pipeline-params.test.ts`
Expected: FAIL, `Cannot find module '../src/app/home-page/build-pipeline-params'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/home-page/build-pipeline-params.ts`:

```ts
import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";

export interface PipelineToolSettings {
  dcrawEmuPath: string;
  hdrgenPath: string;
  outputPath: string;
  radiancePath: string;
}

/**
 * Builds the payload for the `pipeline` Tauri command.
 *
 * `ytop` is the distance from the top of the image to the top of the lens
 * mask, which is the origin the overlay works in. crop.rs converts it to the
 * bottom-left origin Radiance expects.
 */
export function buildPipelineParams(
  data: pipelineConfig,
  settings: PipelineToolSettings,
  inputImages: string[]
) {
  const diameter = Math.round(data.lensMask.radius * 2);
  const xleft = Math.round(data.lensMask.x - data.lensMask.radius);
  const ytop = Math.round(data.lensMask.y - data.lensMask.radius);

  return {
    dcrawEmuPath: settings.dcrawEmuPath,
    diameter,
    filterImages: data.outputSettings.filterIrrelevantSrcImages,
    fisheyeCorrectionCal: data.correctionFiles.fisheye ?? "",
    hdrgenPath: settings.hdrgenPath,
    horizontalAngle: data.fisheyeView.horizontalViewDegrees,
    inputImages,
    legendDimensions: "",
    neutralDensityCal: data.correctionFiles.neutralDensity ?? "",
    outputPath: settings.outputPath,
    photometricAdjustmentCal: data.correctionFiles.calibrationFactor ?? "",
    radiancePath: settings.radiancePath,
    responseFunction: data.cameraResponseLocation ?? "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    verticalAngle: data.fisheyeView.verticalViewDegrees,
    vignettingCorrectionCal: data.correctionFiles.vignetting ?? "",
    xdim: data.outputSettings.targetRes,
    xleft,
    ydim: data.outputSettings.targetRes,
    ytop,
  };
}
```

In `src/app/home-page/page.tsx`, replace the inline `const diameter = ...` through the closing `};` of the `params` object (currently lines 329 to 392) with a call to the new function, keeping the existing validation in place. The three `const` declarations at the top of the handler are replaced by:

```ts
const diameter = Math.round(data.lensMask.radius * 2);
```

(kept only for the `diameter <= 0` guard that follows), and the `params` object becomes:

```ts
const params = buildPipelineParams(
  data,
  {
    dcrawEmuPath: settings.dcrawEmuPath,
    hdrgenPath: settings.hdrgenPath,
    outputPath: settings.outputPath,
    radiancePath: settings.radiancePath,
  },
  imageSet.files
);
```

Add the import at the top of `page.tsx`:

```ts
import { buildPipelineParams } from "./build-pipeline-params";
```

In `src-tauri/src/pipeline.rs`, change the doc comment at lines 169-171 to:

```rust
// ytop:
//      The y-coordinate of the top left corner of the circumscribed square of
//      the fisheye view (in pixels), measured from the top of the image to
//      match the lens-mask overlay. crop.rs converts this to the bottom-left
//      origin that pcompos expects.
```

Rename the parameter `ydown: f64` to `ytop: f64` in the `pipeline` command signature and in `process_image_set`, and update every `ydown.clone()` / `ydown` argument to `ytop`. In `src-tauri/src/pipeline/merge_exposures.rs`, rename the `ydown` parameter of `merge_exposures` and of `filter_images` to `ytop`, and change line 200 to:

```rust
let ycenter = ytop + radius;
```

The mask stays in top-left coordinates and its behaviour does not change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- __tests__/build-pipeline-params.test.ts`
Expected: PASS, 2 tests.

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests, no compile errors.

Run: `npm run check`
Expected: no new findings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline.rs src-tauri/src/pipeline/merge_exposures.rs \
        src/app/home-page/build-pipeline-params.ts src/app/home-page/page.tsx \
        __tests__/build-pipeline-params.test.ts
git commit -m "refactor: rename ydown to ytop across the pipeline IPC boundary"
```

---

### Task 4: Make the e2e fixtures declare their coordinate origin

**Files:**
- Modify: `e2e-tests/test/inputs/JPEG/ImageLensInformation.txt`
- Modify: `e2e-tests/test/inputs/CR2/ImageLensInformation.txt`
- Modify: `e2e-tests/test/specs/app.e2e.ts:63-82`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `readLensInformation` that refuses to run against a fixture with no declared origin.

The fixtures say `ydown <- 74` with no statement of which edge that is measured from, and `readLensInformation` currently assumes top-left. Combined with the old `crop.rs`, the round trip cancelled out, so the golden encodes whichever convention the fixture uses without recording it. Measuring the circle in `IMG_6962.JPG` does not settle it: the threshold sweep gives about 20 px of uncertainty on each gap against a 16 px difference between the hypotheses.

**This task does not decide the answer.** It makes the fixture state one, so that the manual verification has somewhere to record its finding. Set `bottom-left` as the starting value, because that is the tutorial's definition of fisheye view coordinates and the convention the old `pipeline.rs` doc comment claimed.

**Correction, found while executing Task 1: there is no golden to regenerate.** Earlier drafts of this plan and of the spec assumed `e2e-tests/test/inputs/CR2/output.hdr` was a reference output. It is not referenced anywhere in `app.e2e.ts`; the spec only reads from `inputs/JPEG` (lines 11 and 35). The suite's strongest assertion is `at least 2 HDR output files` exist in the temp output directory (`app.e2e.ts:335-340`), plus preview counts and that one file opens in the viewer. **No pixel data is ever compared.** Consequences:

- The e2e suite will pass whether or not the origin is declared correctly, so it cannot confirm or refute the choice. Only the manual verification can.
- Changing `readLensInformation` carries no risk of a golden mismatch, because there is no golden.
- `inputs/CR2/output.hdr` is a 69 MB orphan at full frame resolution (5796x3870, verified with `getinfo -d`), which is not even a cropped pipeline output. It should be deleted or wired into an actual assertion, tracked separately from this plan.

This makes Task 4 lower risk and lower value than first written: its only purpose is to make the fixture self-documenting so the manual verification has a place to record the answer.

- [ ] **Step 1: Add the declarations to the fixtures**

Append to `e2e-tests/test/inputs/JPEG/ImageLensInformation.txt`, under the mask block:

```
origin <- bottom-left
```

Replace `e2e-tests/test/inputs/CR2/ImageLensInformation.txt` mask block with:

```
Mask and cropping information (8mm Canon 5D)
xres <- 5796
yres <- 3870
diameter <- 3728
xleft <- 1024
ydown <- 88
origin <- bottom-left
```

The CR2 dimensions were measured by running the pipeline's own dcraw_emu invocation on `capt01.CR2`:
`dcraw_emu -T -o 1 -W -j -q 3 -g 2 0 -t 0 -b 1.1 -Z out.tiff capt01.CR2` yields 5796x3870. Note the CR2 and JPEG fixtures are unrelated image sets from different sources, not one scene in two formats, so their dimensions are not comparable and neither set's numbers say anything about the other's.

- [ ] **Step 2: Write the failing test**

There is no unit harness for the e2e helper. Assert the behaviour directly by adding to `e2e-tests/test/specs/app.e2e.ts`, immediately after the `const lensInformation = readLensInformation(lensInformationPath);` line:

```ts
assert.ok(
  Number.isFinite(lensInformation.y),
  "expected a resolved mask centre; the fixture must declare its origin"
);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:e2e`
Expected: FAIL at `readLensInformation` with "expected origin in ...", because the parser does not read the new line yet.

- [ ] **Step 4: Write the implementation**

Replace `readLensInformation` in `e2e-tests/test/specs/app.e2e.ts` with:

```ts
function readLensInformation(lensInfoPath: string) {
  const raw = readFileSync(lensInfoPath, "utf8");
  const parseRequiredNumber = (label: string) => {
    const match = raw.match(new RegExp(`${label} <- (\\d+)`));
    assert.ok(match?.[1], `expected ${label} in ${lensInfoPath}`);
    return Number.parseInt(match[1], 10);
  };

  const originMatch = raw.match(/origin <- (bottom-left|top-left)/);
  assert.ok(
    originMatch?.[1],
    `expected "origin <- bottom-left" or "origin <- top-left" in ${lensInfoPath}`
  );
  const origin = originMatch[1];

  const diameter = parseRequiredNumber("diameter");
  const xleft = parseRequiredNumber("xleft");
  const ydown = parseRequiredNumber("ydown");
  const yres = parseRequiredNumber("yres");
  const radius = diameter / 2;

  // The lens-mask overlay works from the top-left of the image. Fixtures
  // written in Radiance's bottom-left convention are flipped here.
  const y =
    origin === "bottom-left" ? yres - (ydown + radius) : ydown + radius;

  return { diameter, radius, x: xleft + radius, y };
}
```

- [ ] **Step 5: Run it and record the outcome**

Run: `npm run test:e2e`
Expected: the suite runs to completion and passes. That is not evidence the origin was declared correctly; the suite only checks that HDR files were produced. Record the run for completeness and move on. The origin is settled by the manual verification, not here.

- [ ] **Step 6: Commit**

```bash
git add e2e-tests/test/inputs/CR2/ImageLensInformation.txt \
        e2e-tests/test/inputs/JPEG/ImageLensInformation.txt \
        e2e-tests/test/specs/app.e2e.ts
git commit -m "test(e2e): make lens fixtures declare their coordinate origin"
```

---

### Task 5: Fix the exposure selection bounds

**Files:**
- Modify: `src-tauri/src/pipeline/merge_exposures.rs:94-107,186-310`
- Modify: `src/app/home-page/page.tsx:508` (checkbox label)

**Interfaces:**
- Consumes: `emit_status`, `PipelineStatusKind` and `PipelineStatusPayload`, which are private to the `pipeline` module and therefore visible to `merge_exposures` as a descendant module.
- Produces: `fn select_exposure_range(frames: &[(u32, u32)]) -> Option<(usize, usize)>`, an inclusive index range into a brightest-to-darkest ordering.

Spec Issue 2. The current bounds take the first no-black frame and the last no-white frame, which is both ends of the sequence, then exclude the last index. The tutorial wants the last no-black frame through the first no-white frame.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/pipeline/merge_exposures.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn frames(below: &[u32], above: &[u32]) -> Vec<(u32, u32)> {
        below.iter().copied().zip(above.iter().copied()).collect()
    }

    #[test]
    fn selects_the_tutorial_band() {
        // A realistic 15 frame bracket, brightest first.
        let f = frames(
            &[0, 0, 0, 0, 0, 0, 0, 120, 900, 3000, 7000, 12000, 20000, 31000, 44000],
            &[41000, 29000, 18000, 9500, 4200, 1500, 400, 90, 12, 0, 0, 0, 0, 0, 0],
        );
        // Darkest frame with no black pixels is 6; lightest with no white is 9.
        assert_eq!(select_exposure_range(&f), Some((6, 9)));
    }

    #[test]
    fn keeps_every_bright_frame_when_none_is_free_of_black_pixels() {
        let f = frames(&[5, 9, 20, 30, 40], &[100, 50, 10, 0, 0]);
        assert_eq!(select_exposure_range(&f), Some((0, 3)));
    }

    #[test]
    fn keeps_every_dark_frame_when_none_is_free_of_white_pixels() {
        let f = frames(&[0, 0, 7, 20], &[100, 50, 10, 5]);
        assert_eq!(select_exposure_range(&f), Some((1, 3)));
    }

    #[test]
    fn single_frame_is_kept() {
        assert_eq!(select_exposure_range(&frames(&[0], &[0])), Some((0, 0)));
    }

    #[test]
    fn empty_input_selects_nothing() {
        assert_eq!(select_exposure_range(&[]), None);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test merge_exposures::tests`
Expected: FAIL to compile, `cannot find function select_exposure_range in this scope`.

- [ ] **Step 3: Write the implementation**

Add above the test module in `src-tauri/src/pipeline/merge_exposures.rs`:

```rust
/// Selects the useful span of a bracketed sequence, per Pierson et al. 2019
/// section 2.4.2: from the darkest frame with no black pixels through the
/// lightest frame with no white pixels. Frames brighter than the start add no
/// shadow information the start does not already hold, and frames darker than
/// the end add no highlight information.
///
/// `frames` is `(pixels_below, pixels_above)` ordered brightest to darkest.
/// The returned range is inclusive at both ends.
fn select_exposure_range(frames: &[(u32, u32)]) -> Option<(usize, usize)> {
    let last = frames.len().checked_sub(1)?;

    // No frame free of black pixels means every exposure is clipped in shadow,
    // so keep them all from the brightest.
    let start = (0..=last)
        .filter(|&i| frames[i].0 == 0)
        .next_back()
        .unwrap_or(0);

    // No frame free of white pixels means every exposure is clipped in
    // highlight, so keep them all through the darkest.
    let end = (start..=last).find(|&i| frames[i].1 == 0).unwrap_or(last);

    Some((start, end))
}
```

Replace lines 279 to 310 of the same file (the `start_index` / `end_index` loops and the push loop) with:

```rust
    let frame_counts: Vec<(u32, u32)> = sorted_array
        .iter()
        .map(|(_, pixels_below, pixels_above, _)| (*pixels_below, *pixels_above))
        .collect();

    let (start_index, end_index) =
        select_exposure_range(&frame_counts).ok_or_else(|| PipelineError::Processing {
            message: "merge_exposures: filter_images: no input images to select from".to_string(),
        })?;

    if DEBUG {
        println!("Selecting images: {}..={}", start_index, end_index);
    }

    for i in start_index..=end_index {
        filtered_images.push(input_images[sorted_array[i].0].clone());
    }
```

Add the frame-size guard. Inside the `par_iter` closure, immediately after `let (width, height) = image.dimensions();` (currently line 244), insert:

```rust
                if (width, height) != (reference_width, reference_height) {
                    return Err(PipelineError::Processing {
                        message: format!(
                            "merge_exposures: filter_images: {input_image} is {width}x{height} \
                             but the first image is {reference_width}x{reference_height}; \
                             the lens mask cannot be applied to both"
                        ),
                    });
                }
```

and bind the reference dimensions just after the first image is opened (currently line 213):

```rust
    let (reference_width, reference_height) = (width, height);
```

Rename the misleading `avg_brightness` local to `brightness_score` throughout `filter_images` (it sums only the masked pixels but divides by the whole frame area, so it is not a mean; the divisor is the same for every frame in a set, so the ordering it produces is correct).

Report the selection to the user. `filter_images` has no `AppHandle`, but `merge_exposures` does, so emit from the call site. Add to the imports at the top of `merge_exposures.rs`:

```rust
use super::{emit_status, PipelineStatusKind, PipelineStatusPayload};
```

and replace the `filter_images` call block (currently lines 101 to 107) with:

```rust
            let before = input_images.len();
            input_images = filter_images(
                input_images,
                diameter as f32,
                xleft as f32,
                ytop as f32,
                xdim as f32,
                ydim as f32,
            )?;
            emit_status(
                app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Step,
                    progress: None,
                    step: Some("select_exposures".to_string()),
                    message: Some(format!(
                        "Selected {} of {before} exposures (tutorial section 2.4.2)",
                        input_images.len()
                    )),
                },
            )?;
```

Finally, make the checkbox name the tutorial step it performs. In `src/app/home-page/page.tsx:508`, change:

```tsx
                          <Label>Filter irrelevant source images</Label>
```

to:

```tsx
                          <Label>
                            Select useful exposures (tutorial §2.4.2,
                            recommended)
                          </Label>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test merge_exposures::tests`
Expected: PASS, 5 tests.

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/merge_exposures.rs src/app/home-page/page.tsx
git commit -m "fix(pipeline): select the useful exposure band per tutorial 2.4.2"
```

---

### Task 6: Write one VIEW line and drop the stray `-c`

**Files:**
- Modify: `src-tauri/src/pipeline/header_editing.rs` (whole file)
- Modify: `src-tauri/src/pipeline.rs:789-804,855-870`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `pub struct ViewArgs { pub projection: String, pub vertical_angle: f64, pub horizontal_angle: f64 }` and
  `pub fn header_editing(config_settings, input_file: String, output_file: String, view: Option<ViewArgs>, evalglare_value: Option<String>, measured_illuminance: Option<String>) -> Result<PathBuf, PipelineError>`. Tasks 7 and 9 call this.

Spec Issue 3. `getinfo -a` appends every remaining argument as a header line, so `-c` lands in the header verbatim, and because both calls pass the view unconditionally the finished header carries two identical `VIEW=` lines. The two-call structure is correct and is preserved; only the first call passes a view.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/pipeline/header_editing.rs`:

```rust
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
        assert_eq!(spec.args, vec!["-a", "PHOTOPIC_ILLUMINANCE=297.230100"]);
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
                "PHOTOPIC_ILLUMINANCE=297.23",
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test header_editing::tests`
Expected: FAIL to compile, `cannot find function header_editing_spec` and `cannot find struct ViewArgs`.

- [ ] **Step 3: Write the implementation**

Replace everything above the test module in `src-tauri/src/pipeline/header_editing.rs` with:

```rust
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
    let mut spec = CommandSpec::new(radiance_path.join("getinfo")).arg("-a");

    if let Some(view) = view {
        spec = spec.arg(format!(
            "VIEW= -{} -vv {} -vh {}",
            view.projection, view.vertical_angle, view.horizontal_angle
        ));
    }

    // evalglare prints its value with a trailing newline. getinfo happens to
    // normalise that, but the header entry is built here so it does not have to.
    if let Some(value) = evalglare_value {
        spec = spec.arg(format!("PHOTOPIC_ILLUMINANCE={}", value.trim()));
    }

    if let Some(value) = measured_illuminance {
        spec = spec.arg(format!("MEASURED_VERTICAL_ILLUMINANCE={}", value.trim()));
    }

    spec.stdin_file(input_file).stdout_file(output_file)
}
```

Update the two call sites in `src-tauri/src/pipeline.rs`. The first (currently line 789) becomes:

```rust
    header_editing(
        &config_settings,
        config_settings.temp_path.join(next_path).display().to_string(),
        config_settings
            .temp_path
            .join("header_editing_view.hdr")
            .display()
            .to_string(),
        Some(ViewArgs {
            projection: "vta".to_string(),
            vertical_angle,
            horizontal_angle,
        }),
        None,
        None,
    )?;
```

The second (currently line 855) becomes:

```rust
    header_editing(
        &config_settings,
        config_settings
            .temp_path
            .join("header_editing_view.hdr")
            .display()
            .to_string(),
        config_settings
            .temp_path
            .join("header_editing.hdr")
            .display()
            .to_string(),
        None,
        Some(evalglare_value),
        None,
    )?;
```

Add `ViewArgs` to the import on line 26:

```rust
use header_editing::{header_editing, ViewArgs};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test header_editing::tests`
Expected: PASS, 4 tests.

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/header_editing.rs src-tauri/src/pipeline.rs
git commit -m "fix(pipeline): write one VIEW line and stop injecting -c into headers"
```

---

### Task 7: Make the projection type a parameter (backend)

**Files:**
- Modify: `src-tauri/src/pipeline/evalglare.rs` (whole file)
- Modify: `src-tauri/src/pipeline.rs:177-201` (command signature), `:520-540` (`process_image_set`), `:777-870` (header and evalglare block)

**Interfaces:**
- Consumes: `ViewArgs` and `header_editing` from Task 6.
- Produces: a `projection: String` parameter on the `pipeline` command, validated against `vta`, `vth`, `vtv`. Task 8 supplies it from the UI.

Spec Issue 5. `evalglare -vtv` exits with "invalid view specified", so a non-fisheye projection has to skip the validity check rather than pass the flag through. Measured on identical pixels, `-vta` gives 297.230100 and `-vth` gives 97.684316, so this is not cosmetic.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/pipeline/evalglare.rs`:

```rust
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test evalglare::tests`
Expected: FAIL to compile, `cannot find function evalglare_spec in this scope`.

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/pipeline/evalglare.rs`, add `use std::path::Path;` at the top, add a `projection: &str` parameter to `evalglare` between `input_file` and `vertical_angle`, and replace the inline spec construction with a call to a new function:

```rust
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
```

In `src-tauri/src/pipeline.rs`, add `projection: String` to the `pipeline` command signature after `horizontal_angle: f64`, and validate it immediately after the empty-input check near line 208:

```rust
    const SUPPORTED_PROJECTIONS: [&str; 3] = ["vta", "vth", "vtv"];
    if !SUPPORTED_PROJECTIONS.contains(&projection.as_str()) {
        return Err(PipelineError::InvalidInput {
            field: "projection".to_string(),
            value: projection,
        });
    }
```

Thread `projection: String` through `process_image_set` and pass `projection.clone()` at both call sites. In `process_image_set`, use it in the first `header_editing` call, and replace the evalglare block with:

```rust
    // evalglare only accepts an angular fisheye view. A non-fisheye projection
    // has no vertical illuminance to derive, so the check is skipped.
    let evalglare_value = if projection == "vtv" {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("evalglare".to_string()),
                message: Some(
                    "Validity check skipped: evalglare requires an angular fisheye view \
                     (-vta or -vth); the selected projection is -vtv."
                        .to_string(),
                ),
            },
        )?;
        None
    } else {
        let evalglare_result = evalglare(
            &config_settings,
            config_settings
                .temp_path
                .join("header_editing_view.hdr")
                .display()
                .to_string(),
            &projection,
            vertical_angle,
            horizontal_angle,
        )?;
        if let Some(message) = evalglare_result.warning {
            emit_status(
                app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Warning,
                    progress: None,
                    step: Some("evalglare".to_string()),
                    message: Some(message),
                },
            )?;
        }
        Some(evalglare_result.value)
    };
```

Make the second `header_editing` call conditional, so the rest of the pipeline still finds `header_editing.hdr`:

```rust
    if evalglare_value.is_some() {
        header_editing(
            &config_settings,
            config_settings
                .temp_path
                .join("header_editing_view.hdr")
                .display()
                .to_string(),
            config_settings
                .temp_path
                .join("header_editing.hdr")
                .display()
                .to_string(),
            None,
            evalglare_value,
            None,
        )?;
    } else {
        copy(
            config_settings.temp_path.join("header_editing_view.hdr"),
            config_settings.temp_path.join("header_editing.hdr"),
        )
        .map_err(|error| PipelineError::Processing {
            message: format!("Error finalizing HDR image without a validity check: {error}"),
        })?;
    }
```

Replace the hardcoded `"vta"` in the first `header_editing` call with `projection.clone()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/evalglare.rs src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): accept a projection type instead of hardcoding -vta"
```

---

### Task 8: Projection type selector in the existing accordion

**Files:**
- Create: `src/components/ui/select-input.tsx`
- Modify: `src/app/home-page/(pipeline-configuration)/config-provider.tsx:5-27`
- Modify: `src/app/home-page/page.tsx:84-87` (defaults), `:714-786` (`item-post`)
- Modify: `src/app/home-page/build-pipeline-params.ts`
- Modify: `__tests__/build-pipeline-params.test.ts`

**Interfaces:**
- Consumes: `buildPipelineParams` from Task 3, the `projection` parameter from Task 7.
- Produces: `export type FisheyeProjection = "vta" | "vth" | "vtv"` on `pipelineConfig.fisheyeView.projection`.

The accordion is not restructured. The selector goes inside the existing `item-post` section ("Output Header Editing"), above the "Fisheye view angles" field, because `-vt`, `-vv` and `-vh` are the three parts of the one `VIEW=` line that section already writes.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/build-pipeline-params.test.ts`, and add `projection: "vta"` to the `fisheyeView` block of the shared `config` fixture:

```ts
  it("forwards the selected projection", () => {
    const params = buildPipelineParams(
      { ...config, fisheyeView: { ...config.fisheyeView, projection: "vth" } },
      settings,
      ["a.jpg"]
    );

    expect(params.projection).toBe("vth");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/build-pipeline-params.test.ts`
Expected: FAIL, TypeScript rejects `projection` on `fisheyeView`, and `params.projection` is undefined.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/select-input.tsx`:

```tsx
import type * as React from "react";

import { cn } from "@/lib/utils";

const SelectInput = ({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<"select"> & { ref?: React.Ref<HTMLSelectElement> }) => (
  <select
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      "aria-invalid:border-destructive aria-invalid:text-destructive",
      "group-data-[invalid=true]/field:border-destructive group-data-[invalid=true]/field:text-destructive",
      className
    )}
    ref={ref}
    {...props}
  >
    {children}
  </select>
);
SelectInput.displayName = "SelectInput";

export { SelectInput };
```

In `config-provider.tsx`, add the exported type and the field:

```ts
export type FisheyeProjection = "vta" | "vth" | "vtv";
```

and inside `pipelineConfig`:

```ts
  fisheyeView: {
    horizontalViewDegrees: number | null;
    projection: FisheyeProjection;
    verticalViewDegrees: number | null;
  };
```

In `page.tsx`, add the default to `useGlobalPipelineConfig`:

```ts
  fisheyeView: {
    horizontalViewDegrees: 180,
    projection: "vta",
    verticalViewDegrees: 180,
  },
```

Add `"fisheyeView.projection"` to the `fields` array of the `item-post` `FieldContainerAccordionTrigger`, and insert this `Field` as the first child of that section's `AccordionContent`, above the existing "Fisheye view angles" field:

```tsx
                    <Field>
                      <FieldLabel>
                        <Aperture /> Projection type
                      </FieldLabel>
                      <FieldContent>
                        <SelectInput
                          {...register("fisheyeView.projection", {
                            required: "Projection type is required",
                          })}
                          defaultValue="vta"
                        >
                          <option value="vta">Equidistant (-vta)</option>
                          <option value="vth">Orthographic (-vth)</option>
                          <option value="vtv">Non-fisheye (-vtv)</option>
                        </SelectInput>
                      </FieldContent>
                      <FieldDescription>
                        Written to the picture header as the view type. A
                        non-fisheye view skips the validity check, because
                        evalglare requires an angular fisheye view.
                      </FieldDescription>
                    </Field>
```

Add the imports: `Aperture` to the existing `lucide-react` import, `SelectInput` from `@/components/ui/select-input`, and `FieldDescription` to the existing `@/components/ui/field` import.

In `build-pipeline-params.ts`, add to the returned object:

```ts
    projection: data.fisheyeView.projection,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

Run: `npm run check`
Expected: no new findings.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/select-input.tsx src/app/home-page/page.tsx \
        "src/app/home-page/(pipeline-configuration)/config-provider.tsx" \
        src/app/home-page/build-pipeline-params.ts __tests__/build-pipeline-params.test.ts
git commit -m "feat(ui): add a projection type selector to Output Header Editing"
```

---

### Task 9: Perform the validity check (backend)

**Files:**
- Create: `src-tauri/src/pipeline/validity.rs`
- Modify: `src-tauri/src/pipeline.rs:1-10`, command signature, `process_image_set` evalglare block

**Interfaces:**
- Consumes: `header_editing` from Task 6, the evalglare block from Task 7.
- Produces: `pub enum ValidityOutcome { Pass { error_pct: f64 }, AboveExpected { error_pct: f64 }, Failed { error_pct: f64 } }` and `pub fn evaluate_validity(ev_hdr: f64, ev_measured: f64) -> Option<ValidityOutcome>`. A `measured_vertical_illuminance: Option<f64>` parameter on the `pipeline` command; Task 10 supplies it.

Spec Issue 4. Thresholds come from the tutorial: under 10 percent expected, over 25 percent should be rejected. A failed check does not abort the run; the outputs are still written so the image can be inspected.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/pipeline/validity.rs` with only the test module:

```rust
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test validity::tests`
Expected: FAIL to compile, `cannot find function evaluate_validity`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/pipeline/validity.rs`:

```rust
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
```

Add `mod validity;` to `src-tauri/src/pipeline.rs` alongside the other stage modules, and
`use validity::{evaluate_validity, validity_message, ValidityOutcome};`.

Add `measured_vertical_illuminance: Option<f64>` to the `pipeline` command signature and thread it through `process_image_set`. After the evalglare block from Task 7, insert:

```rust
    let measured_text = measured_vertical_illuminance.map(|value| value.to_string());

    if let (Some(raw), Some(measured)) = (&evalglare_value, measured_vertical_illuminance) {
        match raw.trim().parse::<f64>() {
            Ok(ev_hdr) => {
                if let Some(outcome) = evaluate_validity(ev_hdr, measured) {
                    let kind = match outcome {
                        ValidityOutcome::Pass { .. } => PipelineStatusKind::Step,
                        _ => PipelineStatusKind::Warning,
                    };
                    emit_status(
                        app,
                        PipelineStatusPayload {
                            kind,
                            progress: None,
                            step: Some("validity_check".to_string()),
                            message: Some(validity_message(&outcome, ev_hdr, measured)),
                        },
                    )?;
                }
            }
            Err(_) => emit_status(
                app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Warning,
                    progress: None,
                    step: Some("validity_check".to_string()),
                    message: Some(format!(
                        "Could not read a vertical illuminance from evalglare output {:?}; \
                         the validity check was skipped.",
                        raw.trim()
                    )),
                },
            )?,
        }
    } else if measured_vertical_illuminance.is_some() && evalglare_value.is_none() {
        emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Step,
                progress: None,
                step: Some("validity_check".to_string()),
                message: Some(
                    "Validity check skipped: evalglare requires an angular fisheye view. \
                     The measured value was recorded in the header but not compared."
                        .to_string(),
                ),
            },
        )?;
    }
```

Change the conditional second `header_editing` call from Task 7 so it runs when either value is present, and passes both:

```rust
    if evalglare_value.is_some() || measured_text.is_some() {
        header_editing(
            &config_settings,
            config_settings
                .temp_path
                .join("header_editing_view.hdr")
                .display()
                .to_string(),
            config_settings
                .temp_path
                .join("header_editing.hdr")
                .display()
                .to_string(),
            None,
            evalglare_value,
            measured_text,
        )?;
    } else {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests including 5 new ones in `validity::tests`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/validity.rs src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): compare HDR-derived and measured vertical illuminance"
```

---

### Task 10: Validity Check section in the accordion

**Files:**
- Modify: `src/app/home-page/(pipeline-configuration)/config-provider.tsx`
- Modify: `src/app/home-page/page.tsx` (defaults and a new `AccordionItem` after `item-post`)
- Modify: `src/app/home-page/build-pipeline-params.ts`
- Modify: `__tests__/build-pipeline-params.test.ts`

**Interfaces:**
- Consumes: the `measured_vertical_illuminance` parameter from Task 9.
- Produces: `pipelineConfig.validityCheck.measuredVerticalIlluminanceLux: number | null`.

Tutorial step 11 is the only Table 3 step without a section. This adds one, built from the same components as every other section.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/build-pipeline-params.test.ts`, and add `validityCheck: { measuredVerticalIlluminanceLux: null }` to the shared `config` fixture:

```ts
  it("forwards a measured vertical illuminance", () => {
    const params = buildPipelineParams(
      { ...config, validityCheck: { measuredVerticalIlluminanceLux: 1240 } },
      settings,
      ["a.jpg"]
    );

    expect(params.measuredVerticalIlluminance).toBe(1240);
  });

  it("sends null when no measurement was entered", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"]);

    expect(params.measuredVerticalIlluminance).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/build-pipeline-params.test.ts`
Expected: FAIL, TypeScript rejects `validityCheck`, and `measuredVerticalIlluminance` is undefined.

- [ ] **Step 3: Write the implementation**

In `config-provider.tsx`, add to `pipelineConfig`:

```ts
  validityCheck: {
    measuredVerticalIlluminanceLux: number | null;
  };
```

In `page.tsx`, add the default to `useGlobalPipelineConfig`:

```ts
  validityCheck: {
    measuredVerticalIlluminanceLux: null,
  },
```

Add a new `AccordionItem` immediately after the closing tag of `item-post`:

```tsx
                <AccordionItem className="px-4" value="item-validity">
                  <FieldContainerAccordionTrigger
                    fields={["validityCheck.measuredVerticalIlluminanceLux"]}
                  >
                    Validity Check
                  </FieldContainerAccordionTrigger>
                  <AccordionContent
                    className="flex flex-col gap-4 text-balance"
                    forceMount
                  >
                    <Field>
                      <FieldLabel>
                        <Sun /> Measured vertical illuminance
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          icon={"lx"}
                          placeholder="Optional"
                          type="number"
                          {...register(
                            "validityCheck.measuredVerticalIlluminanceLux",
                            {
                              min: {
                                message:
                                  "Measured illuminance must be greater than 0",
                                value: 1,
                              },
                              setValueAs: (value) =>
                                value === "" || value === null
                                  ? null
                                  : Number(value),
                            }
                          )}
                          aria-invalid={
                            form.formState.errors.validityCheck
                              ?.measuredVerticalIlluminanceLux
                              ? "true"
                              : undefined
                          }
                        />
                      </FieldContent>
                      <FieldDescription>
                        Compared against the illuminance evalglare derives from
                        the finished image. Under 10% error is expected; over
                        25% the tutorial recommends rejecting the image. With a
                        non-fisheye projection the value is recorded in the
                        header but not compared, because evalglare requires an
                        angular fisheye view.
                      </FieldDescription>
                      <FieldError
                        errors={[
                          form.formState.errors.validityCheck
                            ?.measuredVerticalIlluminanceLux,
                        ]}
                      />
                    </Field>
                  </AccordionContent>
                </AccordionItem>
```

Add `Sun` to the `lucide-react` import.

In `build-pipeline-params.ts`, add to the returned object:

```ts
    measuredVerticalIlluminance:
      data.validityCheck.measuredVerticalIlluminanceLux,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

Run: `npm run check`
Expected: no new findings.

- [ ] **Step 5: Commit**

```bash
git add src/app/home-page/page.tsx \
        "src/app/home-page/(pipeline-configuration)/config-provider.tsx" \
        src/app/home-page/build-pipeline-params.ts __tests__/build-pipeline-params.test.ts
git commit -m "feat(ui): add the Validity Check section for measured illuminance"
```

---

### Task 11: Warn about `.cal` files that cannot adapt to the working resolution

**Files:**
- Create: `src-tauri/src/pipeline/cal_check.rs`
- Modify: `src-tauri/src/pipeline.rs` (module list, and the projection and vignetting blocks)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `pub fn resolution_dependent_constants(text: &str) -> Option<Vec<f64>>` returning `None` when the file adapts to resolution, and `pub fn cal_warning(label: &str, path: &str, width: u32, height: u32, constants: &[f64]) -> String`.

Spec Issue 6. Both geometric `.cal` files are user-supplied and either can hardcode a resolution. The test is whether the file references `xres` or `yres`; the shipped `vignetting.cal` does not and hardcodes a centre of (500, 500) with a radius of 500.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/pipeline/cal_check.rs` with only the test module:

```rust
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
        assert_eq!(resolution_dependent_constants(&text).unwrap().len(), 8);
    }

    #[test]
    fn message_names_the_file_and_the_resolution() {
        let message = cal_warning("vignetting", "/cal/vignetting.cal", 900, 900, &[500.0]);
        assert!(message.contains("vignetting.cal"));
        assert!(message.contains("900x900"));
        assert!(message.contains("500"));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test cal_check::tests`
Expected: FAIL to compile, `cannot find function resolution_dependent_constants`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/pipeline/cal_check.rs`:

```rust
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

pub fn cal_warning(
    label: &str,
    path: &str,
    width: u32,
    height: u32,
    constants: &[f64],
) -> String {
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
         applied about the wrong centre. See Pierson et al. 2019, section 2.5.2."
    )
}
```

Add `mod cal_check;` and `use cal_check::{cal_warning, resolution_dependent_constants};` to `src-tauri/src/pipeline.rs`.

Track the working resolution in `process_image_set`. After the crop, add:

```rust
    let mut working_width = diameter as u32;
    let mut working_height = diameter as u32;
```

and inside the `if diameter > 1000.0` resize block, after `resize(...)` succeeds:

```rust
        working_width = xdim as u32;
        working_height = ydim as u32;
```

Add a helper next to `emit_status` in `pipeline.rs`:

```rust
fn warn_if_resolution_dependent(
    app: &tauri::AppHandle,
    label: &str,
    cal_path: &str,
    width: u32,
    height: u32,
) -> Result<(), PipelineError> {
    let text = match fs::read_to_string(cal_path) {
        Ok(text) => text,
        Err(error) => {
            return emit_status(
                app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Warning,
                    progress: None,
                    step: Some("cal_check".to_string()),
                    message: Some(format!(
                        "Could not read the {label} calibration file {cal_path}: {error}"
                    )),
                },
            )
        }
    };

    match resolution_dependent_constants(&text) {
        None => Ok(()),
        Some(constants) => emit_status(
            app,
            PipelineStatusPayload {
                kind: PipelineStatusKind::Warning,
                progress: None,
                step: Some("cal_check".to_string()),
                message: Some(cal_warning(label, cal_path, width, height, &constants)),
            },
        ),
    }
}
```

Call it at the top of the projection block and the vignetting block, before the correction runs:

```rust
        warn_if_resolution_dependent(
            app,
            "fisheye",
            &fisheye_correction_cal,
            working_width,
            working_height,
        )?;
```

```rust
        warn_if_resolution_dependent(
            app,
            "vignetting",
            &vignetting_correction_cal,
            working_width,
            working_height,
        )?;
```

Do not call it for the ND filter or photometric `.cal` files; those are per-pixel scalars with no geometry.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests including 5 new ones in `cal_check::tests`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/cal_check.rs src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): warn when a geometric .cal cannot adapt to the resolution"
```

---

### Task 12: Pass the falsecolor legend dimensions as two options

**Files:**
- Modify: `src-tauri/src/pipeline/falsecolor.rs` (whole file)
- Modify: `src-tauri/src/pipeline.rs:135-140` (`LuminanceArgs`), command signature, `luminance_args` construction
- Modify: `src/app/home-page/build-pipeline-params.ts`

**Interfaces:**
- Consumes: `buildPipelineParams` from Task 3.
- Produces: `LuminanceArgs { scale_limit, scale_label, scale_levels, legend_width, legend_height }`, replacing `legend_dimensions`.

Spec Issue 7. `falsecolor` is a Perl script that matches options by substring, so `-lw/-lh` matches `-lw` and swallows the next argument as the width: `Argument "100 200" isn't numeric in numeric le (<=) at falsecolor line 116`. Passing `-lw 100 -lh 200` produces no such warning. The branch is currently unreachable because the UI sends empty strings.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/pipeline/falsecolor.rs`:

```rust
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test falsecolor::tests`
Expected: FAIL to compile, `cannot find function falsecolor_args`, and `LuminanceArgs` has no field `legend_width`.

- [ ] **Step 3: Write the implementation**

In `src-tauri/src/pipeline.rs`, change `LuminanceArgs`:

```rust
pub struct LuminanceArgs {
    scale_limit: String,
    scale_label: String,
    scale_levels: String,
    legend_width: String,
    legend_height: String,
}
```

Replace the `legend_dimensions: String` command parameter with `legend_width: String` and `legend_height: String`, and build the struct from them.

In `src-tauri/src/pipeline/falsecolor.rs`, replace the argument construction with a pure function and a call to it:

```rust
/// falsecolor matches its options by substring, so `-lw` and `-lh` have to be
/// separate arguments each followed by its own numeric value.
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
```

and in `falsecolor`, replace the `else` branch of the `scale_label.is_empty()` check with:

```rust
        spec = spec.args(falsecolor_args(luminance_args)).arg(input_file.as_str());
```

In `src/app/home-page/build-pipeline-params.ts`, replace `legendDimensions: ""` with:

```ts
    legendHeight: "",
    legendWidth: "",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests including 3 new ones in `falsecolor::tests`.

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/falsecolor.rs src-tauri/src/pipeline.rs \
        src/app/home-page/build-pipeline-params.ts
git commit -m "fix(pipeline): pass falsecolor legend width and height separately"
```

---

## Final verification

Run all three suites and record the result:

```bash
cd src-tauri && cargo test && cd ..
npm test
npm run check
```

Then confirm by hand, per spec section 10:

1. A centred lens mask produces output identical to the pre-change build apart from the removal of the `-c` line and the de-duplicated `VIEW=` line. Compare `getinfo` output on a before and after picture.
2. An off-centre lens mask now crops the circle rather than its mirror. This is the one intended output change and belongs in the release notes.
3. `getinfo <output>.hdr` shows exactly one `VIEW=` line, no line starting with `-`, and the illuminance entries.

The e2e suite is deliberately excluded from this list. As Task 4 records, it asserts only that HDR files were produced and never compares pixel data, so a green run is not evidence that any of these fixes is correct. It becomes a meaningful gate only once the fixtures are verified by hand and it gains an assertion about output content.
