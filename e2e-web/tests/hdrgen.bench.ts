/**
 * The same hdrgen merge, in a browser, with nothing else in the way.
 *
 * Deliberately not the app: no Next build, no worker, no UI, no other eleven
 * stages. It loads the same `public/wasm/hdrgen.js`, stages the same frames
 * under the same names, and calls the same `callMain`, so the only thing that
 * differs from the Node leg is the engine. A number taken through the
 * application could not tell a slow engine from a slow application, and that
 * is the question.
 *
 * Everything is served by intercepting requests rather than by running a
 * server: a static server would need a port, a build, and somewhere to put a
 * page that is neither `public/` nor the generated `out/`.
 *
 * Run through `hdrgen-bench.config.ts`:
 *
 *   cd e2e-web && npx playwright test -c hdrgen-bench.config.ts
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const WASM_DIR = fileURLToPath(new URL("../../public/wasm", import.meta.url));
const INPUTS = fileURLToPath(new URL("../../example", import.meta.url));
const JPEG_DIR = path.join(INPUTS, "JPEG");
const OUT = process.env.BENCH_OUT ?? "/tmp/hdrgen-bench-browser.json";

const FRAME_COUNTS = [4, 8, 12, 18];
const REPS = Number(process.env.BENCH_REPS ?? "3");
const CEILING_MS = 300_000;

const ALL_FRAMES = readdirSync(JPEG_DIR)
  .filter((name) => name.toUpperCase().endsWith(".JPG"))
  .sort();

/**
 * Which frames to merge, preferring the orchestrator's own selection.
 *
 * `run.mjs` passes `BENCH_FRAMES` so that every leg merges the same files from
 * one source of truth, which is the property the whole comparison rests on. The
 * fallback exists only for running this spec by hand, and restates the even
 * spread from `scripts/bench-hdrgen/fixtures.mjs` because a Playwright spec
 * cannot import a `.mjs` sibling without a build step. That duplication is a
 * real drift risk; `frameFiles` is pinned to an explicit expected selection in
 * the bench's own tests so at least one side cannot move silently.
 */
const SUPPLIED: Record<string, string[]> = process.env.BENCH_FRAMES
  ? JSON.parse(process.env.BENCH_FRAMES)
  : {};

function frameNames(count: number): string[] {
  const supplied = SUPPLIED[String(count)];
  if (supplied) {
    return supplied;
  }
  if (count === 1) {
    return [ALL_FRAMES[Math.floor((ALL_FRAMES.length - 1) / 2)] as string];
  }
  const step = (ALL_FRAMES.length - 1) / (count - 1);
  return Array.from(
    { length: count },
    (_unused, index) => ALL_FRAMES[Math.round(index * step)] as string
  );
}

const ORIGIN = "http://hdrgen-bench.test";

test("hdrgen across frame counts", async ({ page }, testInfo) => {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/index.html") {
      await route.fulfill({
        body: "<!doctype html><meta charset=utf-8><title>hdrgen bench</title>",
        contentType: "text/html",
      });
      return;
    }
    if (url.pathname.startsWith("/wasm/")) {
      await route.fulfill({
        body: readFileSync(path.join(WASM_DIR, path.basename(url.pathname))),
        contentType: url.pathname.endsWith(".wasm")
          ? "application/wasm"
          : "text/javascript",
      });
      return;
    }
    if (url.pathname === "/response") {
      await route.fulfill({
        body: readFileSync(
          path.join(INPUTS, "response_function_files", "Response_function.rsp")
        ),
        contentType: "application/octet-stream",
      });
      return;
    }
    if (url.pathname.startsWith("/frames/")) {
      await route.fulfill({
        body: readFileSync(path.join(JPEG_DIR, path.basename(url.pathname))),
        contentType: "image/jpeg",
      });
      return;
    }
    await route.fulfill({ body: "", status: 404 });
  });

  await page.goto(`${ORIGIN}/index.html`);

  const records: unknown[] = [];
  for (const frames of FRAME_COUNTS) {
    for (let rep = 1; rep <= REPS; rep += 1) {
      const names = frameNames(frames);
      const record = await page.evaluate(
        async ({ ceiling, frameList, repetition }) => {
          // Loading the module and staging its inputs, kept apart from the
          // timed call so the measurement is the merge and nothing else.
          const load = async () => {
            const startupStarted = performance.now();
            // Non-literal on purpose: tsc tries to resolve a literal specifier
            // against the filesystem and fails, though the browser resolves it
            // against the page origin at run time.
            const moduleUrl = "/wasm/hdrgen.js";
            const factory = (await import(moduleUrl)).default;
            const instance = await factory({
              noInitialRun: true,
              print: () => undefined,
              printErr: () => undefined,
            });
            const elapsed = performance.now() - startupStarted;

            instance.FS.mkdir("/src");
            instance.FS.mkdir("/work");
            const paths: string[] = [];
            for (const [index, name] of frameList.entries()) {
              const response = await fetch(`/frames/${name}`);
              const bytes = new Uint8Array(await response.arrayBuffer());
              const at = `/src/${index + 1}-${name}`;
              instance.FS.writeFile(at, bytes);
              paths.push(at);
            }
            const responseCurve = await fetch("/response");
            instance.FS.writeFile(
              "/src/response.rsp",
              new Uint8Array(await responseCurve.arrayBuffer())
            );
            return { instance, paths, startupMs: elapsed };
          };

          const { instance: mod, paths: staged, startupMs } = await load();

          const argv = [
            "-m",
            "1000",
            ...staged,
            "-o",
            "/work/out.hdr",
            "-r",
            "/src/response.rsp",
            "-a",
            "-e",
            "-f",
            "-g",
            "-F",
          ];

          const started = performance.now();
          let status = "ok";
          let detail: string | null = null;
          try {
            mod.callMain(argv);
          } catch (error) {
            status = "error";
            detail = String(error).slice(0, 200);
          }
          const runMs = performance.now() - started;

          const produced = () => {
            try {
              return mod.FS.readFile("/work/out.hdr").length as number;
            } catch {
              return 0;
            }
          };
          const outBytes = produced();

          if (status === "ok" && outBytes === 0) {
            status = "error";
            detail = "no output produced";
          }
          // callMain is synchronous, so an over-budget run cannot be cut short
          // from here. It is recorded as a timeout after the fact, which is
          // still the honest label for what a user would have experienced.
          if (status === "ok" && runMs > ceiling) {
            status = "timeout";
          }

          return {
            detail,
            frames: frameList.length,
            outBytes,
            rep: repetition,
            runMs: status === "ok" ? runMs : null,
            startupMs,
            status,
          };
        },
        { ceiling: CEILING_MS, frameList: names, repetition: rep }
      );
      records.push({
        ...(record as object),
        leg: `wasm-${testInfo.project.name}`,
      });
      process.stdout.write(
        `BENCH ${testInfo.project.name} ${frames} frames rep ${rep}: ${JSON.stringify(record)}\n`
      );
    }
  }

  writeFileSync(
    OUT.replace(/\.json$/, `.${testInfo.project.name}.json`),
    JSON.stringify(records, null, 2)
  );
});
