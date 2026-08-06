/**
 * Runs every leg and prints one table.
 *
 * The wasm-node leg runs in a child process rather than in this one. `callMain`
 * is synchronous, so a run that never returns cannot be timed out from the
 * thread it is blocking; the only way to enforce a ceiling on it is to be able
 * to kill it.
 */

import { execFile, fork } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameFiles } from "./fixtures.mjs";
import { ARM64_BINARY, ROSETTA_BINARY, runNative } from "./native.mjs";
import { formatTable, summarise } from "./report.mjs";

const FRAME_COUNTS = [4, 8, 12, 18];
const REPS = Number(process.env.BENCH_REPS ?? "3");
const CEILING_MS = 300_000;
const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = path.resolve(HERE, "../..");
const BROWSER_OUT = "/tmp/hdrgen-bench-browser.json";

function runWasmNodeInChild(frames, rep) {
  return new Promise((resolve) => {
    const child = fork(
      path.join(HERE, "wasm-node-child.mjs"),
      [String(frames), String(rep)],
      { silent: true }
    );
    const unfinished = {
      detail: null,
      frames,
      leg: "wasm-node",
      outBytes: 0,
      rep,
      runMs: null,
      startupMs: null,
      status: "timeout",
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(unfinished);
    }, CEILING_MS);

    let payload = "";
    child.stdout.on("data", (chunk) => {
      payload += chunk;
    });
    child.on("exit", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(payload.trim().split("\n").at(-1)));
      } catch {
        resolve({
          ...unfinished,
          detail: "child produced no record",
          status: "error",
        });
      }
    });
  });
}

function playwright(project) {
  return new Promise((resolve) => {
    execFile(
      "npx",
      [
        "playwright",
        "test",
        "-c",
        "hdrgen-bench.config.ts",
        "--project",
        project,
      ],
      {
        cwd: path.join(REPO, "e2e-web"),
        env: {
          ...process.env,
          BENCH_REPS: String(REPS),
          // One source of truth for what is merged. The browser leg cannot
          // import fixtures.mjs, so the selection is handed to it rather than
          // recomputed, which is what keeps every leg on the same frames.
          BENCH_FRAMES: JSON.stringify(
            Object.fromEntries(
              FRAME_COUNTS.map((count) => [
                count,
                frameFiles(count).map((file) => path.basename(file)),
              ])
            )
          ),
        },
        maxBuffer: 32 * 1024 * 1024,
        timeout: 3_000_000,
      },
      () => resolve()
    );
  });
}

const records = [];
const outDir = mkdtempSync(path.join(tmpdir(), "bench-hdrgen-"));

for (const frames of FRAME_COUNTS) {
  for (let rep = 1; rep <= REPS; rep += 1) {
    for (const [leg, binary] of [
      ["native-arm64", ARM64_BINARY],
      ["native-x86_64", ROSETTA_BINARY],
    ]) {
      process.stderr.write(`  ${leg} ${frames} frames, rep ${rep}\n`);
      // biome-ignore lint/performance/noAwaitInLoops: a benchmark must not run two measurements at once
      records.push(
        await runNative({
          binary,
          frames,
          leg,
          outDir,
          rep,
          timeoutMs: CEILING_MS,
        })
      );
    }
    process.stderr.write(`  wasm-node ${frames} frames, rep ${rep}\n`);
    // biome-ignore lint/performance/noAwaitInLoops: same reason
    records.push(await runWasmNodeInChild(frames, rep));
  }
}

for (const project of ["chromium", "webkit"]) {
  process.stderr.write(`  wasm-${project}, every frame count\n`);
  // biome-ignore lint/performance/noAwaitInLoops: same reason
  await playwright(project);
  try {
    records.push(
      ...JSON.parse(
        readFileSync(BROWSER_OUT.replace(/\.json$/, `.${project}.json`), "utf8")
      )
    );
  } catch {
    process.stderr.write(`  no records from ${project}; it may not have run\n`);
  }
}

writeFileSync("bench-results.json", JSON.stringify(records, null, 2));
process.stdout.write(`${formatTable(summarise(records))}\n`);
process.stdout.write(
  [
    "",
    "Times are seconds for the merge alone; module startup is measured",
    "separately and not included.",
    "",
    "native-x86_64 runs under Rosetta on an arm64 machine and is a lower bound",
    "on native performance, never an upper one. The gap to native-arm64 is what",
    "translation costs.",
    "",
    "The native legs read their frames from disk inside the timed region; the",
    "wasm legs are handed bytes already in memory, because that is how the",
    "application feeds them.",
    "",
    "Frames are sampled evenly across the bracket, endpoints included, so every",
    "row merges the full exposure range rather than a run of near-identical",
    "long exposures.",
    "",
  ].join("\n")
);
