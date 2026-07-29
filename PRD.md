# HDRI Calibration Tool — Product Requirements Document

**Status:** describes functionality present on `main` as of the merge of PR #223 (2026-07-24). This is a description of what is implemented, not a roadmap.

## 1. Overview

The HDRI Calibration Tool is a cross-platform desktop application (Tauri 2 + Next.js) that turns a bracketed set of low dynamic range (LDR) photographs into a calibrated high dynamic range (HDR) luminance map. It runs three image-processing tools — [Radiance](https://www.radiance-online.org/), `hdrgen`, and `dcraw_emu` — behind a guided GUI pipeline, following the calibration process published in [Pierson et al., 2019](https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319). All three are compiled to WebAssembly and ship inside the application, so there is nothing to install and no tool paths to configure.

**Target users:** lighting/daylighting researchers and professionals studying the indoor visual environment, particularly discomfort glare, who need calibrated luminance data without hand-driving Radiance/hdrgen from the command line.

**Supported platforms:** Windows, macOS (Intel + Apple Silicon, universal binary), Ubuntu. The in-app HDR Image Viewer additionally requires XQuartz on macOS 10.8+; it is not currently supported on Windows for that reason on older releases (see §9).

## 2. Application Structure

A three-tab desktop app (`src/app/navigation.tsx`):

| Tab | Route | Purpose |
|---|---|---|
| Image Generator | `/home-page` | Configure and run the LDR → HDR calibration pipeline |
| Settings | `/settings-page` | Configure external tool paths and app preferences |
| Image Viewer | `/image-viewer`, `/image-viewer/view` | Load and inspect a generated `.hdr` file |

## 3. Feature: Image Generator (Home Page)

`src/app/home-page/page.tsx`

- **Image set input** — drag-and-drop or file-picker selection of an LDR bracket (JPEG, TIFF, or camera raw). Multiple named image sets can be staged; each set is validated to contain at least 2 images. (Batch processing of more than one set per pipeline run is not yet implemented — see §9.)
- **Camera response function** — upload of a `.rsp` file describing the camera's tone response, required for JPEG-derived input.
- **Cropping and resizing**
  - Interactive circular lens-mask editor (drag center + radius handles) to isolate the fisheye field of view within the source frame.
  - Numeric target output resolution (width/height in pixels).
- **Correction calibration files** — optional `.cal` (Radiance CAL format) uploads for:
  - Fisheye projection correction
  - Vignetting correction
  - Neutral density filter correction
  - Photometric calibration factor correction
- **Output header editing** — configurable horizontal/vertical fisheye view angle (degrees), written into the output HDR header.
- **Source image filtering** — optional toggle to exclude LDR images that don't contribute usefully to HDR generation, trading a small time cost for improved accuracy.
- **Pipeline execution and status**
  - Submits the full parameter set to the Rust backend (`pipeline` Tauri command) and shows live progress (`PipelineStatus` component, driven by backend-emitted events).
  - Known `hdrgen` failure modes (unsolvable response function, insufficient/non-overlapping exposures) are pattern-matched from stderr and surfaced as an actionable per-image-set error instead of a raw stack trace.
  - Any other pipeline failure is captured as a JSON trace file (inputs + error) written next to the output, with a "reveal in folder" action so it can be sent to a maintainer.

## 4. Feature: Backend Calibration Pipeline

`src-tauri/src/pipeline.rs` and `src-tauri/src/pipeline/*`

Exposed as a single async Tauri command (`pipeline`) that runs the following steps, in this order, per image set (verified against `process_image_set` in `pipeline.rs`):

1. **Merge exposures** (`merge_exposures.rs`) — combines the LDR bracket into a single HDR image via `hdrgen`, using the supplied camera response function. Raw camera formats in the input set are converted through `dcraw_emu` inline at this step (not a separate pipeline stage).
2. **Nullify exposure value** (`nullify_exposure_value.rs`) — always runs.
3. **Crop** (`crop.rs`) — applies the lens mask (diameter/x/y from the UI). Always runs.
4. **Resize** (`resize.rs`) — *only if* the lens mask diameter exceeds 1000px.
5. **Projection adjustment** (`projection_adjustment.rs`) — fisheye projection correction, *only if* a fisheye correction `.cal` file was supplied.
6. **Vignetting correction** (`vignetting_effect_correction.rs`) — *only if* a vignetting `.cal` file was supplied.
7. **Neutral density correction** (`neutral_density.rs`) — *only if* a neutral density `.cal` file was supplied.
8. **Photometric adjustment** (`photometric_adjustment.rs`) — applies the calibration factor, *only if* supplied.
9. **Header editing (view angles)** (`header_editing.rs`) — writes the `VIEW= -vta -vv -vh` line into the Radiance header *before* evalglare runs, since evalglare reads its view geometry from the header rather than purely from its own CLI flags. Always runs. (Fixed 2026-07-24 — see §8; this used to run *after* evalglare, which produced incorrect glare values on every pipeline run.)
10. **Evalglare** (`evalglare.rs`) — always runs; computes a glare value via Radiance's `evalglare`, now evaluating against a header with the correct view angles already written.
11. **Header editing (glare value)** (`header_editing.rs`) — a second call to the same step, this time adding the evalglare-derived `COMPUTED_VERTICAL_ILLUMINANCE` value into the header (the quantity `evalglare -V` reports, named to pair with the user-supplied `MEASURED_VERTICAL_ILLUMINANCE`). Always runs. This is the file copied out as the pipeline's primary output.
12. **Falsecolor** (`falsecolor.rs`) — generates the false-color luminance map via Radiance's `falsecolor`, from the fully-edited header. Always runs; this is the pipeline's secondary (`_fc.hdr`) output.

Steps 4–8 are conditionally skipped when their corresponding calibration input is absent; merge, nullify, crop, both header-editing passes, evalglare, and falsecolor are unconditional. Each step invokes the corresponding Radiance/`hdrgen` binary as a subprocess and propagates structured `CommandError`/`PipelineError` results back to the frontend (rather than raw process failures). Progress/status events are emitted per step for the frontend's progress bar.

Directory (batch) input triggers the same per-set sequence once per directory, but the frontend currently only submits a single set per run (see §9).

Two other backend commands support the rest of the app:

- `convert_raw_img` (`raw_image_help.rs`) — converts raw image(s) to `.tiff` for UI preview purposes, with on-disk caching.
- `read_hdr_metadata` (`hdr_metadata.rs`) — parses a Radiance `.hdr` header into a key/value map for display in the Image Viewer.

## 5. Feature: Image Viewer

`src/app/image-viewer/*`

- **File intake** — drag-and-drop or file picker for a single `.hdr` file (extension-validated); state is passed to the viewer route via a serialized URL query string (`viewer-url.ts`).
- **Rendering** — a `three.js` (WebGL) canvas renders the HDR pixel data as a texture, with pan/zoom (`react-zoom-pan-pinch`).
- **Exposure control** — interactive exposure slider to remap the HDR dynamic range for on-screen viewing.
- **False-color heatmap overlay** — false-color luminance computation (`falsecolor-luminance-webgpu.ts`) that runs on WebGPU when available (via `navigator.gpu`) and falls back to a CPU implementation otherwise; rendered as a heatmap texture (`heatmap-texture.ts`) with a configurable scale, toggleable over the base image.
- **Luminance inspection tools**
  - Hover readout of luminance at the cursor position (`hover-luminance-details.tsx`).
  - Rectangular/region selection tool (`use-image-selection-layer.ts`, `image-selection-context.tsx`) reporting min/max/average luminance and distribution for the selected region (`luminance-aggregates.ts`, `selection-details.tsx`).
  - Illuminance summary panel (`illuminance-details.tsx`).
- **Metadata panel** — displays parsed `.hdr` header fields via `read_hdr_metadata`.
- **View controls** — `view-control-card.tsx` consolidates exposure, overlay, and display toggles.

Known constraint carried over from the legacy viewer: full desktop support depends on the platform's WebView/WebGL capability (see README §"Supported Platforms" note on XQuartz for macOS).

## 6. Feature: Settings

`src/app/settings-page/page.tsx`

- Output folder. There are no tool paths to configure: every tool ships with the app.
- Reports the app, Tauri, Radiance, `hdrgen` and LibRaw versions, read from `public/wasm/versions.json`.
- Configurable default output directory.
- Experience-level preference (`standard` vs. presumably an advanced mode — surfaced in state, UI still minimal).
- App/Tauri version display, sourced live from the Tauri API.
- Settings persist via a Zustand store (`stores/settings-store.ts`) backed by browser `localStorage`, hydrated on load.

## 7. Cross-cutting / Infrastructure

- **Pipeline status & error UX** — a shared `PipelineStatusProvider` (`pipeline-status-context.tsx`) coordinates progress/error state so it's consistent between the Home page and any future consumers.
- **Toast notifications** (`sonner`) for success/error/action feedback app-wide.
- **Image caching** — `src-tauri/src/image_cache/` caches derived TIFF previews and raw-to-TIFF conversions to avoid redundant subprocess work when the same source image is reused across the UI.
- **Static export** — the Next.js frontend builds via `output: "export"` (no Node server at runtime; Tauri serves the static bundle).

## 8. Recent Fixes

- **2026-07-24 — Pipeline evalglare/header-editing order (major regression).** The pipeline was running `evalglare` *before* `header_editing` wrote the view angles into the HDR header. `evalglare` reads its view geometry from the header, so every pipeline run was computing glare against a header without the correct view angles yet applied, producing incorrect glare values. Fixed by splitting `header_editing` into two calls: one before `evalglare` (writes just the view angles) and one after (records the evalglare-derived value), matching the corrected order documented in §4. See `src-tauri/src/pipeline.rs` and `src-tauri/src/pipeline/header_editing.rs`.

## 9. Known Limitations (as of this document)

- Only one image set can be run through the pipeline per submission; the code has an explicit `TODO` for batch processing of multiple sets.
- Falsecolor HDR rendering and multi-image memory cleanup were flagged as unresolved issues in earlier iterations of the image viewer (PR #218); verify these are resolved in the current (#223) implementation before relying on them for large viewing sessions.
- The Image Viewer's WebDriver-based end-to-end test (`e2e-tests/`) uses `@wdio/tauri-service`'s embedded driver, which supports Windows, Linux, and macOS. It runs in CI on Windows and Linux as a non-blocking job (not yet a required check).
- ~~Vendored, bundled Radiance/`hdrgen` binaries~~ — superseded. The tools are compiled to WebAssembly and run in-process rather than being bundled as executables, which removes the install step and the tool-path settings entirely. See the WebAssembly port epic (#227).
