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

/**
 * Below this, a tool invocation is not worth a line in the run console.
 *
 * One second is comfortably above anything healthy -- a whole 18-frame merge
 * is around fifteen -- so a quiet log means nothing was slow, and any line at
 * all is a stage worth looking at.
 */
const SLOW_TOOL_MS = 1000;

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
 * completely invisible. Microsoft Edge's "Enhance your security on the web"
 * disables the JavaScript JIT for sites it does not consider familiar, and a
 * freshly deployed URL is never familiar. Everything then runs interpreted:
 * this pipeline went from thirty seconds to six and a half minutes, with no
 * error, no warning and nothing different about the page.
 *
 * That state is indistinguishable from "this tool is slow" unless something
 * says otherwise, and it cost most of a day to identify once. The wording
 * reports the observation rather than diagnosing the cause, because a genuinely
 * slow device would land here too and deserves a truthful message.
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
        `This browser is executing code about ${Math.round(elapsed / HEALTHY_MS)}x slower than expected, ` +
        "so this run will take minutes rather than seconds. The usual cause is a " +
        "browser security setting that disables the JavaScript JIT compiler for " +
        'unfamiliar sites: in Edge, Settings, Privacy, "Enhance your security on ' +
        'the web". Adding this site to its exceptions restores full speed.',
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
    // A tool only explains itself when it was slow. A run where everything is
    // quick says nothing, and a run where one stage takes minutes says which
    // part of it did: fetching the module, compiling it, or computing. That
    // distinction is the difference between a hosting problem and a build one,
    // and it cannot be recovered afterwards from wall-clock timestamps alone.
    onTiming: (timing) => {
      const total =
        timing.loadMs +
        timing.compileMs +
        timing.instantiateMs +
        timing.stageMs +
        timing.runMs +
        timing.collectMs;
      if (total < SLOW_TOOL_MS) {
        return;
      }
      const ms = (value: number) => `${(value / 1000).toFixed(1)}s`;
      post({
        kind: "status",
        payload: {
          kind: "step",
          message:
            `${timing.tool} took ${ms(total)}: fetch+compile ${ms(timing.loadMs + timing.compileMs)}, ` +
            `instantiate ${ms(timing.instantiateMs)}, stage ${ms(timing.stageMs)}, ` +
            `run ${ms(timing.runMs)}, collect ${ms(timing.collectMs)}`,
          progress: null,
          step: "timing",
        },
      });
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
