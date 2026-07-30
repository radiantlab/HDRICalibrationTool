/**
 * `falsecolor` reimplemented in TypeScript.
 *
 * Port of `src/px/falsecolor.pl` (Radiance 6.0), which is a Perl script and so
 * has no WebAssembly build. It shells out to `pcomb`, `pcompos`, `psign` and
 * `pextrem`, all of which do -- so this drives those through the `ToolRunner`
 * instead of a shell. See radiantlab/LumiLab#230.
 *
 * **Scope is deliberately narrow.** Only the two invocation shapes
 * LumiLab produces are supported:
 *
 *   falsecolor -e -i <picture>
 *   falsecolor -s <limit> -l <label> -n <levels> -e [-lw W -lh H] -i <picture>
 *
 * Everything else falsecolor can do -- contours (`-cl`, `-cb`, `-cp`),
 * alternative palettes (`-pal`), logarithmic mapping (`-log`), overlays,
 * `-palettes` -- is **not implemented**. There is no argv parsing here to
 * reject them through: the function takes structured options, so an
 * unsupported feature cannot be requested by accident. Adding one means adding
 * a field and the branch that honours it, not extending a parser.
 *
 * Two structural differences from the Perl, both forced and neither
 * behavioural:
 *
 *  - The script ends in a pipe (`pcomb | pcompos | getinfo`). There is no shell
 *    here, so each stage writes a file that the next one reads. Every tool in
 *    the chain accepts a path where it accepted `-`, so the commands are
 *    otherwise unchanged.
 *  - Perl writes its `.cal` files to a temp directory; these go into the
 *    virtual filesystem under the same working prefix as everything else.
 */

import { pc0Cal, pc1Cal } from "./falsecolor-cal";
import { workPath } from "./stages";
import { PipelineError, type ToolRunner } from "./types";

/** W/sr/m2 -> cd/m2. falsecolor's default and the only one this port supports. */
const MULT = "179";
const DEFAULT_SCALE = "1000";
const DEFAULT_LABEL = "cd/m2";
const DEFAULT_NDIVS = 8;
const DEFAULT_LEG_WIDTH = 100;
const DEFAULT_LEG_HEIGHT = 200;
/** Maximum decimal places on a legend number. */
const SCALE_DIGITS = 3;
/** Height of the min/max extrema labels. */
const EXTREM_LABEL_HEIGHT = 32;

const PALETTE = "def";

/** pextrem prints `x y r g b` twice, whitespace-separated. */
const WHITESPACE = /\s+/;

export interface FalsecolorOptions {
  /** Recorded in the output header, exactly as the Perl records its @ARGV. */
  argv: string[];
  input: string;
  legendHeight: string;
  legendWidth: string;
  output: string;
  scaleLabel: string;
  scaleLevels: string;
  scaleLimit: string;
}

/**
 * Truncates a legend number the way the Perl does.
 *
 * The Perl substitution keeps at most three decimal places and leaves a number
 * without a decimal point alone. It truncates rather than rounds, so `toFixed`
 * is wrong here. (The regex itself is not quoted in this comment: it ends in
 * a star-slash, which would close the comment early.)
 */
export function formatScaleValue(value: number): string {
  const text = String(value);
  const dot = text.indexOf(".");
  if (dot === -1) {
    return text;
  }
  return text.slice(0, dot + 1 + SCALE_DIGITS);
}

/** Reproduces Perl's `int()`, which truncates toward zero. */
const int = (value: number) => Math.trunc(value);

export async function falsecolor(
  runner: ToolRunner,
  options: FalsecolorOptions
): Promise<void> {
  const scale = options.scaleLabel === "" ? DEFAULT_SCALE : options.scaleLimit;
  const label = options.scaleLabel === "" ? DEFAULT_LABEL : options.scaleLabel;
  const ndivs = parseNdivs(options.scaleLevels);
  const { legWidth, legHeight } = legendSize(options);

  const pc0 = workPath("fc_pc0.cal");
  const pc1 = workPath("fc_pc1.cal");
  await runner.writeFile(
    pc0,
    pc0Cal({
      bluv: `${PALETTE}_blu(v)`,
      grnv: `${PALETTE}_grn(v)`,
      mult: MULT,
      ndivs,
      redv: `${PALETTE}_red(v)`,
      scale,
    })
  );
  await runner.writeFile(pc1, pc1Cal());

  const pc0Args = ["-f", pc0];
  // No -p/-cp picture and no contours, so the background colour is flat black.
  // The Perl reaches the same branch: cpict is empty and docont is not '0'.
  const pc1Args = ["-f", pc1, "-e", "ra=0;ga=0;ba=0"];

  const scolPic = workPath("fc_scol.hdr");
  const slabPic = workPath("fc_slab.hdr");

  if (legWidth > 0) {
    await buildLegend(runner, {
      label,
      legHeight,
      legWidth,
      ndivs,
      pc0Args,
      scale,
      scolPic,
      slabPic,
    });
  } else {
    // Dummy scale and labels, so the final command line does not have to
    // change shape when there is no legend.
    await run(runner, "pcomb", ["-x", "1", "-y", "1", "-e", "lo=1"], scolPic);
    await run(runner, "pcomb", ["-x", "1", "-y", "1", "-e", "lo=1"], slabPic);
  }

  // Inverted labels, used as a drop shadow behind the real ones.
  const slabInvPic = workPath("fc_slabinv.hdr");
  await run(runner, "pcomb", ["-e", "lo=1-gi(1)", slabPic], slabInvPic);

  // haszero is 1: contours are not supported here, and only they clear it.
  const sh0 = -int(legHeight / ndivs / 2);

  const colorized = workPath("fc_colorized.hdr");
  await run(
    runner,
    "pcomb",
    [...pc0Args, ...pc1Args, options.input],
    colorized
  );

  const composed = workPath("fc_composed.hdr");
  const composeArgs = [
    "-h",
    "-b",
    "0",
    "0",
    "0",
    scolPic,
    "0",
    String(sh0),
    "+t",
    ".1",
    slabInvPic,
    "2",
    "-1",
    "-t",
    ".5",
    slabPic,
    "0",
    "0",
    colorized,
    String(legWidth),
    "0",
  ];

  // -e always runs in this pipeline, which is what makes pextrem a dependency.
  composeArgs.push(...(await extremaArgs(runner, options.input, legWidth)));

  await run(runner, "pcompos", composeArgs, composed);

  // Drop the accumulated command lines and record one falsecolor entry, as the
  // Perl does with its saved @ARGV.
  await runner.run(
    "getinfo",
    ["-r", "EXPOSURE", "pcompos ", `falsecolor ${options.argv.join(" ")}`],
    { stdin: composed, stdout: options.output }
  );
}

function parseNdivs(scaleLevels: string): number {
  if (scaleLevels.trim() === "") {
    return DEFAULT_NDIVS;
  }
  const parsed = Number.parseInt(scaleLevels.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PipelineError({
      field: "scaleLevels",
      kind: "invalid_input",
      value: scaleLevels,
    });
  }
  return parsed;
}

/**
 * A legend smaller than this is not legible, so falsecolor drops it entirely
 * rather than drawing something unreadable.
 */
function legendSize(options: FalsecolorOptions): {
  legWidth: number;
  legHeight: number;
} {
  const width = Number.parseInt(options.legendWidth.trim(), 10);
  const height = Number.parseInt(options.legendHeight.trim(), 10);
  const legWidth =
    Number.isInteger(width) && width > 0 ? width : DEFAULT_LEG_WIDTH;
  const legHeight =
    Number.isInteger(height) && height > 0 ? height : DEFAULT_LEG_HEIGHT;

  if (legWidth <= 20 || legHeight <= 40) {
    return { legHeight: 0, legWidth: 0 };
  }
  return { legHeight, legWidth };
}

async function buildLegend(
  runner: ToolRunner,
  options: {
    label: string;
    legWidth: number;
    legHeight: number;
    ndivs: number;
    pc0Args: string[];
    scale: string;
    scolPic: string;
    slabPic: string;
  }
): Promise<void> {
  const { label, legWidth, legHeight, ndivs, pc0Args, scale } = options;

  const sheight = int(legHeight / ndivs);
  const theight = int(legWidth / (8 / 1.67));
  const stheight = Math.min(sheight, theight);
  const vlegheight = int(sheight * ndivs * (1 + 1.5 / ndivs));

  // The units caption sits above the numbers.
  const titlePic = workPath("fc_slabT.hdr");
  await run(
    runner,
    "psign",
    [
      "-s",
      "-.15",
      "-cf",
      "1",
      "1",
      "1",
      "-cb",
      "0",
      "0",
      "0",
      "-h",
      String(stheight),
      label,
    ],
    titlePic
  );

  const loop = ndivs + 1; // haszero is 1: the zero label is drawn
  const composeArgs = [
    "-b",
    "0",
    "0",
    "0",
    "=-0",
    titlePic,
    "0",
    String(int(sheight * loop + sheight * 0.5)),
  ];

  const numeric = Number(scale);
  for (let i = 0; i < loop; i += 1) {
    const imap = (ndivs - i) / ndivs;
    const value = formatScaleValue(numeric * imap);
    const valuePic = workPath(`fc_slab${i}.hdr`);
    // biome-ignore lint/performance/noAwaitInLoops: one psign per legend division, and each writes a distinct file the compose step then names in order
    await run(
      runner,
      "psign",
      [
        "-s",
        "-.15",
        "-cf",
        "1",
        "1",
        "1",
        "-cb",
        "0",
        "0",
        "0",
        "-h",
        String(stheight),
        value,
      ],
      valuePic
    );
    composeArgs.push(
      "=-0",
      valuePic,
      "0",
      String(int(sheight * (loop - i - 1) + sheight * 0.5))
    );
  }
  await run(runner, "pcompos", composeArgs, options.slabPic);

  // The colour bar behind the numbers.
  await run(
    runner,
    "pcomb",
    [
      ...pc0Args,
      "-x",
      String(legWidth),
      "-y",
      String(vlegheight),
      "-e",
      `v=(y+.5-${sheight})/(yres/(1+1.5/${ndivs}));vleft=v;vright=v`,
      "-e",
      `vbelow=(y-.5-${sheight})/(yres/(1+1.5/${ndivs}));vabove=(y+1.5-${sheight})/(yres/(1+1.5/${ndivs}))`,
      "-e",
      "ra=0;ga=0;ba=0;",
    ],
    options.scolPic
  );
}

/**
 * Marks the darkest and brightest pixels with their luminance.
 *
 * `pextrem -o` prints two lines, minimum then maximum, each `x y r g b`. The
 * weights are Radiance's luminous efficacy coefficients, not a generic
 * greyscale conversion.
 */
async function extremaArgs(
  runner: ToolRunner,
  picture: string,
  legWidth: number
): Promise<string[]> {
  const result = await runner.run("pextrem", ["-o", picture], {
    captureStdout: true,
  });
  const numbers = result.stdout.trim().split(WHITESPACE).map(Number);
  if (numbers.length < 10 || numbers.some((value) => !Number.isFinite(value))) {
    throw new PipelineError({
      kind: "processing",
      message: `falsecolor: could not read extrema from pextrem output ${JSON.stringify(result.stdout)}`,
    });
  }

  // Length and finiteness are checked above, so this tuple view is total --
  // without it every element reads as possibly-undefined.
  const [xmin, ymin, rmin, gmin, bmin, xmax, ymax, rmax, gmax, bmax] =
    numbers as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  // Radiance's luminous efficacy weights, rounded the way falsecolor.pl
  // rounds them for the extrema labels.
  const luminance = (r: number, g: number, b: number) =>
    (r * 0.27 + g * 0.67 + b * 0.06) * Number(MULT);
  const minval = formatScaleValue(luminance(rmin, gmin, bmin));
  const maxval = formatScaleValue(luminance(rmax, gmax, bmax));

  const minPic = workPath("fc_minv.hdr");
  const maxPic = workPath("fc_maxv.hdr");
  await run(
    runner,
    "psign",
    ["-s", "-.15", "-a", "2", "-h", String(EXTREM_LABEL_HEIGHT), minval],
    minPic
  );
  await run(
    runner,
    "psign",
    ["-s", "-.15", "-a", "2", "-h", String(EXTREM_LABEL_HEIGHT), maxval],
    maxPic
  );

  return [
    "=00",
    minPic,
    String(xmin + legWidth),
    String(ymin),
    "=00",
    maxPic,
    String(xmax + legWidth),
    String(ymax),
  ];
}

async function run(
  runner: ToolRunner,
  tool: string,
  args: string[],
  stdout: string
): Promise<void> {
  const result = await runner.run(tool, args, { stdout });
  if (result.code !== 0) {
    throw new PipelineError({
      args,
      code: result.code,
      kind: "command",
      stderr: result.stderr,
      tool,
    });
  }
}
