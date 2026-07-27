# Tutorial Conformance Remediation: Specification

**Status:** proposed
**Date:** 2026-07-26
**Reference:** Pierson, C., Cauwerts, C., Bodart, M., & Wienold, J. (2019).
*Tutorial: Luminance Maps for Daylighting Studies from High Dynamic Range
Photography.* LEUKOS. https://doi.org/10.1080/15502724.2019.1684319

This spec covers the defects found when auditing the pipeline against the
tutorial's Table 3 (the 11-step calibration procedure) and §2.3–§2.5. Each issue
is stated with its reproduction evidence, root cause, blast radius, the required
corrected behaviour, and acceptance criteria. It is a specification, not a task
plan: it says what must be true when the work is done, not the order in which to
type it.

## Scope decisions

Three forks were settled before writing:

1. **`.cal` geometry (Issue 6)**: detect and warn only. The pipeline's own crop
   and resize behaviour is left alone; the user is told when their calibration
   file cannot survive the working resolution.
2. **UI**: two new *fields*, not a new interface. The right-hand accordion
   already mirrors Table 3 step by step and is not being restructured. See
   "Placement in the existing accordion" below. A calibration-factor field and
   hdrgen flag toggles are recorded as follow-ups (§9), not implemented.
3. **Deliverable**: analysis-heavy spec, no step-by-step task breakdown.

### Placement in the existing accordion

The accordion in `src/app/home-page/page.tsx:469-786` already maps one section
per tutorial step, and that mapping is the thing to preserve:

| Accordion item | Tutorial step |
|---|---|
| `item-hdr-gen` | 1–3 capture, selection, merging |
| `item-crop-resize` | 5 cropping and resizing |
| `item-correction-fisheye` | 6 projection adjustment |
| `item-correction-vignetting` | 7 vignetting correction |
| `item-correction-neutral-density` | 8 ND filter correction |
| `item-correction-calibration-factor` | 9 photometric adjustment |
| `item-post` ("Output Header Editing") | 10 header editing |

Nothing is moved, renamed, or restyled. The two fields land as follows:

- **Projection type (Issue 5)** goes inside the existing `item-post` section,
  directly above the "Fisheye view angles" `Field` at
  `page.tsx:729-784`. It belongs there because `-vt`, `-vv` and `-vh` are the
  three parts of the one `VIEW=` line that section already writes; today two of
  the three are editable and the third is hardcoded.
- **Measured vertical illuminance (Issue 4)** is tutorial step 11, the one step
  in Table 3 with no section. It gets a sibling `AccordionItem`
  `value="item-validity"` titled "Validity Check", immediately after
  `item-post`, built from the same `FieldContainerAccordionTrigger` / `Field` /
  `FieldContent` / `FieldError` components as every other section. This
  *extends* the step-per-section mapping rather than departing from it.

If you would rather not add a section at all, the field can sit inside
`item-post` alongside the angles; the spec's behaviour is unchanged either way.

## Reproducing the evidence

Every Radiance claim below was verified against Radiance 5.x at
`/usr/local/radiance/bin`, not taken from documentation. Two fixtures are used:

```python
# t.hdr: 4x4, carries a stale hdrgen-style VIEW line
h = (b"#?RADIANCE\nSOFTWARE= hdrgen 1.0\nVIEW= -vtv -vh 45 -vv 45\n"
     b"FORMAT=32-bit_rle_rgbe\nEXPOSURE=1.0\n\n-Y 4 +X 4\n")
open("t.hdr", "wb").write(h + bytes([128, 128, 128, 128]) * 16)

# tb.hdr: 4 wide x 8 tall, bright top half / dark bottom half
hb = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8 +X 4\n"
open("tb.hdr", "wb").write(hb + bytes([255, 255, 255, 140]) * 16
                              + bytes([16, 16, 16, 120]) * 16)
```

File rows in a Radiance picture declared `-Y H +X W` are stored top row first,
so `tb.hdr`'s first four rows are the bright ones.

---

## Issue 1: The crop is vertically mirrored (P0)

### Symptom

`pcompos` crops a region mirrored about the image's horizontal midline. Invisible
with the default mask, which the UI seeds at the exact image centre, where both
coordinate conventions coincide.

### Proof

The tutorial warns about this specific hazard in §2.3.1:

> It should be noted that the origin of the coordinates system might be different
> between the image editing software (e.g. the origin is the upper left corner in
> Gimp, and in *Radiance*, the origin is typically the bottom left corner).

`pcompos`'s y offset is measured from the **bottom**:

```
$ pvalue -h -H -d tb.hdr | head -c 60      # source: bright top, dark bottom
      4.088e+03       4.088e+03  ...  2.518e-04 (last 16 values)

$ pcompos -x 4 -y 4 tb.hdr -0 -0 | pvalue -h -H -d
      2.518e-04  x16          # ydown=0 selects the DARK BOTTOM half

$ pcompos -x 4 -y 4 tb.hdr -0 -4 | pvalue -h -H -d
      4.088e+03  x16          # ydown=4 selects the BRIGHT TOP half
```

The value handed to `pcompos` is measured from the **top**:

- `src/app/home-page/page.tsx:331`: `ydown = Math.round(data.lensMask.y - data.lensMask.radius)`
- `src/components/ui/circular-mask-selection.tsx:88`: `centerY.set(centerY.get() + info.delta.y)`,
  positioned with CSS `translate3d`. DOM origin, y grows downward.
- No y-flip exists anywhere in `src/` (grepped for `size[1] -`, `height -`,
  `naturalHeight -`, `imageHeight -`; the single hit at
  `src/app/image-viewer/view/page.tsx:605` is an unrelated clamp).
- `src-tauri/src/pipeline/crop.rs:29`: `.arg(format!("-{ydown}"))`, passed straight through.

### Root cause

The backend contract is already documented as bottom-left, at
`src-tauri/src/pipeline.rs:169-171`:

```rust
// ydown:
//      The y-coordinate of the bottom left corner of the circumscribed square
//      of the fisheye view (in pixels)
```

The frontend supplies a top-left value against that contract. The backend is
additionally inconsistent with itself: `merge_exposures.rs:200` computes
`ycenter = ydown + radius` and iterates `for y in 0..height` over top-left image
rows (`merge_exposures.rs:322-327`), so the exposure-selection mask reads `ydown`
as top-left and is in the **right** place. Only `crop.rs` disagrees with Radiance.

### Blast radius

Vertical crop offset error is `|(H - y - r) - (y - r)| = |H - 2y|` pixels, where
`y` is the mask centre in top-left pixels and `H` the source height. Zero only
when the circle is exactly vertically centred.

Worked example: Canon EOS 5D Mark II (5616×3744), 3000 px fisheye circle
centred at y = 1800 (72 px above the image centre): correct `ydown` is
`3744 − 1800 − 1500 = 444`, the code sends `1800 − 1500 = 300`, a 144 px shift.
The crop clips 144 px off one edge of the circle and pulls 144 px of black
surround in at the other. Every downstream `.cal` that assumes the circle is
centred in the cropped square is then wrong by the same amount, and the `VIEW`
angles written in step 10 describe a field of view the pixels no longer match.

The tutorial states that an off-centre circle is the normal case, §2.3.1:

> the real viewing angle is 186°, and the center of the fisheye view is slightly
> shifted towards the upper-right corner of the image.

### Required behaviour

The Tauri command parameter MUST be defined in the top-left origin the UI
actually produces, and the conversion to Radiance's bottom-left origin MUST
happen in `crop.rs`, against the height of the image being cropped.

- Rename the parameter `ydown` → `ytop` across `pipeline.rs`, `crop.rs`,
  `merge_exposures.rs` and the `invoke` payload in `page.tsx`, and correct the
  doc comment to "The y-coordinate of the **top** left corner … measured from the
  top of the image, matching the image-editing convention."
- `crop.rs` MUST read the input picture's resolution and pass
  `ydown_radiance = height - (ytop + diameter)` to `pcompos`.
- `merge_exposures.rs::filter_images` is already correct under this definition
  and MUST NOT be changed.

The resolution is read from the picture itself, not from frontend metadata: for
raw input the pipeline crops a TIFF-derived HDR whose dimensions need not match
the preview the mask was drawn on. The format is verified:

```
$ getinfo -d tb.hdr
tb.hdr: -Y 8 +X 4
$ getinfo -d t.hdr
t.hdr: -Y 4 +X 4
```

Parse the file directly rather than shelling out: read bytes up to the first
empty line, then read the following resolution line and match the exact form
`-Y <rows> +X <cols>`. Any other orientation string MUST produce a
`PipelineError::Processing` naming the file and the string found, rather than a
silently mis-placed crop.

`ytop + diameter > height`, or a negative result, MUST produce a
`PipelineError::InvalidInput` for field `ytop`: the mask extends past the
image edge and no crop is meaningful.

The height must come from the picture, not from frontend metadata, because it
varies by input format for the same scene. Measured on the e2e fixtures: the
JPEG is 5616×3744 (`sips`), while the same scene's CR2 through the app's own
`dcraw_emu` invocation (`-T -o 1 -W -j -q 3 -g 2 0 -t 0 -b 1.1 -Z`) is
**5796×3870**. A height cached or plumbed from anywhere but the image being
cropped will be wrong for one of the two paths.

#### The rename crosses the Tauri IPC boundary

Tauri matches command parameters **by name at runtime**. Renaming
`ydown` → `ytop` in the `#[tauri::command]` signature without renaming the key in
`page.tsx`'s `invoke("pipeline", params)` payload compiles cleanly and fails only
when the pipeline is run. The rename MUST land atomically across:

- `src-tauri/src/pipeline.rs`: command signature, doc comment, `process_image_set`
- `src-tauri/src/pipeline/crop.rs`, `src-tauri/src/pipeline/merge_exposures.rs`
- `src/app/home-page/page.tsx:331,391`: the computed value and the payload key

#### The e2e fixtures encode the same ambiguity

`e2e-tests/test/specs/app.e2e.ts:73-80` reads `ydown` from
`ImageLensInformation.txt` and drives the UI mask with `y = ydown + radius`,
i.e. it interprets the fixture as top-left. Today's frontend then computes
`ydown = y - radius`, returning the original number, which `crop.rs` passes to
`pcompos` as bottom-left. **The round trip cancels**: the pipeline currently
hands `pcompos` exactly the fixture's `ydown`, whatever convention that number is
in.

Consequently, fixing `crop.rs` alone changes what the e2e test feeds `pcompos`
(74 → 58 for the JPEG fixture) and will move the golden `output.hdr`. The test's
conversion MUST be updated in the same change.

Which direction is correct depends on the fixture's convention, and **that cannot
be determined from the files as they stand.** Measuring the circle directly in
`IMG_6962.JPG` is inconclusive: the fisheye edge is soft, so a binary-threshold
extent varies from rows 52–3682 at threshold 20 to 86–3640 at threshold 120,
giving roughly ±20 px of uncertainty on each gap: larger than the 16 px that
separates the two hypotheses (top gap 74 vs 58). The variable name `ydown`, the
tutorial's definition of fisheye view coordinates as "the coordinates (in pixels)
of the bottom-left corner of the square encompassing the total viewing angle",
and the doc comment at `pipeline.rs:169-171` all point to bottom-left, but none
of that is proof about a fixture file.

**The e2e suite is not the oracle for this change.** The fixtures and the golden
`output.hdr` were produced by a student and have not been verified; the golden
was generated by the same round trip described above, so it encodes whatever
convention the fixture happens to use and cannot arbitrate between them.
Ground truth will be established by re-running the cases manually and checking
the values and outputs before anything merges.

The spec therefore requires, in this order:

1. The manual verification establishes, for each fixture, where the fisheye
   circle actually is and therefore which origin `ydown` is written in.
2. `ImageLensInformation.txt` gains an explicit `origin <- bottom-left` (or
   `top-left`) line recording that finding, so the next reader does not have to
   re-derive it.
3. `e2e-tests/test/inputs/CR2/ImageLensInformation.txt` gains `xres <- 5796` and
   `yres <- 3870` (measured above); the JPEG fixture already carries
   `xres`/`yres`.
4. `readLensInformation` converts according to the declared origin:
   `y = ydown + radius` for top-left, `y = yres - (ydown + radius)` for
   bottom-left.
5. The golden `output.hdr` is regenerated from the verified inputs and only then
   becomes a regression guard.

Note the diagnostic value of the round trip: if the fixture turns out to be
bottom-left, then the current pipeline has been cropping these fixtures
*correctly by accident*, and the golden is right even though both the code and
the test are wrong. If it turns out to be top-left, the golden is cropped from
the mirrored position and is wrong today. Either way the manual check settles it,
and step 5 makes the answer durable.

### Acceptance criteria

- A mask whose centre is above the image midline crops the circle, not its
  mirror. Concretely: with a 4×8 source, `diameter = 4`, `ytop = 0`, the output
  is the bright top half.
- A vertically centred mask produces byte-identical output to today's build
  (regression guard: the default path must not change).
- `filter_images`'s selected frames are unchanged for any input.
- A mask running past the bottom edge is rejected with a named field error.
- The e2e fixture origin is declared from the manual verification, not inferred,
  and `readLensInformation` converts accordingly. The golden `output.hdr` is
  regenerated afterwards; it is not used to judge this change.
- Running the pipeline end to end proves the IPC rename landed on both sides; a
  green `cargo build` does not.

---

## Issue 2: Exposure selection keeps everything, and is off by default (P1)

### Symptom

`filter_images` returns the whole sequence minus the single darkest frame, so
tutorial step 2 has no effect even when enabled. It is also disabled by default
and never runs for raw input.

### Proof

Tutorial §2.4.2:

> The LDR images have to be selected in such a way that the darkest exposure of
> the useful sequence has no R, G, and B pixel values greater than 228, and the
> lightest exposure has no R, G, and B pixel values below 27. […] The selection
> rules consist therefore of restraining the sequence from the darkest
> overexposed image having no pixel value below 27 to the lightest underexposed
> image having no pixel value over 228.

`merge_exposures.rs:275` sorts brightest→darkest. Let the no-black prefix be
`[0..p]` and the no-white suffix be `[s..n-1]`. The tutorial's band is `[p, s]`:
frames brighter than `p` add no shadow information already captured by `p`, and
frames darker than `s` add no highlight information already captured by `s`.

The code takes the opposite end of each run: `merge_exposures.rs:283-308`:

```rust
for (i, (_, pixels_below, _, _)) in sorted_array.iter().enumerate() {
    if *pixels_below == 0 { start_index = i as i32; break; }   // FIRST, not last
}
for (i, (_, _, pixels_above, _)) in sorted_array.iter().enumerate() {
    if i > start_index as usize && *pixels_above == 0 { end_index = i as i32; }
}                                                              // LAST, not first
for i in start_index..end_index {                              // and excludes end
```

Transcribing that logic and running it against a realistic 15-frame bracket:

```
below = [0,0,0,0,0,0,0,120,900,3000,7000,12000,20000,31000,44000]
above = [41000,29000,18000,9500,4200,1500,400,90,12,0,0,0,0,0,0]

current : start=0 end=14 -> keeps 14/15 frames [0..13]
tutorial: p=6   s=9      -> keeps  4/15 frames [6,7,8,9]
```

Defaults: `src/app/home-page/page.tsx:95` sets
`filterIrrelevantSrcImages: false`, and `merge_exposures.rs:96-107` reaches
`filter_images` only in the `else if filter_images_flag` branch, which raw input
never enters.

### Root cause

Both bounds are inverted, and the range is half-open where it should be
inclusive. The steelman (that the code intends a permissive filter) fails: the
27/228 test becomes a no-op under this reading, which cannot be the intent given
the stated purpose in §2.4.2 ("only LDR images bringing useful information should
be inputted in the merging algorithm in order to accelerate the HDR generation
process and make it more stable").

The 27/228 thresholds and the fisheye-circle mask are correct and must be kept.

#### Confirmed: the filter uses the user's fisheye mask

`merge_exposures.rs:199-214`:

```rust
let radius  = diameter / 2.0;
let xcenter = xleft + radius;
let ycenter = ydown + radius;
...
let image = image::open(&input_images[0])?;
let (width, height) = image.dimensions();
let mask = compute_circle_mask(height as usize, width as usize, xcenter, ycenter, radius);
```

`diameter`, `xleft` and `ydown` are the same three numbers the lens-mask control
produces (`page.tsx:329-331`, from `data.lensMask.{radius,x,y}`), so the pixel
counting is restricted to exactly the circle the user drew. Four properties worth
recording, since they are load-bearing elsewhere in this spec:

- **The mask is in top-left coordinates.** `compute_circle_mask` iterates
  `for y in 0..height` over rows as `image::open` yields them, top row first
  (`merge_exposures.rs:320-330`). This is why `filter_images` is the component
  that agrees with the UI and `crop.rs` is the one that does not (Issue 1). After
  the `ydown` → `ytop` rename this code is correct **unchanged**.
- **One mask is built from the first image and reused for all of them.** The grid
  is sized from `input_images[0]`'s dimensions, then indexed per image as
  `y * width + x` using that image's own width. Correct for a bracket, where
  every frame shares a resolution; silently misaligned if it ever does not. The
  spec adds a guard: any image whose dimensions differ from the first MUST raise
  `PipelineError::Processing` naming both sizes, rather than counting the wrong
  pixels.
- **JPEG only.** The call site guards on `is_jpeg(&input_images[0])`
  (`merge_exposures.rs:95`) and each worker re-checks, so a non-JPEG among JPEGs
  is a hard error. Raw never reaches it (§9).
- **`avg_brightness` divides the masked sum by the full frame area**
  (`merge_exposures.rs:265`), so it is not the mean inside the mask. The divisor
  is identical for every frame in a set, so the brightest-to-darkest ordering is
  unaffected. Harmless, but it should be renamed or corrected while the
  surrounding code is being touched, because it reads as a bug.

### Blast radius

Table 6 rates an omitted selection step at 0–5 % luminance error for some pixels,
via superfluous frames pulling weight toward improperly exposed pixels. Merge
time also scales with frame count: 15 frames instead of 4 in the example.

### Required behaviour

- `start_index` MUST be the **last** index with `pixels_below == 0`.
- `end_index` MUST be the **first** index `>= start_index` with `pixels_above == 0`.
- The kept range MUST be inclusive of both endpoints.
- If no frame has `pixels_below == 0`, `start_index` MUST be `0` (every frame is
  underexposed somewhere: keep them all, as §2.4.2 directs: "In some cases,
  every overexposed image of a sequence might contain black pixels, or inversely
  for white pixels. The useful sequence will thus include all over- or
  underexposed LDR images").
- If no frame has `pixels_above == 0`, `end_index` MUST be `n - 1`, by the same
  rule.
- The selection MUST be emitted as a `PipelineStatusKind::Step` message naming
  how many frames of how many were kept, so a user can see the step ran.

**Decision: `filterIrrelevantSrcImages` keeps its `false` default.** Flipping it
to `true` in the same release that makes the filter actually work would take
existing users from ~15 merged frames to ~4 with no warning, changing every
output they regenerate. The tutorial does treat selection as a normal part of the
procedure, so the default should change, but as a deliberate, release-noted
decision, not as a side effect of a bug fix. Recorded as a follow-up in §9. The
checkbox label MUST cite the step so the choice is informed: "Select useful
exposures (tutorial §2.4.2, recommended)".

Extending selection to raw input is out of scope (§9), because the thresholds are
defined on 8-bit sRGB values and the raw path produces 16-bit TIFFs.

### Acceptance criteria

- On the `below`/`above` vectors above, the selection is exactly frames 6–9.
- An all-underexposed sequence (every frame has black pixels) keeps every frame.
- An all-overexposed sequence keeps every frame.
- A single-frame input returns that frame.
- The status log states the count.

---

## Issue 3: Header pollution from the two `header_editing` calls (P1)

### The intended design, which is correct

`header_editing` is deliberately called twice (`pipeline.rs:789` and
`pipeline.rs:855`): once before `evalglare` to write the view information
evalglare needs to read from the header, and once after to record evalglare's
output. That ordering is what commit d9aec8b established and it matches Table 3
(step 10 before step 11). **The two-call structure is not in question here.**
What is wrong is that both calls emit the same unconditional `VIEW=` argument,
and the second one passes a `-c` flag that `getinfo` does not mean the way the
code assumes.

### Symptom

Every output file carries a junk `-c` line and a duplicated `VIEW=` line.

### Proof: the stray `-c`

`src-tauri/src/pipeline/header_editing.rs:32` builds
`.arg("-c").arg(illuminance_arg)`. `getinfo -a` treats every remaining argv as a
header line to append:

```
$ getinfo -a "VIEW= -vta -vv 180 -vh 180" -c "PHOTOPIC_ILLUMINANCE=297.230100" < t.hdr | getinfo
	#?RADIANCE
	SOFTWARE= hdrgen 1.0
	VIEW= -vtv -vh 45 -vv 45
	EXPOSURE=1.0
	VIEW= -vta -vv 180 -vh 180
	-c                                    <-- junk
	PHOTOPIC_ILLUMINANCE=297.230100
	FORMAT=32-bit_rle_rgbe
```

Dropping `-c` produces a clean header:

```
$ getinfo -a "VIEW= -vta -vv 180 -vh 180" "PHOTOPIC_ILLUMINANCE=297.230100" < t.hdr | getinfo
	...
	VIEW= -vta -vv 180 -vh 180
	PHOTOPIC_ILLUMINANCE=297.230100
	FORMAT=32-bit_rle_rgbe
```

### Proof: the duplicated `VIEW=`

`header_editing.rs:21-25` builds the `VIEW=` argument unconditionally, so both
calls append it. Replaying the two calls exactly as `pipeline.rs` issues them:

```
$ getinfo -a "VIEW= -vta -vv 180 -vh 180" < p.hdr > hv.hdr
$ getinfo -a "VIEW= -vta -vv 180 -vh 180" -c "PHOTOPIC_ILLUMINANCE=297.23" < hv.hdr | getinfo
	#?RADIANCE
	SOFTWARE= hdrgen 1.0
	EXPOSURE=1.0
	VIEW= -vta -vv 180 -vh 180
	VIEW= -vta -vv 180 -vh 180        <-- written twice
	-c                                <-- junk
	PHOTOPIC_ILLUMINANCE=297.23
	FORMAT=32-bit_rle_rgbe
```

### Root cause

Both defects come from one shape: `header_editing` takes the view angles as
required parameters and the evalglare value as an optional extra, so the function
cannot express "append only the illuminance". The second call is forced to
re-emit the view line it does not need to change.

`-c` was presumably read as "add a **c**ustom variable". In `getinfo` it means
"execute the following command on the data after the header" and is a mode
selector, not a per-argument flag; it is inert here only because `-a` claimed the
mode first and swallowed it as text.

### Blast radius

Cosmetic today. `-c` is not `VAR=value`, so no Radiance tool interprets it; the
two `VIEW=` lines are identical and Radiance resolves the last one, so the
effective view is right either way (verified in §8). Both are landmines for any
downstream parser that assumes header lines are comments or assignments, and the
duplicate makes the header actively misleading to a human reading it.

### Required behaviour

The two-call structure is preserved exactly. `header_editing` gains the ability
to say what each call is for:

- The view arguments MUST become optional. Call one passes them; call two passes
  `None` and appends only the illuminance entries. The final header MUST contain
  exactly one `VIEW=` line.
- The `-c` flag MUST be dropped; the illuminance is appended as a further bare
  info argument to `-a`, verified above.
- Per Issue 5, the evalglare value and the measured value MUST be two independent
  `Option<String>` parameters, so call two can carry either, both, or, when
  neither exists, be skipped.
- Values MUST be `.trim()`-ed before interpolation. `evalglare` emits
  `297.230100\n`; `getinfo` currently normalises the stray newline, but the code
  MUST NOT depend on that.

### Acceptance criteria

- The final header contains exactly one `VIEW=` line, on every path.
- On any path where evalglare runs (projection `vta` or `vth`), the written
  header contains no line beginning with `-`, and contains exactly one
  `PHOTOPIC_ILLUMINANCE=` line whose value parses as a float with no surrounding
  whitespace.
- On the `vtv` path evalglare is skipped, so no `PHOTOPIC_ILLUMINANCE=` is
  written. The second `header_editing` call still runs if a measured illuminance
  was entered, and the single-`VIEW=` criterion still holds: see Issue 5.

---

## Issue 4: The validity check is computed but never checked (P1)

### Symptom

`evalglare -V` runs and its result is stored in the header. Nothing compares it
to anything, and there is nowhere to enter the measured value.

### Proof

`pipeline.rs:819-840` calls `evalglare` and uses the result only as the header
value at `pipeline.rs:869`. `pipelineConfig`
(`src/app/home-page/(pipeline-configuration)/config-provider.tsx:5-27`) has no
field for a measured illuminance.

Tutorial §2.5.8 makes the comparison the point of the step:

> the integration of all luminance values over the hemispheric FOV captured in
> the HDR image should correspond to the illuminance value measured by a properly
> calibrated illuminance meter placed next to the lens

> When the error between the sensor-measured and HDR-derived illuminance values
> is larger than 25 % […] it most probably means that for some areas of the HDR
> image, the luminance is over- or under-estimated.

And §3.1:

> In general, an error in vertical illuminance of less than 10 % should be
> expected, and HDR images with an error of more than 25 % should be rejected.

The tutorial also treats skipping it as a data-integrity failure:

> If an illuminance comparison check had not been conducted for every calibrated
> HDR image, it might have happened that these erroneous luminance maps corrupt
> the dataset, making the associated results misleading.

§2.4.1 confirms the measured value is captured at shooting time, so requiring it
as an input costs the user nothing they do not already have:

> the sequence capture should always be accompanied by at least one spot
> luminance measurement and one vertical illuminance measurement

### Root cause

Only half the step was built. `evalglare -V` is invoked and its output stored,
which looks like step 11 from the code, but the comparison that gives the step
its meaning was never implemented and the input it needs was never added to the
form. Nothing fails, so nothing surfaces the gap.

### Blast radius

Silent acceptance of bad luminance maps. The tutorial's own 795-image dataset had
1.38 % of images exceeding 25 % error after a meticulously executed procedure.
These are not hypothetical.

### Required behaviour

- `pipelineConfig` gains `validityCheck: { measuredVerticalIlluminanceLux: number | null }`,
  default `null`, surfaced as an optional numeric field in lux in the
  `item-validity` section (see "Placement in the existing accordion").
- The Tauri command gains `measured_vertical_illuminance: Option<f64>`.
- After `evalglare` returns, the pipeline MUST parse `value.trim()` as `f64`. A
  value that does not parse MUST raise a `Warning` naming the raw output and skip
  the comparison; it MUST NOT abort.
- When a measured value `> 0.0` is supplied, the pipeline MUST compute
  `error_pct = (ev_hdr - ev_measured).abs() / ev_measured * 100.0` and emit:
  - `error_pct > 25.0` → `Warning`: "Validity check FAILED: HDR-derived vertical
    illuminance {ev_hdr:.1} lux vs measured {ev_measured:.1} lux ({error_pct:.1} %
    error). The tutorial recommends rejecting HDR images with more than 25 %
    error (Pierson et al. 2019, §3.1)."
  - `10.0 < error_pct <= 25.0` → `Warning`: "…{error_pct:.1} % error, above the
    10 % typically expected."
  - `error_pct <= 10.0` → `Step`: "Validity check passed ({error_pct:.1} % error)."
- The measured value MUST also be written to the header as
  `MEASURED_VERTICAL_ILLUMINANCE=<lux>` alongside `PHOTOPIC_ILLUMINANCE`, so the
  check is reproducible from the file alone.

**Interaction with Issue 5.** When the projection is `vtv`, evalglare is skipped
and there is no HDR-derived illuminance to compare against. In that case the
pipeline MUST emit a `Step` status, "Validity check skipped: evalglare requires
an angular fisheye view; the measured value was recorded but not compared", and
MUST still write `MEASURED_VERTICAL_ILLUMINANCE=` to the header. It is the user's
own measurement and the header is the reproducibility record; dropping it because
the app could not use it would lose data the user supplied. No
`PHOTOPIC_ILLUMINANCE` is written on that path. The UI MUST NOT hide or disable
the measured-illuminance field when `vtv` is selected, but MUST show the same
skip explanation next to it.

**Decision: a failed check does not abort the run.** The pipeline still writes
its outputs. Rejection is a research-practice judgement about whether to *use*
the map, not a processing failure, and the user needs the file in order to
inspect why it failed (§2.5.8 points at pixel overflow as the usual cause, which
is diagnosed by looking at the image). The status is a loud `Warning`, and the
header records both numbers.

### Acceptance criteria

- With no measured value entered, behaviour is unchanged apart from the header
  gaining nothing extra.
- Measured 1000 lux against an HDR-derived 1260 lux (26 %) yields the >25 % message and
  a completed run with outputs on disk.
- Measured 1000 against 1150 yields the 10-25 % message (15 %).
- Measured 1000 against 1050 yields the pass message (5 %).
- Measured `0` or negative is rejected at the form level, not divided by.
- Unparseable evalglare output warns and completes.
- A `vtv` run with a measured value completes, emits the skip status, and the
  final header carries `MEASURED_VERTICAL_ILLUMINANCE=` but no
  `PHOTOPIC_ILLUMINANCE=`.
- A `vtv` run with no measured value completes and produces the final `.hdr`
  from `header_editing_view.hdr`.

---

## Issue 5: Projection type is hardcoded to `-vta` (P1)

### Symptom

Every image is labelled equidistant, regardless of lens or whether the projection
adjustment step ran.

### Proof

`src-tauri/src/pipeline/header_editing.rs:21` and
`src-tauri/src/pipeline/evalglare.rs:21` both hardcode `-vta`. The UI exposes
only the two angles (`src/app/home-page/page.tsx:719-783`).

Tutorial §2.5.7:

> The projection type is reported in the header as -vta for an equidistant
> projection, -vth for an orthographic projection, or -vtv for a non-fisheye lens.

Table 3, note to step 10:

> For the command of step 10, vta needs to be changed to vth for an hemispheric
> projection.

Table 6 rates the cost:

> Header editing: view type — Wrong calculation of angles and solid angles […]
> Error in vertical illuminance and in metrics using angles in their equation
> (i.e. DGP, Lavg) up to 100 % (e.g. when a non-fisheye view type is used for a
> fisheye lens)

Measured on the same pixels, view type alone moves the integrated illuminance by
67 %:

```
$ evalglare -vta -vv 180 -vh 180 -V t.hdr   ->  297.230100
$ evalglare -vth -vv 180 -vh 180 -V t.hdr   ->   97.684316
$ evalglare -vtv -vv 180 -vh 180 -V t.hdr   ->  error: invalid view specified
```

### Root cause

`-vta` is a sound default: the shipped `example/fisheye_corr.cal` maps
equisolid→equidistant by default (`mapsolid(r) : 2/PI*asin(sqrt(2)*r)`), so an
image that went through projection adjustment really is equidistant. The defect
is that the default is unconditional: a user who supplies no fisheye `.cal`, or
supplies one with a different `rad(r)`, still gets `-vta` stamped on the header.

### Blast radius

Up to 100 % error in vertical illuminance and in every angle-dependent metric
(DGP, average luminance), per Table 6.

### Required behaviour

- `pipelineConfig.fisheyeView` gains `projection: "vta" | "vth" | "vtv"`,
  defaulting to `"vta"`, surfaced as a three-way selector inside the existing
  `item-post` section, above the view angles, labelled with the
  tutorial's wording: "Equidistant (−vta)", "Orthographic (−vth)",
  "Non-fisheye (−vtv)".
- The Tauri command gains `projection: String`, validated against exactly those
  three values; anything else MUST be a `PipelineError::InvalidInput` for field
  `projection`.
- `header_editing.rs` MUST build `VIEW= -{projection} -vv {v} -vh {h}`.
- `evalglare.rs` MUST pass `-{projection}` instead of the literal `-vta`.
- **`vtv` MUST skip the evalglare step entirely**, emitting a `Step` status:
  "Validity check skipped: evalglare requires an angular fisheye view (−vta or
  −vth); the selected projection is −vtv." This is forced by the tool, as shown
  above: `evalglare -vtv` exits with "invalid view specified". No
  `PHOTOPIC_ILLUMINANCE` is written on that path.
- The two-call structure of Issue 3 is preserved. Call one always runs and writes
  the view line. Call two passes `None` for the view arguments and carries the
  evalglare value and the measured value as two independent `Option<String>`s,
  appending whichever are present. It therefore runs whenever **either** exists,
  so a `vtv` run with a measured illuminance still produces
  `header_editing.hdr` carrying `MEASURED_VERTICAL_ILLUMINANCE=` and no
  `PHOTOPIC_ILLUMINANCE=`. When both are absent, `header_editing_view.hdr` is
  copied forward as the final image and the falsecolor step reads it.

### Acceptance criteria

- Selecting orthographic writes `VIEW= -vth …` and runs `evalglare -vth`.
- Selecting non-fisheye writes `VIEW= -vtv …`, skips evalglare, still produces
  the final `.hdr` and the falsecolor output.
- The default remains `-vta`, byte-identical to today for existing users.
- An out-of-range projection string is rejected by name.

---

## Issue 6: Resolution-dependent `.cal` files are applied silently (P2)

### Symptom

A vignetting correction calibrated for one resolution is applied to an image of
another, correcting about the wrong centre with the wrong normalising radius, and
nothing says so.

### Proof

Tutorial §2.5.2:

> Cropping and/or resizing an HDR image implies that the new size and new centre
> coordinates have to be considered in the .cal files that have been determined
> during the one-time setup (e.g. the .cal files for the vignetting correction).

The shipped files split cleanly:

`example/fisheye_corr.cal` is resolution-independent: it derives its geometry
from the picture:

```
xc : xres/2;
yc : yres/2;
inp_r = sqrt(sq((x-xc)/xres) + sq((y-yc)/yres));
```

`example/vignetting.cal` is not: it hardcodes a 1000×1000 image:

```
r=sqrt(sq(x-500)+sq(y-500))/500;
```

And the pipeline's working resolution is variable: `pipeline.rs:631` runs the
resize only `if diameter > 1000.0`. A 900 px fisheye circle is therefore cropped
to 900×900 and never resized, so `vignetting.cal` centres its correction at
(500, 500) of a 900×900 image (50 px off in each axis) and normalises by a
radius of 500 where the true radius is 450.

`example/calibration_factor.cal` (`ro=ri(1)*1.18`) and the ND filter files are
per-pixel scalars with no geometry, so they are unaffected.

**The shipped examples are not the population being checked.** Both geometric
`.cal` files are user-supplied: each is derived per camera/lens during the
tutorial's one-time setup (§2.3.4 for the distortion function, §2.3.5 for the
vignetting curves): so a user-written `fisheye_corr.cal` can hardcode a pixel
radius exactly as readily as `vignetting.cal` does. That the shipped
`fisheye_corr.cal` happens to use `xres`/`yres` is a property of that one file,
inherited from the Radiance distribution, not a guarantee about the class. The
check therefore applies to **both** geometric `.cal` inputs, and the shipped
`vignetting.cal` is useful precisely because it gives the warning a real,
in-repo case to fire on.

### Root cause

The pipeline has no notion of the resolution a `.cal` was calibrated for, and no
way to check one against the other.

### Blast radius

Table 6 rates a bad vignetting correction at up to 70 % luminance error in the
outer field of view, depending on lens and aperture. The error is largest exactly
where fisheye images are already least trustworthy.

### Required behaviour

Per the scope decision, the pipeline's crop and resize behaviour is **not**
changed and the example `.cal` files are **not** rewritten. Instead:

- `pipeline.rs` MUST track the working resolution: `diameter × diameter` after
  the crop, replaced by `xdim × ydim` when the resize runs.
- Before applying the fisheye and vignetting corrections, the two geometry-
  dependent steps, the pipeline MUST inspect the `.cal` file and emit a
  `Warning` when it cannot adapt to resolution. The test: the file text contains
  neither `xres` nor `yres`.
- The warning MUST name the file, the working resolution, and the numeric
  literals that look like pixel constants, so the user can see the mismatch:

  > `vignetting.cal` does not reference `xres`/`yres`, so it cannot adapt to the
  > working resolution. The image is 900×900 at this step and the file contains
  > the constants 500, 500, 500. If these are pixel coordinates calibrated for a
  > different resolution, the correction will be applied about the wrong centre.
  > See Pierson et al. 2019 §2.5.2.

- Candidate constants are extracted with std only (there is no `regex`
  dependency in `src-tauri/Cargo.toml`): split the file text on any character
  that is not a digit or `.`, parse each fragment as `f64`, keep values `>= 100.0`,
  de-duplicate preserving order, and cap the reported list at eight entries.
- The check MUST NOT be applied to the ND filter or photometric `.cal` files.
- The check MUST NOT block: it is advisory, and a user may legitimately have a
  hardcoded `.cal` that matches the working resolution exactly.

Note that `example/vignetting.cal` will trip this warning whenever the working
resolution is not 1000×1000. That is intended, and doubles as a self-test.

### Acceptance criteria

- `example/vignetting.cal` at 900×900 warns and names 500.
- `example/vignetting.cal` at 1000×1000 still warns, the check cannot prove the
  constants match, only that the file is resolution-dependent, and the message
  states the working resolution so the user can confirm it themselves.
- `example/fisheye_corr.cal` never warns, at any resolution, because it uses
  `xres`/`yres`, not because it is the fisheye slot.
- A user-supplied fisheye `.cal` containing hardcoded pixel constants warns
  exactly as the vignetting one does. The check keys on the file's content, never
  on which input it was supplied to.
- `example/calibration_factor.cal` and the ND files are never inspected.
- An unreadable `.cal` warns about the read failure and continues; the correction
  step itself then fails or succeeds on its own terms.

---

## Issue 7: falsecolor legend arguments are malformed (P2, latent)

### Symptom

The legend width and height are never applied. Currently unreachable.

### Proof

`src-tauri/src/pipeline/falsecolor.rs:63-64` emits `-lw/-lh` as a single literal
argument followed by the dimensions as one string. `falsecolor` is a Perl script
matching options by substring (`m/-lw/`), so `-lw/-lh` matches `-lw` and consumes
the next argument as the width:

```
$ falsecolor -s 1000 -l cd/m2 -n 8 -e "-lw/-lh" "100 200" -i t.hdr
Argument "100 200" isn't numeric in numeric le (<=) at .../falsecolor line 116.

$ falsecolor -s 1000 -l cd/m2 -n 8 -e -lw 100 -lh 200 -i t.hdr
(no such warning)
```

`-lh` is never set, and `falsecolor` line 118 then zeroes the legend when
`legwidth <= 20 || legheight <= 40`.

The branch is dead today: `src/app/home-page/page.tsx:377,385-388` hardcodes
`legendDimensions`, `scaleLabel`, `scaleLevels` and `scaleLimit` to `""`, so
`falsecolor.rs:57` always takes the `-e -i` path. The file's own comment marks
this as pending refactor ("these should only be exposed on the image viewer").

### Root cause

An option pair was written as one token, and the two dimensions as one string.

### Blast radius

None today. It fails the moment any caller populates `scaleLabel`, which the
image viewer is expected to do.

### Required behaviour

- `LuminanceArgs.legend_dimensions: String` MUST be replaced by
  `legend_width: String` and `legend_height: String`.
- `falsecolor.rs` MUST emit `-lw <width> -lh <height>` as four separate
  arguments.
- Both MUST parse as positive integers before use; a non-numeric or absent value
  MUST omit both flags rather than pass garbage, letting `falsecolor` use its
  defaults.

### Acceptance criteria

- The generated argument vector for a populated scale contains
  `["-lw", "100", "-lh", "200"]` as consecutive elements.
- Running that vector against a fixture produces no "isn't numeric" warning.
- An empty or non-numeric dimension omits both flags and still succeeds.

---

## 8. Verified and explicitly not changing

Recorded so they are not re-litigated:

- **The missing `sed '/VIEW/d'` erase (Table 3, step 10, first command).** The
  app skips it. Verified harmless: `pcompos` always indents the inherited header
  when cropping, which deactivates the stale hdrgen `VIEW=` line, in every path
  including the no-`.cal` path. Radiance also resolves the **last** active `VIEW`
  line when several are present: confirmed by feeding a two-VIEW file through
  `pcomb -h` and reading back
  `VIEW= -vta -vp 0 0 0 … -vh 180 -vv 180`. No behavioural difference.
- **Untrimmed `evalglare` stdout in the header.** `getinfo` normalises the
  trailing newline; no truncation occurs. Trimming is still specified in Issue 3
  so the code does not depend on that.
- **`pcomb -h` in `photometric_adjustment.rs`.** A valid option that suppresses
  copying of the input header. Inconsistent with the other three `pcomb` calls,
  which nest the input header, but not incorrect.
- **`EXPOSURE=1.0000e+00` re-added by `pcompos`.** The value is 1.0, so §2.5.1's
  nullification is not undone.
- **Stage ordering.** `pipeline.rs` walks Table 3's eleven steps in order, and
  commit d9aec8b (header editing before evalglare) is correct: evalglare reads
  its view geometry from the header, so step 10 must precede step 11.

## 9. Follow-ups, deliberately out of scope

- **Photometric adjustment by factor.** Table 3 step 9 is `pcomb -s factor` with
  "measured LT or calibration factor" as the input; the app requires a
  hand-written `.cal`. `example/calibration_factor.cal` is a plain per-channel
  1.18× scalar, so the two are numerically identical: this is a usability gap,
  not a correctness one. A numeric field offering "calibration factor" or
  "measured spot luminance" as an alternative to the file would close it.
- **hdrgen flag control.** The app always sends `-a -e -f -g -F`. §2.4.3 advises
  turning `-a` off for tripod-stabilised sequences and avoiding `-e` when the
  camera reproducibility test passed; `-F` appears nowhere in the tutorial though
  the binary accepts it. Exposing these as toggles requires deciding defaults,
  which is a separate conversation.
- **Flipping `filterIrrelevantSrcImages` to `true` by default.** Deferred out of
  Issue 2 so that making the filter work and changing who gets it are separate,
  separately revertable decisions. Ship it with a release note stating that
  merges will now use fewer frames.
- **Exposure selection for raw input.** The 27/228 thresholds are defined on
  8-bit sRGB values; applying them to the 16-bit TIFFs from `dcraw_emu` needs
  thresholds restated in the TIFF's domain.
- **`raw2hdr`.** §2.4.1 names it as the raw-input equivalent of `hdrgen`. The app
  uses `dcraw_emu` → TIFF → `hdrgen` instead, including a `-b 1.1` brightness
  multiplier that is constant across frames and therefore absorbed by the
  calibration factor. Worth revisiting as a deliberate choice, not a defect.
- **`pcomb -h` consistency** across the four correction steps.

## 10. Cross-cutting acceptance

- The default configuration (centred mask, `-vta`, no measured illuminance,
  exposure selection off) produces output byte-identical to the current build
  except for the removal of the `-c` header line. Selection stays off by default
  (Issue 2), the crop conversion is a no-op for a centred mask (Issue 1), and the
  projection default is unchanged (Issue 5), so nothing else moves.
- For an **off-centre** mask the crop output changes, and that is the point of
  Issue 1. This is the one intended output change in the release and MUST be
  called out in the release notes: images calibrated with an off-centre lens mask
  were cropped from the mirrored position and should be regenerated.
- The e2e suite is re-established, not relied upon: fixtures verified manually,
  origins declared, goldens regenerated. Until that happens a green e2e run is
  not evidence for any claim in this spec.
- Every new failure mode surfaces as a typed `PipelineError` with a named field,
  or a `PipelineStatusKind::Warning`, never a silent fallback.
- `docs/` records the coordinate convention (`ytop` is top-left, `pcompos` is
  bottom-left, conversion happens in `crop.rs`), because this is the second time
  the convention has been the source of a defect.
