/// <reference lib="webworker" />

/**
 * Runs the whole pipeline off the main thread.
 *
 * `callMain` is synchronous: it blocks its thread for the entire duration of a
 * tool, and hdrgen merging an 18-frame bracket is tens of seconds of solid
 * work. On the main thread that means the page stops responding -- no
 * repaints, no clicks, no progress bar moving, and eventually the browser's
 * "page is not responding" prompt. Everything the pipeline needs works in a
 * worker, so there is no reason for it to be anywhere else.
 *
 * The worker reads no files. The page stages the bytes and transfers them in,
 * because only the page knows how to reach a file -- Tauri's filesystem on the
 * desktop, the virtual filesystem in a browser -- and keeping that out of here
 * is what lets one worker serve both.
 */

import type { DecodedImage } from "./filter-images";
import { runPipeline } from "./orchestrator";
import type {
  PipelineOutputFile,
  PipelineRunRequest,
  PipelineWorkerMessage,
} from "./pipeline.worker.types";
import { PipelineError } from "./types";
import {
  urlModuleCompiler,
  urlModuleLoader,
  WasmToolRunner,
} from "./wasm-runner";

declare const self: DedicatedWorkerGlobalScope;

function post(message: PipelineWorkerMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

/**
 * Iterations of a trivial arithmetic loop, used to size the engine.
 *
 * Small enough that the check itself is unnoticeable next to a run that takes
 * tens of seconds, and large enough that the result is not dominated by timer
 * resolution.
 */
const CALIBRATION_ITERATIONS = 3e7;

/** What this loop costs on a healthy engine, measured: 32 ms in Chromium. */
const HEALTHY_MS = 30;

/**
 * Above this, the engine is running far below what a working JIT delivers.
 *
 * An absolute threshold conflates a slow device with a disabled JIT, and
 * nothing available from JavaScript tells them apart, so this errs towards
 * firing. That is the right way round: the message is true either way -- a run
 * really will take minutes -- and a spurious line costs a reader a moment,
 * while a missed one costs them an afternoon of blaming the tool.
 *
 * For scale: 32 ms here with a JIT, 271 ms on the same machine with Edge's
 * enhanced security turning it off.
 */
const NO_JIT_MS = 150;

/**
 * How fast this engine actually executes code.
 *
 * Worth measuring because the answer is occasionally catastrophic and
 * completely invisible. Every major browser can be put in a state where
 * JavaScript optimisation is off, and the cost is roughly an order of
 * magnitude across everything, WebAssembly included:
 *
 *   - Edge's "Enhance your security on the web", which on its Balanced setting
 *     keeps optimisation only for sites visited often -- so a freshly deployed
 *     URL is excluded while `localhost` is not, which is what makes this look
 *     like a hosting problem.
 *   - Chrome and other Chromium browsers, per site, since Chromium 122.
 *   - Safari, as part of Lockdown Mode, which cannot be turned off separately.
 *   - Firefox via `javascript.options.ion`, and Tor Browser at "Safer".
 *
 * Managed machines reach the same place without anyone choosing it: the CIS
 * benchmark for Edge recommends disabling JIT outright at Level 2.
 *
 * Observed here: thirty seconds became six and a half minutes, with no error,
 * no warning and nothing different about the page. That is indistinguishable
 * from "this tool is slow" unless something says otherwise, and it cost most
 * of a day to identify once.
 *
 * The message reports the observation and offers the usual causes rather than
 * asserting one, because a genuinely slow device lands here too and deserves a
 * truthful message rather than a wrong diagnosis.
 */
function reportEngineSpeed(): void {
  const started = performance.now();
  let sink = 0;
  for (let i = 0; i < CALIBRATION_ITERATIONS; i += 1) {
    sink += i % 7;
  }
  const elapsed = performance.now() - started;
  if (elapsed < NO_JIT_MS || sink === -1) {
    return;
  }

  post({
    kind: "status",
    payload: {
      kind: "warning",
      message:
        `This browser is executing code about ${Math.round(elapsed / HEALTHY_MS)}x slower ` +
        "than expected, so this run will take minutes rather than seconds. The usual " +
        "cause is a browser security setting that turns off JavaScript optimisation, " +
        "often only for sites you have not visited before: Edge's \"Enhance your " +
        "security on the web\" (Settings, Privacy), Chrome's JavaScript optimisation " +
        "setting (Settings, Privacy and security, Security), or Safari's Lockdown " +
        "Mode. Allowing this site restores full speed.",
      progress: null,
      step: "engine_speed",
    },
  });
}

self.addEventListener("message", (event: MessageEvent<PipelineRunRequest>) => {
  run(event.data).catch((error: unknown) => {
    post({
      detail: error instanceof PipelineError ? error.detail : null,
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

async function run(request: PipelineRunRequest): Promise<void> {
  reportEngineSpeed();

  const runner = new WasmToolRunner({
    compile: urlModuleCompiler(request.wasmBaseUrl),
    load: urlModuleLoader(request.wasmBaseUrl),
    // To the console, not the run log. The breakdown is what tells a hosting
    // problem from a build one, and it is worth keeping for that, but every
    // real run has a stage that legitimately takes tens of seconds -- the
    // merge is a single invocation -- so surfacing it to users meant a line of
    // diagnostics beside every normal run. Developers open the console; users
    // should not have to read past this to find their own output.
    onTiming: (timing) => {
      const ms = (value: number) => `${(value / 1000).toFixed(1)}s`;
      const total =
        timing.loadMs +
        timing.compileMs +
        timing.instantiateMs +
        timing.stageMs +
        timing.runMs +
        timing.collectMs;
      console.debug(
        `${timing.tool} took ${ms(total)}: fetch+compile ${ms(timing.loadMs + timing.compileMs)}, ` +
          `instantiate ${ms(timing.instantiateMs)}, stage ${ms(timing.stageMs)}, ` +
          `run ${ms(timing.runMs)}, collect ${ms(timing.collectMs)}`
      );
    },
  });

  for (const [path, bytes] of Object.entries(request.files)) {
    // biome-ignore lint/performance/noAwaitInLoops: writes are trivial and sequential staging keeps a failure attributable to its path
    await runner.writeFile(path, bytes);
  }

  const result = await runPipeline({
    // Bound to this run's runner. The orchestrator hands `decodeImage` only a
    // path, and the bytes live in the runner, so it needs the way back.
    decodeImage: (path) => decodeImage(runner, path),
    emit: (payload) => post({ kind: "status", payload }),
    params: request.params,
    runner,
  });

  const outputs: PipelineOutputFile[] = [
    { bytes: await runner.readFile(result.outputPath), kind: "main" },
  ];
  if (result.falsecolorPath) {
    outputs.push({
      bytes: await runner.readFile(result.falsecolorPath),
      kind: "falsecolor",
    });
  }

  runner.clear();

  // Transferred rather than copied: a finished picture runs to tens of
  // megabytes, and structured-cloning it would double that for no reason.
  post(
    {
      computedVerticalIlluminance: result.computedVerticalIlluminance ?? null,
      kind: "done",
      outputs,
    },
    outputs.map((output) => output.bytes.buffer as ArrayBuffer)
  );
}

/**
 * Decodes a JPEG to RGBA for the image filter.
 *
 * `createImageBitmap` and `OffscreenCanvas` both exist in a worker, which is
 * what lets the filter stage come along with everything else rather than
 * having to stay behind on the main thread. The bitmap is closed explicitly:
 * a 21-megapixel frame is ~84 MB of RGBA.
 */
async function decodeImage(
  runner: WasmToolRunner,
  path: string
): Promise<DecodedImage> {
  const bytes = await runner.readFile(path);
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(`could not get a 2d context to decode ${path}`);
    }
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { height: bitmap.height, rgba: data, width: bitmap.width };
  } finally {
    bitmap.close();
  }
}
