/**
 * Compares the TypeScript falsecolor against the Perl original, on a real
 * pipeline output, using the same native Radiance binaries for both.
 *
 * Holding the tools fixed is the point: any difference is this port's logic
 * rather than a tool-version or wasm effect. Those are covered separately in
 * radiantlab/HDRICalibrationTool#229.
 *
 * Skipped unless both a Radiance install and the reference picture are
 * present, so it never breaks CI or a fresh checkout. Point it elsewhere with
 * RADIANCE_BIN and FC_TEST_PICTURE.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { falsecolor } from "./falsecolor";
import { WORK_DIR } from "./stages";
import type { ToolIo, ToolResult, ToolRunner } from "./types";

const RADIANCE_BIN = process.env.RADIANCE_BIN ?? "/usr/local/radiance/bin";
const RAYPATH_DIR = process.env.RAYPATH ?? "/usr/local/radiance/lib";
/**
 * A real 1000x1000 pipeline output, committed so this test does not depend on
 * anyone's local files. Produced by the JPEG bracket through the existing Rust
 * pipeline.
 */
const PICTURE =
  process.env.FC_TEST_PICTURE ??
  join(import.meta.dirname, "__fixtures__", "pipeline-output-1000x1000.hdr");
const FALSECOLOR_PL =
  process.env.FALSECOLOR_PL ??
  "/Users/ulbrical/GitHub/Radiance/src/px/falsecolor.pl";

const available =
  existsSync(join(RADIANCE_BIN, "pcomb")) &&
  existsSync(PICTURE) &&
  existsSync(FALSECOLOR_PL);

/**
 * A `ToolRunner` that spawns the real binaries against a real directory.
 *
 * Deliberately not the wasm runner: this test is about falsecolor's logic, and
 * introducing Emscripten would only add a variable.
 */
class NativeToolRunner implements ToolRunner {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private real(path: string): string {
    return path.startsWith(`${WORK_DIR}/`)
      ? join(this.dir, path.slice(WORK_DIR.length + 1))
      : path;
  }

  run(tool: string, args: string[], io?: ToolIo): Promise<ToolResult> {
    const mapped = args.map((arg) => this.real(arg));
    const input = io?.stdin ? readFileSync(this.real(io.stdin)) : undefined;
    try {
      const stdout = execFileSync(join(RADIANCE_BIN, tool), mapped, {
        env: { ...process.env, RAYPATH: RAYPATH_DIR },
        input,
        maxBuffer: 512 * 1024 * 1024,
      });
      if (io?.stdout) {
        writeFileSync(this.real(io.stdout), stdout);
      }
      return Promise.resolve({
        code: 0,
        stderr: "",
        stdout: io?.captureStdout ? stdout.toString("latin1") : "",
      });
    } catch (error) {
      const failure = error as {
        status?: number;
        stderr?: Buffer;
        stdout?: Buffer;
      };
      if (io?.stdout && failure.stdout) {
        writeFileSync(this.real(io.stdout), failure.stdout);
      }
      return Promise.resolve({
        code: failure.status ?? 1,
        stderr: failure.stderr?.toString() ?? "",
        stdout: io?.captureStdout
          ? (failure.stdout?.toString("latin1") ?? "")
          : "",
      });
    }
  }

  writeFile(path: string, data: Uint8Array | string): Promise<void> {
    writeFileSync(this.real(path), data);
    return Promise.resolve();
  }

  readFile(path: string): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(readFileSync(this.real(path))));
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(existsSync(this.real(path)));
  }
}

/** Pixel payload only: the header records the command that produced it. */
function payload(data: Uint8Array): Uint8Array {
  let i = 0;
  for (; i < data.length - 1; i += 1) {
    if (data[i] === 10 && data[i + 1] === 10) {
      break;
    }
  }
  i += 2;
  while (i < data.length && data[i] !== 10) {
    i += 1;
  }
  return data.subarray(i + 1);
}

const describeIfAvailable = available ? describe : describe.skip;

describeIfAvailable("falsecolor: TypeScript vs Perl", () => {
  let dir: string;
  let perlOut: Uint8Array;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "fc-parity-"));
  });

  const runPerl = (args: string[], out: string) => {
    const stdout = execFileSync("perl", [FALSECOLOR_PL, ...args], {
      // RAYPATH matters: psign resolves helvet.fnt through it, and without it
      // falsecolor emits a 65-byte stub and still exits 0.
      env: {
        ...process.env,
        PATH: `${RADIANCE_BIN}:${process.env.PATH}`,
        RAYPATH: RAYPATH_DIR,
      },
      maxBuffer: 512 * 1024 * 1024,
    });
    writeFileSync(out, stdout);
    return new Uint8Array(stdout);
  };

  it("matches on the labelled invocation the pipeline uses", async () => {
    const args = ["-s", "1000", "-l", "cd/m2", "-n", "8", "-e", "-i", PICTURE];
    perlOut = runPerl(args, join(dir, "perl.hdr"));

    const runner = new NativeToolRunner(dir);
    await falsecolor(runner, {
      argv: args,
      input: PICTURE,
      legendHeight: "",
      legendWidth: "",
      output: `${WORK_DIR}/ts.hdr`,
      scaleLabel: "cd/m2",
      scaleLevels: "8",
      scaleLimit: "1000",
    });
    const tsOut = await runner.readFile(`${WORK_DIR}/ts.hdr`);

    expect(payload(tsOut)).toEqual(payload(perlOut));
  }, 300_000);

  it("matches on the unlabelled invocation", async () => {
    const args = ["-e", "-i", PICTURE];
    const perl = runPerl(args, join(dir, "perl2.hdr"));

    const runner = new NativeToolRunner(dir);
    await falsecolor(runner, {
      argv: args,
      input: PICTURE,
      legendHeight: "",
      legendWidth: "",
      output: `${WORK_DIR}/ts2.hdr`,
      scaleLabel: "",
      scaleLevels: "",
      scaleLimit: "",
    });
    const tsOut = await runner.readFile(`${WORK_DIR}/ts2.hdr`);

    expect(payload(tsOut)).toEqual(payload(perl));
  }, 300_000);

  afterAll(() => {
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
