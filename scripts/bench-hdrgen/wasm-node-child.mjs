/**
 * One wasm-node run, in its own process so the orchestrator can kill it.
 *
 * `callMain` is synchronous and blocks the thread that would otherwise time it
 * out, so a ceiling only means something if the run is somewhere killable.
 * The record goes out as JSON on the last line of stdout.
 */

import { runWasmNode } from "./wasm-node.mjs";

const [frames, rep] = process.argv.slice(2).map(Number);
const record = await runWasmNode({ frames, leg: "wasm-node", rep });
process.stdout.write(`${JSON.stringify(record)}\n`);
