/**
 * A native hdrgen run, timed.
 *
 * Two binaries go through this. One is built here for arm64 from the commit
 * `public/wasm/versions.json` records as the source of the shipped `.wasm`; the
 * other is whatever is installed, which on this machine is x86_64 and therefore
 * runs under Rosetta. The emulated figure is a lower bound on native
 * performance and is labelled as such wherever it is reported. Comparing wasm
 * against an emulated binary and calling the result parity is the mistake this
 * benchmark exists to undo.
 *
 * There is no separate startup phase to measure, so `startupMs` is null. The
 * process reads its frames from disk inside the timed region, which the wasm
 * legs do not; at these sizes that is small against the merge, but it is real
 * and the report says so rather than hiding it.
 */

import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameFiles, hdrgenArgv, RESPONSE } from "./fixtures.mjs";

export const ARM64_BINARY = fileURLToPath(
  new URL("../../../hdrgen/build-native-arm64/hdrgen", import.meta.url)
);

export const ROSETTA_BINARY = "/usr/local/bin/hdrgen";

export function runNative({ binary, frames, leg, outDir, rep, timeoutMs }) {
  const out = path.join(outDir, `${leg}-${frames}-${rep}.hdr`);
  const argv = hdrgenArgv({
    frames: frameFiles(frames),
    out,
    response: RESPONSE,
  });

  return new Promise((resolve) => {
    const started = Date.now();
    execFile(binary, argv, { timeout: timeoutMs }, (error) => {
      const runMs = Date.now() - started;
      let outBytes = 0;
      try {
        outBytes = statSync(out).size;
      } catch {
        outBytes = 0;
      }

      // `killed` is how execFile reports the timeout, and it is the one
      // failure that is a result rather than a fault.
      let status = "ok";
      if (error?.killed) {
        status = "timeout";
      } else if (outBytes === 0) {
        status = "error";
      }

      resolve({
        detail:
          error && !error.killed ? String(error.message).slice(0, 200) : null,
        frames,
        leg,
        outBytes,
        rep,
        runMs: status === "ok" ? runMs : null,
        startupMs: null,
        status,
      });
    });
  });
}
