/**
 * The message protocol between the page and the pipeline worker.
 *
 * Kept in its own module so the client can import the types without pulling in
 * the worker body, which would defeat the point of having one.
 */

import type { PipelineParams, PipelineStatusPayload } from "./types";

/** Everything the worker needs; it reads no files itself. */
export interface PipelineRunRequest {
  /**
   * Source bytes, keyed by the path the pipeline will refer to them by.
   *
   * Staged on the page side and transferred in, because only the page knows
   * how to reach a file: Tauri's filesystem on the desktop, the virtual
   * filesystem in a browser. The worker stays free of both.
   */
  files: Record<string, Uint8Array>;
  params: PipelineParams;
  /** Where the wasm artifacts are served from, resolved to an absolute URL. */
  wasmBaseUrl: string;
}

export interface PipelineOutputFile {
  bytes: Uint8Array;
  /** `main` is the picture the viewer opens; `falsecolor` is the `_fc` copy. */
  kind: "falsecolor" | "main";
}

export type PipelineWorkerMessage =
  | { kind: "status"; payload: PipelineStatusPayload }
  | {
      kind: "done";
      computedVerticalIlluminance: string | null;
      outputs: PipelineOutputFile[];
    }
  | { kind: "failed"; detail: unknown; message: string };
