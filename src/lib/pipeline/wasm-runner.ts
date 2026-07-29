/**
 * A `ToolRunner` backed by Emscripten modules.
 *
 * The mechanism here is not guesswork -- every piece of it was measured in
 * radiantlab/HDRICalibrationTool#234 against real brackets in Chromium and
 * WebKit:
 *
 *  - **One fresh module instance per invocation.** The builds set
 *    `-sEXIT_RUNTIME=1`, so a module runs `main()` exactly once. Discarding the
 *    instance afterwards is also what reclaims its heap, which is why a
 *    2.13 GB hdrgen merge does not carry into later stages.
 *  - **`FS` stays usable after `callMain` returns**, despite EXIT_RUNTIME
 *    tearing the runtime down. Without that there would be no way to retrieve
 *    output at all.
 *  - **`callMain` returns the exit code** rather than throwing, so status and
 *    filesystem access are both available.
 *  - **MEMFS is per-instance**, so intermediates are copied between instances
 *    rather than shared. Measured at about 1 ms per intermediate, because the
 *    copy is a typed-array memcpy that never enters wasm linear memory.
 *  - **MEMFS keeps file bytes outside the wasm heap**, so staging inputs costs
 *    JS heap rather than counting against the wasm32 4 GB ceiling.
 *
 * Files therefore live in this class, in plain JS memory, and are staged into
 * each instance on demand. Where the `.js`/`.wasm` artifacts are served from
 * is a deployment question (#232/#233), so it is injected rather than assumed.
 */

import { WORK_DIR } from "./stages";
import type { ToolIo, ToolResult, ToolRunner } from "./types";

/**
 * The subset of an Emscripten module this runner uses.
 *
 * Everything named here is exported deliberately by the builds via
 * `-sEXPORTED_RUNTIME_METHODS=['FS','callMain','HEAPU8']`; none of it is
 * available by default.
 */
export interface EmscriptenModule {
  callMain: (args: string[]) => number;
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    readdir: (path: string) => string[];
    unlink: (path: string) => void;
    chdir: (path: string) => void;
    open: (path: string, flags: string) => unknown;
    close: (stream: unknown) => void;
    streams: unknown[];
  };
  HEAPU8: Uint8Array;
}

export type ModuleFactory = (
  options?: Record<string, unknown>
) => Promise<EmscriptenModule>;

/** Resolves a tool name to its Emscripten factory. */
export type ModuleLoader = (tool: string) => Promise<ModuleFactory>;

/**
 * Loads `<baseUrl>/<tool>.js` as an ES module.
 *
 * The builds are `-sMODULARIZE=1 -sEXPORT_ES6=1`, so the default export is the
 * factory. Only usable where dynamic `import()` of a URL works, which is the
 * browser and the Tauri webview but not Jest -- tests inject their own loader.
 */
export function urlModuleLoader(baseUrl: string): ModuleLoader {
  return async (tool: string) => {
    const module = (await import(
      /* webpackIgnore: true */ `${baseUrl}/${tool}.js`
    )) as { default: ModuleFactory };
    return module.default;
  };
}

export interface WasmRunnerOptions {
  load: ModuleLoader;
  /** Reports each tool's peak wasm heap, for surfacing memory pressure. */
  onHeapPeak?: (tool: string, bytes: number) => void;
}

/** Where a captured stdout is parked inside an instance before being read back. */
const CAPTURE_PATH = `${WORK_DIR}/.stdout`;

export class WasmToolRunner implements ToolRunner {
  private readonly files = new Map<string, Uint8Array>();
  private readonly load: ModuleLoader;
  private readonly onHeapPeak:
    | ((tool: string, bytes: number) => void)
    | undefined;
  /** Factories are cached; the *instances* they produce never are. */
  private readonly factories = new Map<string, Promise<ModuleFactory>>();

  constructor(options: WasmRunnerOptions) {
    this.load = options.load;
    this.onHeapPeak = options.onHeapPeak;
  }

  writeFile(path: string, data: Uint8Array | string): Promise<void> {
    this.files.set(
      path,
      typeof data === "string" ? new TextEncoder().encode(data) : data
    );
    return Promise.resolve();
  }

  readFile(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) {
      return Promise.reject(new Error(`no such file: ${path}`));
    }
    return Promise.resolve(file);
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }

  /** Frees every staged file. Call between image sets. */
  clear(): void {
    this.files.clear();
  }

  async run(tool: string, args: string[], io?: ToolIo): Promise<ToolResult> {
    const factory = await this.factoryFor(tool);

    const stderr: string[] = [];
    const instance = await factory({
      // stderr is small (warnings, usage errors), so collecting it line by line
      // is fine. stdout is not -- an intermediate runs to tens of megabytes --
      // which is why it goes to a file instead.
      printErr: (line: string) => stderr.push(line),
    });

    makeDir(instance, WORK_DIR);
    const staged = this.stageInputs(instance, args, io);
    instance.FS.chdir(WORK_DIR);

    const captureTo = io?.captureStdout ? CAPTURE_PATH : io?.stdout;
    redirectStdio(instance, io?.stdin, captureTo);

    const code = instance.callMain(args);

    this.onHeapPeak?.(tool, instance.HEAPU8.length);

    // FS remains readable here despite EXIT_RUNTIME=1 -- verified in #234.
    let stdout = "";
    if (io?.captureStdout) {
      stdout = new TextDecoder().decode(readIfPresent(instance, CAPTURE_PATH));
    }
    this.collectOutputs(instance, staged);

    return { code, stderr: stderr.join("\n"), stdout };
  }

  private factoryFor(tool: string): Promise<ModuleFactory> {
    const cached = this.factories.get(tool);
    if (cached) {
      return cached;
    }
    const loading = this.load(tool);
    this.factories.set(tool, loading);
    return loading;
  }

  /**
   * Copies in only the files this invocation names.
   *
   * Staging everything would mean re-copying every intermediate on every
   * stage. The paths a tool reads are all in its argv or its stdin, so the
   * argument list doubles as the dependency list.
   */
  private stageInputs(
    instance: EmscriptenModule,
    args: string[],
    io?: ToolIo
  ): Set<string> {
    const staged = new Set<string>();
    const candidates = io?.stdin ? [io.stdin, ...args] : args;

    for (const candidate of candidates) {
      const file = this.files.get(candidate);
      if (file && !staged.has(candidate)) {
        // Source images keep whatever path the caller gave them, which is not
        // necessarily under /work. MEMFS has no implicit parents, so
        // FS.writeFile on an uncreated directory fails with ENOENT.
        makeParentDirs(instance, candidate);
        instance.FS.writeFile(candidate, file);
        staged.add(candidate);
      }
    }
    return staged;
  }

  /**
   * Pulls back anything the tool produced.
   *
   * Reading the whole of `/work` rather than only the declared output means a
   * tool that writes a file it was not asked about -- hdrgen's `-o`,
   * `dcraw_emu`'s `-Z` -- is handled without the runner needing to know each
   * tool's argument conventions.
   */
  private collectOutputs(
    instance: EmscriptenModule,
    staged: Set<string>
  ): void {
    for (const name of instance.FS.readdir(WORK_DIR)) {
      if (name === "." || name === "..") {
        continue;
      }
      const path = `${WORK_DIR}/${name}`;
      if (staged.has(path) || path === CAPTURE_PATH) {
        continue;
      }
      const data = readIfPresent(instance, path);
      if (data.length > 0 || !this.files.has(path)) {
        this.files.set(path, data);
      }
    }
  }
}

/**
 * Points stdin and stdout at files.
 *
 * There is no shell in wasm, so `< in > out` has to be done by hand. Emscripten
 * hands out the lowest free descriptor, so closing fd 0 or 1 and immediately
 * reopening lands the new file on that descriptor. Verified in #234 rather
 * than assumed -- it depends on an allocation detail.
 */
function redirectStdio(
  instance: EmscriptenModule,
  stdin: string | undefined,
  stdout: string | undefined
): void {
  if (stdin) {
    instance.FS.close(instance.FS.streams[0]);
    instance.FS.open(stdin, "r");
  }
  if (stdout) {
    instance.FS.close(instance.FS.streams[1]);
    instance.FS.open(stdout, "w");
  }
}

/**
 * `mkdir -p` for the directory holding `path`.
 *
 * MEMFS creates nothing implicitly, so a file at `/in/a.jpg` needs `/in` to
 * exist first. Each level is attempted and an already-exists error ignored,
 * which is cheaper than probing.
 */
function makeParentDirs(instance: EmscriptenModule, path: string): void {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) {
    return;
  }
  const parts = path.slice(0, lastSlash).split("/").filter(Boolean);
  let prefix = "";
  for (const part of parts) {
    prefix += `/${part}`;
    makeDir(instance, prefix);
  }
}

function makeDir(instance: EmscriptenModule, path: string): void {
  try {
    instance.FS.mkdir(path);
  } catch {
    // already exists, which is the common case for /work
  }
}

function readIfPresent(instance: EmscriptenModule, path: string): Uint8Array {
  try {
    return instance.FS.readFile(path);
  } catch {
    return new Uint8Array(0);
  }
}
