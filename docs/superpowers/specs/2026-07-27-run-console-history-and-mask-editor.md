# Proposals: mask editor, run console, run history and presets

**Status:** proposal, not yet approved
**Date:** 2026-07-27

Covers three requests that are related but separable:

- **A. Lens mask editor modal** (request 3)
- **B. Run console modal** (request 5)
- **C. Run history and input presets** (request 6)

B and C share a storage layer and should ship in that order. A is independent
and much smaller. Request 4 (app logo) is parked at the end.

---

## A. Lens mask editor modal

### The problem

The mask is manipulated on a preview that occupies part of a side panel. At that
size one on-screen pixel is roughly six image pixels on a 5616 px wide frame, so
the finest possible adjustment is about six pixels of diameter. The 3 px red
border is itself wider than the precision the control offers, which is what makes
it feel imprecise: you cannot see the circle edge against the fisheye edge closely
enough to tell whether they coincide.

Note this is now the *only* remaining imprecision in mask setup. The placement bug
is fixed (`aa919b9`): the mask starts centred with a radius of height/4 rather
than stranded in the corner.

### Proposal

A modal that gives the mask the whole window, plus the two things the inline
control cannot offer: magnification and a visible fit signal.

```
┌─ Configure lens mask ──────────────────────────────── [x] ┐
│                                                            │
│    ┌────────────────────────────────────────┐   Centre X   │
│    │                                        │   [ 2825  ]  │
│    │            (image, fit to modal)       │   Centre Y   │
│    │              ╭──────────╮              │   [ 1864  ]  │
│    │              │          │              │   Radius     │
│    │              │    +     │              │   [ 1806  ]  │
│    │              │          │              │              │
│    │              ╰──────────╯              │   Diameter   │
│    │                                        │   3612 px    │
│    └────────────────────────────────────────┘              │
│                                                            │
│    Zoom  [───────●─────]  180%     [ Fit to circle ]        │
│    ( ) Edge check: shows a 1px ring, no fill                │
│                                                            │
│                              [ Cancel ]  [ Apply mask ]     │
└────────────────────────────────────────────────────────────┘
```

Five parts, in priority order. The first two carry most of the value:

1. **Size.** The modal is 90vw/90vh, so the same image renders three to four times
   larger and one screen pixel maps to roughly one and a half image pixels.
2. **Numeric fields for centre and radius**, bound to the same form values as the
   drag handles and updating live in both directions. Typing `1806` is exact in a
   way no drag can be, and users transcribing values from a previous calibration
   have somewhere to put them. This alone would resolve most of the complaint.
3. **A 1 px edge-check mode.** Swaps the 3 px border for a 1 px ring and removes
   the fill, so the circle edge can be compared against the fisheye edge directly.
4. **Zoom and pan** for inspecting the edge at 100% or more.
5. **"Fit to circle"**, a one-click estimate: threshold the frame at a low value,
   take the bounding box of the largest non-black region, and set centre and
   radius from it. Offered as a starting point that the user then refines, never
   as an automatic action.

### Cost and risk

Parts 1 to 3 are a day or so and reuse `CircularMaskSelection` unchanged inside a
dialog; the component already takes `MotionValue`s, so the modal and the inline
preview can drive the same ones and stay in sync. Part 4 needs a transform layer
around the existing scaling. Part 5 is the only one with real algorithmic risk:
my own attempt to locate the circle in `IMG_6962.JPG` during this work gave about
20 px of uncertainty because the fisheye edge is soft, so it must be presented as
an estimate.

**Recommendation:** build 1 to 3 first and see whether 4 and 5 are still wanted.

**Open question:** should the inline preview stay as-is once the modal exists, or
be reduced to a read-only thumbnail with an "Edit mask" button? I lean towards
keeping it editable for coarse adjustment.

---

## B. Run console modal

### The problem, and a finding

Every message you asked to see is **already being emitted**. The backend sends a
`pipeline-status` event per step, and this branch added several more (exposure
selection counts, the validity check verdict, `.cal` resolution warnings). They
are invisible because `pipeline-status-context.tsx:41` keeps only the most recent
one:

```ts
const [payload, setPayload] = useState<PipelineStatusPayload | null>(null);
// ...
setPayload(nextPayload);   // each event overwrites the last
```

`PipelineStatus` then renders that single value as one line of text. So the
messages flash past faster than they can be read. **Nothing needs to be added to
the backend for you to see them; the frontend just has to stop throwing them
away.** That makes this much cheaper than it looks.

### Proposal

Accumulate the events into a log and show it in a modal that owns the run.

```
┌─ Generating HDR images ─────────────────────────────── [x] ┐
│                                                            │
│  Set 1 of 3   IMG_6955 … IMG_6972                          │
│  ████████████████████████░░░░░░░░░░░░  62%                 │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 12:04:31  Merging exposures                          │  │
│  │ 12:04:31  Selected 13 of 18 useful exposures         │  │
│  │ 12:04:58  Normalizing exposure                       │  │
│  │ 12:04:59  Cropping HDR image                         │  │
│  │ 12:05:02  Applying vignetting correction             │  │
│  │ 12:05:02  ⚠ vignetting.cal does not reference        │  │
│  │           xres/yres … image is 900x900 …             │  │
│  │ 12:05:09  Writing view angles to HDR header          │  │
│  │ 12:05:11  Evaluating glare                           │  │
│  │ 12:05:14  ✓ Validity check passed (3.2% error)       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                            [ Copy log ]    │
│                                                            │
│  [ Open folder ]  [ Open image ]  [ Run history ]  [ Close ]│
└────────────────────────────────────────────────────────────┘
```

Behaviour:

- Opens automatically when a run starts, replacing the inline progress strip.
- Monospace, auto-scrolling, timestamped. Warnings and errors are marked and
  coloured; everything else is plain. No tutorial section references, per your
  instruction; those live in the field infoboxes.
- Per-set progress when batch processing, with an overall bar above it. The
  backend already loops over directories, but currently emits progress as if
  there were one set, so this needs a set index and count added to the payload.
  That is the **only backend change** in part B.
- Closable while running; the run continues and the strip in the sidebar reflects
  it. Not modal in the blocking sense.
- **Copy log** puts the whole transcript on the clipboard, which is what you will
  want when a run fails and you are asking someone about it.
- Actions stay as they are today: open folder, open image, close.

### Cost

Roughly a day. The log accumulation is a few lines. Per-set progress is a small
payload change plus loop bookkeeping in `pipeline.rs`.

**Open question:** should the log include the raw stderr of failing Radiance
commands? `CommandError::NonZeroExit` already captures it, and it is the single
most useful thing when `hdrgen` refuses a set. I would include it behind a
"Show details" toggle on error entries.

---

## C. Run history and input presets

This is the one that genuinely needs designing, because it introduces persistent
state the app does not currently have. Two capabilities are worth separating.

### C1. Run history (a record of what happened)

Every run appends a record: timestamp, every input value, the resolved tool
paths, the output file paths, the full status log, and the outcome. Immutable.

The app already writes something close to this on failure. `page.tsx` calls
`writePipelineTrace`, dumping the inputs and the error to
`<output>/pipeline-traces/pipeline-trace-<timestamp>.json`. **C1 is largely a
generalisation of that from failures to all runs**, which is a good sign the shape
is right.

Where it goes: a **Runs** entry in the top navigation, beside Image Generator,
Settings and Image Viewer. Reached from the run console's "Run history" button.

```
┌─ Runs ─────────────────────────────────────────────────────┐
│  Today                                                     │
│   ✓ 12:05  3 sets · 18 exposures · f/8 · vta   [⋯]          │
│   ⚠ 11:40  1 set  · 15 exposures · f/8 · vta   [⋯]          │
│      Validity check failed (31.4% error)                    │
│  Yesterday                                                  │
│   ✓ 16:22  1 set  · 15 exposures · f/11 · vth  [⋯]          │
│                                                             │
│  [⋯] = Open folder · Open image · View log · Reuse inputs   │
│        · Save as preset                                     │
└─────────────────────────────────────────────────────────────┘
```

"Reuse inputs" repopulates the form from that run, which covers a large part of
what presets are for and costs almost nothing once the record exists.

### C2. Presets (a named, reusable set of inputs)

A preset is the calibration identity of one camera and lens: the response
function, the four `.cal` files, view angles, projection, target resolution, and
optionally the lens mask. It is **not** the image set or the measured
illuminance, which change every capture.

This split matters and is worth stating explicitly, because it decides the whole
feature: the tutorial's one-time setup (section 2.3) produces exactly the
per-equipment material, and the per-capture material is everything else. A preset
should therefore be the one-time setup, and nothing else.

| Field | In a preset? | Why |
|---|---|---|
| Camera response `.rsp` | yes | per equipment, one-time setup |
| Fisheye, vignetting, ND, calibration `.cal` | yes | per equipment and aperture |
| View angles, projection type | yes | per lens |
| Target resolution | yes | a workflow choice, stable per user |
| Lens mask centre and radius | yes, with a caveat | per equipment, but only valid at one image resolution |
| Input image set | no | per capture |
| Measured vertical illuminance | no | per capture |

The lens mask caveat: a mask is in pixel coordinates, so a preset carrying one
must record the image dimensions it was drawn against and warn when applied to a
different size. This is the same class of hazard as the `.cal` resolution
mismatch already warned about in `a140f40`, and should reuse that pattern.

Where it goes: a preset bar at the top of the configuration panel, above the
accordion, so it frames the inputs rather than hiding inside one section.

```
┌────────────────────────────────────────────────────────────┐
│  Preset  [ Canon 5D II + Sigma 8mm, f/8   ▾ ]  [Save] [⋯]  │
├────────────────────────────────────────────────────────────┤
│  ▸ HDR Generation                                          │
│  ▸ Cropping and resizing                                   │
│  …                                                         │
```

Selecting a preset fills the equipment fields and leaves the per-capture ones
alone. The selector shows a modified indicator when current values diverge.

### Storage

Presets and history are user data that must survive reinstalls, so neither
belongs in `localStorage` (where `hdr-settings` currently lives, via the zustand
persist store). Proposal: JSON in the Tauri app-config directory, one file for
presets and one append-only file or directory for run history, with a schema
version field from day one.

Rough shape, deliberately close to the existing trace format:

```jsonc
{
  "version": 1,
  "runs": [{
    "id": "2026-07-27T12:05:14Z",
    "startedAt": "...", "finishedAt": "...",
    "outcome": "ok" | "warning" | "error",
    "presetName": "Canon 5D II + Sigma 8mm, f/8",
    "inputs": { /* the buildPipelineParams payload, verbatim */ },
    "toolPaths": { "radiance": "...", "hdrgen": "...", "dcrawEmu": "..." },
    "outputs": ["/path/2026-07-27_12-05-14.hdr", "..."],
    "log": [{ "at": "...", "kind": "step", "message": "..." }]
  }]
}
```

Storing `inputs` as the verbatim IPC payload is what makes "reuse inputs" a
one-liner, and it means the history stays correct automatically as the payload
gains fields.

**Open questions, all of which need your answer before this is specified properly:**

1. **Retention.** Unbounded history will grow without limit. Cap at N runs, cap by
   age, or leave it to the user to prune? I suggest keeping metadata forever and
   trimming only the log bodies beyond the most recent 100 runs.
2. **Do presets reference `.cal` files by path, or copy them?** Paths are simpler
   and stay in sync if you re-derive a calibration. Copies survive the files being
   moved or deleted. I lean towards paths plus a "file missing" indicator, since
   your calibration files live alongside the project.
3. **Should presets be shareable?** Export and import as a single file would let a
   lab distribute one calibration to several machines. Cheap if the format is a
   plain JSON file with relative paths, expensive if it has to bundle the `.cal`
   contents. Worth deciding now because it constrains question 2.
4. **Does history record runs that failed to start** (bad tool paths, no images)?
   I would say yes, since those are exactly the ones you want to look back at.

### Cost and sequencing

C1 is two to three days and delivers most of the value, since "reuse inputs"
covers the common case. C2 is another two to three days on top and is worth doing
only once C1's storage layer exists. Neither should start before B, whose log
accumulation feeds C1's records.

---

## Parked: request 4, the app logo

Noted, not actioned. The current logo is already sun-and-aperture themed
(`public/SunApertureOrange.png`), so the lucide `Aperture` glyph now used for the
projection selector is a close cousin rather than a departure. Worth revisiting as
a deliberate identity pass covering the logo, the window icon and the installer
art together, rather than swapping one image. Raise it when you want it and I will
work up variations.

## Suggested order

1. **A1 to A3** (mask modal: size, numeric fields, thin edge). Small, immediate,
   independent.
2. **B** (run console). Cheap, because the messages already exist, and it makes
   the pipeline legible while the rest is built.
3. **C1** (run history), then **C2** (presets), once the four questions above are
   answered.
