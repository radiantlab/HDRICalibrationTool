/**
 * Runs the WebAssembly pipeline from the desktop app.
 *
 * This is the adapter between the host and `src/lib/pipeline/`, and the only
 * place the two meet. It lives here rather than under `src/lib/pipeline/`
 * deliberately: that directory must not import `@tauri-apps/*`, because the
 * same code has to run in a browser with no Tauri at all.
 *
 * Nothing here replaces the Rust pipeline. Both are available, and which one
 * runs is a setting, so the two can be compared on the same image set before
 * the Rust one is removed (#233).
 */

import { emit } from "@tauri-apps/api/event";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import {
  completionMessage,
  outputStem,
  runTimestamp,
} from "@/lib/pipeline/output-naming";
import type {
  PipelineParams,
  PipelineStatusPayload,
  ToolRunner,
} from "@/lib/pipeline/types";
import { urlModuleLoader, WasmToolRunner } from "@/lib/pipeline/wasm-runner";

/** A trailing slash or backslash on the output directory. */
const TRAILING_SEPARATOR = /[\\/]+$/;

/** Where the browser builds are served from. See `public/wasm/README.md`. */
const WASM_BASE_URL = "/wasm";

/**
 * The payload `buildPipelineParams` produces.
 *
 * It still carries the four tool paths, which mean nothing here -- the tools
 * are wasm modules. They are accepted and ignored rather than removed, so the
 * call site can hand the same object to either pipeline while both exist.
 */
export interface BuiltPipelineParams extends PipelineParams {
  dcrawEmuPath?: string;
  filterImages?: boolean;
  hdrgenPath?: string;
  outputPath: string;
  radiancePath?: string;
}

export interface RunWasmPipelineOptions {
  /** Injected in tests; defaults to the real Tauri filesystem. */
  host?: HostFilesystem;
  /**
   * Injected in tests. Module mocking is avoided here because `jest.mock`
   * does not hoist above imports under this project's SWC transform, and
   * because the orchestrator and runner already have their own tests -- this
   * one is about the adapter's contract with the app.
   */
  makeRunner?: () => ToolRunner & { clear?: () => void };
  now?: () => Date;
  params: BuiltPipelineParams;
  run?: typeof runPipeline;
  /** Returning true stops the run before the next stage starts. */
  shouldStop?: () => boolean;
}

/** The host operations this adapter needs, so tests need no Tauri. */
export interface HostFilesystem {
  emitOutput: (path: string) => Promise<void>;
  emitStatus: (payload: PipelineStatusPayload) => Promise<void>;
  read: (path: string) => Promise<Uint8Array>;
  write: (path: string, data: Uint8Array) => Promise<void>;
}

const tauriHost: HostFilesystem = {
  emitOutput: (path) => emit("pipeline-output", { path }),
  // The existing status UI listens for Tauri events, so emitting one here
  // means pipeline-status-context.tsx needs no changes at all: it cannot tell
  // which pipeline produced the event.
  emitStatus: (payload) => emit("pipeline-status", payload),
  read: (path) => readFile(path),
  write: (path, data) => writeFile(path, data),
};

/** Files the pipeline reads by path and so must be staged before it starts. */
function referencedFiles(params: BuiltPipelineParams): string[] {
  return [
    ...params.inputImages,
    params.responseFunction,
    params.fisheyeCorrectionCal,
    params.vignettingCorrectionCal,
    params.neutralDensityCal,
    params.photometricAdjustmentCal,
  ].filter((path) => path !== "");
}

/**
 * Runs one image set and writes its two pictures next to the Rust pipeline's.
 *
 * Returns the paths written, in the order the Rust pipeline announces them.
 */
export async function runWasmPipeline({
  params,
  shouldStop,
  host = tauriHost,
  now = () => new Date(),
  makeRunner = () =>
    new WasmToolRunner({ load: urlModuleLoader(WASM_BASE_URL) }),
  run = runPipeline,
}: RunWasmPipelineOptions): Promise<string[]> {
  const runner = makeRunner();

  // Staged up front rather than lazily: a missing input should fail before any
  // wasm module is instantiated, not eight stages in.
  for (const path of referencedFiles(params)) {
    // biome-ignore lint/performance/noAwaitInLoops: reads are sequential so a missing file fails on its own path rather than inside an aggregate rejection
    await runner.writeFile(path, await host.read(path));
  }

  const result = await run({
    // Deliberately not awaited: a status event is a notification, and making
    // every stage wait on the UI would serialise the run behind rendering.
    emit: (payload) => {
      host.emitStatus(payload).catch(() => {
        // A dropped status line must never fail the run that produced it.
      });
    },
    params,
    runner,
    shouldStop,
  });

  const stem = outputStem(params.setName, runTimestamp(now()));
  const written: string[] = [];

  const outputs: [string, string][] = [
    [result.outputPath, `${stem}.hdr`],
    ...(result.falsecolorPath
      ? ([[result.falsecolorPath, `${stem}_fc.hdr`]] as [string, string][])
      : []),
  ];

  for (const [source, name] of outputs) {
    const destination = joinOutputPath(params.outputPath, name);
    // biome-ignore lint/performance/noAwaitInLoops: each output is announced only after it is on disk, which is what lets a failed set be attributed correctly
    await host.write(destination, await runner.readFile(source));
    // Announced after the write, matching the Rust pipeline: a set that failed
    // has announced no outputs, which is what the run history relies on.
    await host.emitOutput(destination);
    written.push(destination);
  }

  await host.emitStatus({
    kind: "done",
    message: completionMessage(params.setName),
    progress: 100,
    step: null,
  });

  // Frees the staged inputs and every intermediate. Without this a batch would
  // accumulate every set's images in JS memory.
  runner.clear?.();

  return written;
}

/**
 * Joins an output directory and a filename.
 *
 * `node:path` is not usable here -- next.config.js aliases `path` to
 * path-browserify for tiff.js -- and the separator is whichever the host
 * already used, so a Windows path stays a Windows path.
 */
export function joinOutputPath(directory: string, name: string): string {
  const trimmed = directory.replace(TRAILING_SEPARATOR, "");
  const separator = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${name}`;
}
