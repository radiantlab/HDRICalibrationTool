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

/** Compiles a tool's `.wasm` once, so instances can be made from it cheaply. */
export type ModuleCompiler = (tool: string) => Promise<WebAssembly.Module>;

/**
 * Loads `<baseUrl>/<tool>.js` as an ES module.
 *
 * The builds are `-sMODULARIZE=1 -sEXPORT_ES6=1`, so the default export is the
 * factory. Only usable where dynamic `import()` of a URL works, which is the
 * browser and the Tauri webview but not Jest -- tests inject their own loader.
 *
 * The browser's own failure for a bad dynamic import is "Importing a module
 * script failed", with no indication of which module or why. Since the module
 * is same-origin and fetchable, a HEAD first turns the common causes -- wrong
 * base URL, a stale build without the artifacts, the app pointed at a
 * different dev-server port -- into a message that names them, and leaves a
 * genuine parse or CSP failure reported as itself.
 */
export function urlModuleLoader(baseUrl: string): ModuleLoader {
  return async (tool: string) => {
    const url = `${baseUrl}/${tool}.js`;
    await assertReachable(url, tool);
    try {
      const module = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ url
      )) as { default: ModuleFactory };
      return module.default;
    } catch (error) {
      throw new Error(
        `${tool}: ${url} is served but could not be imported as a module ` +
          `(${describe(error)}). The file is reachable, so this is a parse or ` +
          "policy failure rather than a missing artifact.",
        { cause: error }
      );
    }
  };
}

/**
 * Compiled modules, shared across every runner in the page.
 *
 * Keyed by URL rather than held on a runner, because a runner is created per
 * pipeline run and another per RAW preview -- caching inside one would still
 * recompile dcraw_emu for every thumbnail. A compiled `WebAssembly.Module` is
 * immutable and carries no instance state, so sharing it is safe; the instances
 * made from it are what stay per-call.
 */
const compiledModules = new Map<string, Promise<WebAssembly.Module>>();

/**
 * Compiles `<baseUrl>/<tool>.wasm`, streaming where the host allows it.
 *
 * `compileStreaming` needs the response served as `application/wasm`; a host
 * that gets the MIME type wrong rejects it, so this falls back to compiling
 * from an ArrayBuffer rather than failing the run outright.
 */
export function urlModuleCompiler(baseUrl: string): ModuleCompiler {
  return (tool: string) => {
    const url = `${baseUrl}/${tool}.wasm`;
    const cached = compiledModules.get(url);
    if (cached) {
      return cached;
    }
    const compiling = compileFrom(url, tool).catch((error: unknown) => {
      // A failure must not be remembered, or the tool can never be retried.
      compiledModules.delete(url);
      throw error;
    });
    compiledModules.set(url, compiling);
    return compiling;
  };
}

async function compileFrom(
  url: string,
  tool: string
): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch (streamingError) {
    // Streaming compilation refuses anything not served as `application/wasm`,
    // which some static hosts get wrong. Fetching the bytes and compiling them
    // works regardless, so the fallback is worth having.
    const response = await fetch(url);
    if (!response.ok) {
      // The streaming failure is carried along: on a misconfigured host the
      // status is the useful half, and on a genuinely broken module the
      // original compile error is.
      throw new Error(`${tool}: ${url} returned ${response.status}`, {
        cause: streamingError,
      });
    }
    return await WebAssembly.compile(await response.arrayBuffer());
  }
}

async function assertReachable(url: string, tool: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: "HEAD" });
  } catch (error) {
    throw new Error(
      `${tool}: could not reach ${url} (${describe(error)}). ` +
        `Expected it at ${new URL(url, globalThis.location?.href ?? "http://localhost").href}. ` +
        "Check that the app is served from the same origin as public/wasm/.",
      { cause: error }
    );
  }
  if (!response.ok) {
    throw new Error(
      `${tool}: ${url} returned ${response.status}. The wasm artifacts are ` +
        "missing from this build -- see public/wasm/README.md. If the app is " +
        "running against a dev server, confirm it is the one serving these " +
        "files and not a second instance on another port."
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface WasmRunnerOptions {
  /**
   * Compiles each tool's `.wasm` once.
   *
   * Optional, and worth a great deal when supplied. A fresh module instance is
   * created for every stage -- `EXIT_RUNTIME=1` allows one `main()` each -- and
   * left to itself the Emscripten glue re-fetches and re-compiles the binary on
   * every one of them. Measured over six instantiations of hdrgen: six network
   * requests and 9.1 ms each, against zero requests and 1.2 ms each when the
   * compiled module is reused. Locally that fetch comes from cache and only
   * looks like overhead; on a host that serves `public/` with
   * `must-revalidate` it is a round trip per stage, on a 2.6 MB file.
   *
   * Note that passing `wasmBinary` does *not* work: these builds declare the
   * variable and never read it back off the module argument, so it is silently
   * ignored. `instantiateWasm` is the hook the glue actually honours.
   */
  compile?: ModuleCompiler;
  load: ModuleLoader;
  /** Reports each tool's peak wasm heap, for surfacing memory pressure. */
  onHeapPeak?: (tool: string, bytes: number) => void;
}

/** Where a captured stdout is parked inside an instance before being read back. */
const CAPTURE_PATH = `${WORK_DIR}/.stdout`;

export class WasmToolRunner implements ToolRunner {
  private readonly files = new Map<string, Uint8Array>();
  private readonly load: ModuleLoader;
  private readonly compile: ModuleCompiler | undefined;
  /** Compiled modules are cached; the *instances* made from them never are. */
  private readonly compiled = new Map<string, Promise<WebAssembly.Module>>();
  private readonly onHeapPeak:
    | ((tool: string, bytes: number) => void)
    | undefined;
  /** Factories are cached; the *instances* they produce never are. */
  private readonly factories = new Map<string, Promise<ModuleFactory>>();

  constructor(options: WasmRunnerOptions) {
    this.load = options.load;
    this.compile = options.compile;
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

  /**
   * Drops files the pipeline has finished with.
   *
   * Unknown paths are ignored rather than reported: the orchestrator releases
   * the source images whether or not they were RAW, and on the JPEG path
   * `prepareInputs` never converted anything, so most of that list is legitimately
   * absent.
   */
  release(paths: string[]): void {
    for (const path of paths) {
      this.files.delete(path);
    }
  }

  /**
   * Bytes currently held in JS memory.
   *
   * Exposed because this, not wasm linear memory, is what a large bracket
   * actually consumes. MEMFS keeps file bytes outside the wasm heap (#234), so
   * `onHeapPeak` measures a per-instance working set that says nothing about
   * how much the run is accumulating. See #232.
   */
  retainedBytes(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.byteLength;
    }
    return total;
  }

  async run(tool: string, args: string[], io?: ToolIo): Promise<ToolResult> {
    const factory = await this.factoryFor(tool);

    const stderr: string[] = [];
    const compiled = await this.compiledFor(tool);
    const instance = await factory({
      // Hands the glue an already-compiled module rather than letting it fetch
      // and compile its own. Emscripten calls this instead of everything else
      // when present.
      ...(compiled
        ? {
            instantiateWasm: (
              imports: WebAssembly.Imports,
              done: (
                instance: WebAssembly.Instance,
                module: WebAssembly.Module
              ) => void
            ) => {
              WebAssembly.instantiate(compiled, imports).then(
                (instantiated) => {
                  done(instantiated, compiled);
                }
              );
            },
          }
        : {}),
      // stderr is small (warnings, usage errors), so collecting it line by line
      // is fine. stdout is not -- an intermediate runs to tens of megabytes --
      // which is why it goes to a file instead.
      printErr: (line: string) => stderr.push(line),
      // argv[0], which Emscripten otherwise sets to "./this.program". Radiance
      // tools record argv[0] in the picture header, so without this every
      // stage is credited to "this.program" -- and `getinfo -r "pcompos "`,
      // which falsecolor uses to strip its own scaffolding out of the header,
      // matches on that name and silently removes nothing.
      thisProgram: tool,
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

  private compiledFor(tool: string): Promise<WebAssembly.Module | undefined> {
    if (!this.compile) {
      return Promise.resolve(undefined);
    }
    const cached = this.compiled.get(tool);
    if (cached) {
      return cached;
    }
    const compiling = this.compile(tool);
    this.compiled.set(tool, compiling);
    return compiling;
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
