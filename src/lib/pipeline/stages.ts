/**
 * Argument builders for each pipeline stage.
 *
 * These are the direct port of the `*_spec` functions in
 * `src-tauri/src/pipeline/*.rs`. They are pure -- string in, `string[]` out --
 * so the exact argv each tool receives can be asserted without a runner, a
 * wasm module or a filesystem.
 *
 * The comments explaining *why* an argument is shaped the way it is are
 * carried over deliberately. Several of them record bugs that were expensive
 * to find, and an argument list that looks arbitrary is exactly the kind of
 * thing a later refactor "tidies up".
 */

import { PipelineError } from "./types";

/**
 * `-Y <rows> +X <cols>`, the only orientation anything upstream produces.
 * Anything else would mean a flipped scanline order, and cropping the wrong
 * half of the picture is worse than refusing to run.
 */
const RESOLUTION_LINE = /^-Y\s+(\d+)\s+\+X\s+(\d+)$/;

/** Every intermediate lives under this prefix in the virtual filesystem. */
export const WORK_DIR = "/work";

export function workPath(name: string): string {
  return `${WORK_DIR}/${name}`;
}

/** POSIX and Windows path separators, so a path from either host splits into segments. */
const PATH_SEPARATORS = /[/\\]/;

/**
 * The last segment of a path, for POSIX and Windows separators alike.
 *
 * Used to name a staged file after the one the user picked without carrying
 * the directory it came from. Radiance tools write their own argv into the
 * header of the picture they produce, so a directory that reaches an argument
 * list reaches the finished picture. See #241.
 */
export function basename(path: string): string {
  const segment = path.split(PATH_SEPARATORS).pop() ?? "";
  return segment === "" ? "file" : segment;
}

/**
 * dcraw_emu flags for RAW -> TIFF conversion.
 *
 *   -T        write TIFF rather than PPM
 *   -o 1      sRGB output primaries
 *   -W        do not brighten automatically
 *   -j        no pixel-aspect stretch
 *   -q 3      AHD demosaic
 *   -g 2 0    gamma 2.0, no toe slope -- close to linear
 *   -t 0      no auto-rotation, so the mask stays aligned with the image
 *   -b 1.1    slight exposure headroom
 *   -Z <out>  explicit output path
 */
export function dcrawArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-T",
    "-o",
    "1",
    "-W",
    "-j",
    "-q",
    "3",
    "-g",
    "2",
    "0",
    "-t",
    "0",
    "-b",
    "1.1",
    "-Z",
    outputPath,
    inputPath,
  ];
}

/**
 * A simple square response: a polynomial of order 2 with a coefficient of 1
 * for x^2, one line per channel.
 *
 * RAW is already linear, so this is a better assumption than a curve recovered
 * from the bracket.
 */
export const SQUARE_RESPONSE = "2 1 0 0\n2 1 0 0\n2 1 0 0\n";

/**
 * Builds the hdrgen invocation.
 *
 * `-m` is the cache size in megabytes. hdrgen's online man page documents a
 * default of 100 and the man page bundled with the binaries documents 1000, so
 * the value in force depends on which build happens to be installed. Stating it
 * makes a run reproducible across installations; raw2hdr uses 400, so 1000 is
 * comfortably safe.
 *
 * It goes ahead of the filenames, unlike the output flags below: a cache size
 * has to be known before the first input is read to have any effect, and it is
 * not worth depending on hdrgen buffering its whole argument list first.
 */
export function hdrgenArgs(
  inputImages: string[],
  responseFunction: string,
  outputPath: string
): string[] {
  const args = ["-m", "1000", ...inputImages, "-o", outputPath];
  if (responseFunction !== "") {
    args.push("-r", responseFunction);
  }
  return [...args, "-a", "-e", "-f", "-g", "-F"];
}

/** ra_xyze -r -o: convert to RGBE with the exposure folded into the pixels. */
export function nullifyExposureArgs(input: string, output: string): string[] {
  return ["-r", "-o", input, output];
}

/**
 * pcompos arguments for the crop stage.
 *
 * `ytop` is the distance from the top of the image to the top of the lens
 * mask, which is the origin the mask overlay works in. Radiance measures from
 * the bottom, so it is converted here -- the same conversion `crop.rs` does.
 */
export function cropArgs(
  input: string,
  diameter: number,
  xleft: number,
  ytop: number,
  imageHeight: number
): string[] {
  const ydown = imageHeight - (ytop + diameter);
  if (ytop < 0 || ydown < 0) {
    throw new PipelineError({
      field: "ytop",
      kind: "invalid_input",
      value: `${ytop} with diameter ${diameter} does not fit in an image ${imageHeight} px tall`,
    });
  }
  return [
    "-x",
    String(diameter),
    "-y",
    String(diameter),
    input,
    `-${xleft}`,
    `-${ydown}`,
  ];
}

/** pfilt -1: one pass, no anti-aliasing beyond the resample. */
export function resizeArgs(
  input: string,
  xdim: number,
  ydim: number
): string[] {
  return ["-1", "-x", String(xdim), "-y", String(ydim), input];
}

/**
 * pcomb with a `.cal` file. Used by the projection, vignetting and neutral
 * density corrections, which differ only in which file they pass.
 */
export function pcombCalArgs(calFile: string, input: string): string[] {
  return ["-f", calFile, input];
}

/**
 * The photometric adjustment, which additionally passes `-h`.
 *
 * `-h` stops pcomb copying the header it was handed, so this stage discards
 * everything the three before it accumulated. That looks like an oversight,
 * and #241 argued it was: the flag traces to the lab's own `ldr-to-hdr.sh`,
 * which had the same asymmetry at line 197, rather than to Table 3 of Pierson
 * et al. (2019). That script lived at `extra/ldr-to-hdr.sh` until the tree was
 * tidied; it is in the history if the original is ever wanted.
 *
 * **It is load-bearing anyway, and removing it breaks the pipeline.** Radiance
 * tools indent an inherited header with tabs, and `evalglare` refuses any
 * picture whose header has a line containing both `EXPOSURE=` and a tab:
 *
 *     pictool.c:214   if (strstr(s, EXPOSSTR) && strstr(s, "\t")) { ... exit(1) }
 *
 * `pcompos` writes an `EXPOSURE=` line during the crop. With `-h` here that
 * line is the last thing written at column zero and evalglare is content. Drop
 * `-h` and every correction nests it one tab deeper, so the glare stage exits
 * with "header contains invalid exposure entry" and produces nothing. That was
 * measured against the shipped wasm binary, not inferred: it is why the
 * uncalibrated path survives and the calibrated one does not.
 *
 * So provenance cannot be inherited. It is written deliberately instead, after
 * evalglare has run, by `provenanceEntries` below.
 */
export function photometricArgs(calFile: string, input: string): string[] {
  return ["-h", "-f", calFile, input];
}

/**
 * `getinfo -a` appends every remaining argument to the header as its own line.
 *
 * It is not a flag parser, so anything passed here that looks like an option
 * lands in the picture verbatim.
 */
export function headerEditingArgs(entries: {
  view?: { projection: string; verticalAngle: number; horizontalAngle: number };
  evalglareValue?: string;
  measuredIlluminance?: string;
  /** Ready-made lines from `provenanceEntries`, appended last. */
  provenance?: string[];
}): string[] {
  const args = ["-a"];
  if (entries.view) {
    const { projection, verticalAngle, horizontalAngle } = entries.view;
    args.push(
      `VIEW= -${projection} -vv ${verticalAngle} -vh ${horizontalAngle}`
    );
  }
  // evalglare prints its value with a trailing newline. getinfo happens to
  // normalise that, but the entry is built here so it does not have to.
  if (entries.evalglareValue !== undefined) {
    args.push(`COMPUTED_VERTICAL_ILLUMINANCE=${entries.evalglareValue.trim()}`);
  }
  if (entries.measuredIlluminance !== undefined) {
    args.push(
      `MEASURED_VERTICAL_ILLUMINANCE=${entries.measuredIlluminance.trim()}`
    );
  }
  args.push(...(entries.provenance ?? []));
  return args;
}

/** Where `provenanceEntries` reads from. */
export interface ProvenanceSources {
  /** Basenames of the `.cal` files applied, in the order the pipeline runs. */
  calibration: string[];
  /** The header hdrgen wrote on the merged picture. */
  mergeHeader: string;
}

/**
 * What the finished picture should say about where it came from.
 *
 * The merge output records the camera, the capture date, which frames went in
 * and whether lens flare was removed. None of that survives to the finished
 * picture, because the photometric adjustment has to pass `-h` to keep
 * evalglare working -- see `photometricArgs`. Rather than inherit the chain,
 * which is what breaks evalglare, the parts worth keeping are re-stated here
 * and appended after the glare stage has run.
 *
 * Every line is built as `NAME= value`, matching `VIEW=` and the illuminance
 * entries the pipeline already writes, rather than passed through verbatim.
 * hdrgen's own frame line begins with its argv[0], which under WebAssembly is
 * the placeholder `./this.program` and means nothing to a reader.
 *
 * Two rules hold for everything returned, and both are load-bearing rather
 * than tidiness. No entry may contain a tab, because a tab beside `EXPOSURE=`
 * is what makes evalglare reject a picture, and someone will run evalglare on
 * the output. And no entry may be an `EXPOSURE=` line, because the exposure is
 * the pipeline's to state, not the merge's.
 */
export function provenanceEntries({
  calibration,
  mergeHeader,
}: ProvenanceSources): string[] {
  const lines = mergeHeader.split("\n").map((line) => line.trim());
  const entries: string[] = [];

  const value = (prefix: string): string | null => {
    const found = lines.find((line) => line.startsWith(prefix));
    return found ? found.slice(prefix.length).trim() : null;
  };

  const camera = value("CAMERA=");
  if (camera) {
    entries.push(`CAMERA= ${camera}`);
  }

  // hdrgen resolves this to one frame's EXIF timestamp -- the first it lists,
  // which for a bracket shot in order is the last exposure taken. Carried as
  // it stands: `CAPDATE=` is a standard identifier that `dateval()` parses as
  // UTC, so it has to stay a single well-formed time rather than a range.
  const captured = value("CAPDATE=");
  if (captured) {
    entries.push(`CAPDATE= ${captured}`);
  }

  const merged = lines.find((line) => line.includes("created HDR image from "));
  if (merged) {
    const frames = merged.slice(
      merged.indexOf("created HDR image from ") +
        "created HDR image from ".length
    );
    entries.push(`MERGED_FROM= ${frames.trim()}`);
  }

  if (lines.some((line) => line === "Removed lens flare")) {
    entries.push("LENS_FLARE= removed");
  }

  if (calibration.length > 0) {
    entries.push(`CALIBRATION_FILES= ${calibration.join(" ")}`);
  }

  return entries.filter(
    (entry) => !(entry.includes("\t") || entry.includes(EXPOSURE_ENTRY))
  );
}

/** The identifier evalglare refuses to see beside a tab. See `photometricArgs`. */
const EXPOSURE_ENTRY = "EXPOSURE=";

/**
 * evalglare in vertical-illuminance mode.
 *
 * evalglare reads its view geometry from the header as well as from these
 * flags, which is why header editing runs before it in the pipeline.
 */
export function evalglareArgs(
  input: string,
  projection: string,
  verticalAngle: number,
  horizontalAngle: number
): string[] {
  return [
    `-${projection}`,
    "-vv",
    String(verticalAngle),
    "-vh",
    String(horizontalAngle),
    "-V",
    input,
  ];
}

export interface LuminanceArgs {
  legendHeight: string;
  legendWidth: string;
  scaleLabel: string;
  scaleLevels: string;
  scaleLimit: string;
}

/**
 * falsecolor matches its options by substring, so `-lw` and `-lh` have to be
 * separate arguments each followed by its own numeric value. Passing "-lw/-lh"
 * matched `-lw` and swallowed the pair of dimensions as a single non-numeric
 * width, which falsecolor then discarded along with the whole legend.
 */
export function falsecolorArgs(
  luminance: LuminanceArgs,
  input: string
): string[] {
  // With no scale label there is nothing to lay out, so the legend is skipped
  // entirely rather than rendered blank.
  if (luminance.scaleLabel === "") {
    return ["-e", "-i", input];
  }

  const args = [
    "-s",
    luminance.scaleLimit,
    "-l",
    luminance.scaleLabel,
    "-n",
    luminance.scaleLevels,
    "-e",
  ];

  const width = Number.parseInt(luminance.legendWidth.trim(), 10);
  const height = Number.parseInt(luminance.legendHeight.trim(), 10);
  if (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0
  ) {
    args.push("-lw", String(width), "-lh", String(height));
  }

  args.push("-i", input);
  return args;
}

/**
 * Reads the pixel dimensions from a Radiance picture.
 *
 * Port of `picture::read_resolution`. Note this overlaps with
 * `parseRadianceHDR` in `src/app/viewer/view/page.tsx`, which parses the
 * same header on its way to decoding pixels. They are deliberately separate --
 * this one only needs the resolution and must stay dependency-free -- but a
 * change to the header format would need making in both. The resolution line follows the blank
 * line that ends the header and is conventionally `-Y <rows> +X <cols>`.
 */
export function readResolution(data: Uint8Array): {
  width: number;
  height: number;
} {
  const text = new TextDecoder("latin1").decode(
    data.subarray(0, Math.min(data.length, 4096))
  );
  const blank = text.indexOf("\n\n");
  if (blank === -1) {
    throw new PipelineError({
      kind: "processing",
      message: "picture: header has no terminating blank line",
    });
  }
  const lineEnd = text.indexOf("\n", blank + 2);
  const line = text
    .slice(blank + 2, lineEnd === -1 ? undefined : lineEnd)
    .trim();

  const match = RESOLUTION_LINE.exec(line);
  if (!match) {
    throw new PipelineError({
      kind: "processing",
      message: `picture: unsupported resolution line ${JSON.stringify(line)}`,
    });
  }
  return { height: Number(match[1]), width: Number(match[2]) };
}
