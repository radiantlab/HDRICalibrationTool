/**
 * The message protocol between the page and the RAW worker.
 *
 * In its own module so the client can import the types without pulling in the
 * worker body, which would defeat the point of having one.
 */

/** One frame to convert. The worker reads no files itself. */
export interface RawConvertRequest {
  bytes: Uint8Array;
  /** The original path. Used for the work filename and in error messages. */
  path: string;
  /** Where the wasm artifacts are served from, resolved to an absolute URL. */
  wasmBaseUrl: string;
}

export type RawWorkerMessage =
  | { kind: "done"; tiff: Uint8Array }
  | { kind: "failed"; message: string };
