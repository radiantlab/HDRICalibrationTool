/**
 * The shipped wasm hdrgen, run in Node with no browser anywhere.
 *
 * This is the control. It uses the same `public/wasm/hdrgen.{js,wasm}` the
 * application ships, so a difference between this and a browser leg is the
 * engine and nothing else.
 *
 * The module is built for web and worker environments, so its own file reading
 * is not wired up for Node and it cannot fetch its `.wasm`. `instantiateWasm`
 * is the documented hook for handing over a compiled module instead, which
 * sidesteps that without modifying the artifact being measured.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameFiles, hdrgenArgv, RESPONSE, stagedName } from "./fixtures.mjs";

const WASM_DIR = fileURLToPath(new URL("../../public/wasm", import.meta.url));

export async function runWasmNode({ frames, leg, rep }) {
  const files = frameFiles(frames);
  const factory = (await import(`file://${path.join(WASM_DIR, "hdrgen.js")}`))
    .default;
  const binary = readFileSync(path.join(WASM_DIR, "hdrgen.wasm"));

  const startupStarted = Date.now();
  const mod = await factory({
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(binary, imports).then((result) => {
        done(result.instance, result.module);
      });
      return {};
    },
    noInitialRun: true,
    print: () => {
      // The merge narrates itself with progress bars. Not the measurement.
    },
    printErr: () => {
      // Likewise.
    },
  });
  const startupMs = Date.now() - startupStarted;

  mod.FS.mkdir("/src");
  mod.FS.mkdir("/work");
  const staged = files.map((file, index) => {
    const name = `/src/${stagedName(file, index)}`;
    mod.FS.writeFile(name, readFileSync(file));
    return name;
  });
  mod.FS.writeFile("/src/response.rsp", readFileSync(RESPONSE));

  const argv = hdrgenArgv({
    frames: staged,
    out: "/work/out.hdr",
    response: "/src/response.rsp",
  });

  // `callMain` is synchronous, so there is nothing to race a timer against: it
  // either returns or it does not. The ceiling is enforced by the orchestrator,
  // which runs this leg in its own process for exactly that reason.
  const started = Date.now();
  let status = "ok";
  let detail = null;
  try {
    mod.callMain(argv);
  } catch (error) {
    status = "error";
    detail = String(error).slice(0, 200);
  }
  const runMs = Date.now() - started;

  let outBytes = 0;
  try {
    outBytes = mod.FS.readFile("/work/out.hdr").length;
  } catch {
    outBytes = 0;
  }
  if (outBytes === 0 && status === "ok") {
    status = "error";
    detail = "no output produced";
  }

  return {
    detail,
    frames,
    leg,
    outBytes,
    rep,
    runMs: status === "ok" ? runMs : null,
    startupMs,
    status,
  };
}
