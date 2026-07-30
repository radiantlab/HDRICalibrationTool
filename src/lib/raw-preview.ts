/**
 * Converts RAW files to TIFF once, and shares the result.
 *
 * This is the only place a RAW file is demosaiced. Both consumers go through
 * it: the viewer's thumbnails and the pipeline's merge stage. They can share
 * because they want *the same bytes* -- `dcrawArgs` is one definition and both
 * use it, so the TIFF the preview shows and the TIFF hdrgen merges are
 * byte-identical (verified: sha256 8137c98a... from the browser preview path,
 * the pipeline, and a native build alike).
 *
 * Sharing matters more than it first looks. `image-set-preview.tsx` renders a
 * thumbnail for every file in a set, so uploading a 10-frame CR2 bracket
 * already converts all ten; running the pipeline then converted them a second
 * time. That was ~20 s and 673 MB of pure repetition on every run. See #242.
 *
 * A 5796x3870 CR2 takes about 1.9 s and peaks around 266 MiB of wasm heap,
 * measured in Chromium. That is per instance and reclaimed when the instance
 * is dropped.
 *
 * If the two flag sets ever diverge, sharing silently stops being correct.
 * `-q 3` is the slowest demosaic and overkill for a thumbnail, so there is a
 * standing temptation to speed previews up with `-q 0`. That would leave both
 * call sites looking right while the preview no longer showed what the
 * pipeline measures. Hence one `dcrawArgs`, used by both.
 */

import { dcrawArgs, workPath } from "./pipeline/stages";
import type { ModuleLoader } from "./pipeline/wasm-runner";
import {
  urlModuleCompiler,
  urlModuleLoader,
  WasmToolRunner,
} from "./pipeline/wasm-runner";

/** Where the browser builds are served from. See `public/wasm/README.md`. */
const WASM_BASE_URL = "/wasm";

/** Either separator, so a Windows path keeps working unchanged. */
const PATH_SEPARATOR = /[\\/]/;

/**
 * How much converted TIFF to keep.
 *
 * Deliberately smaller than two full brackets. Ten frames is 673 MB, and
 * pinning several sets for a whole session would undo the release the pipeline
 * performs after its merge (#232). This keeps one bracket resident, which is
 * the case that matters -- preview then run -- and lets a longer session evict
 * its oldest frames rather than growing without bound.
 *
 * Entries are held by reference, not copied. `WasmToolRunner.writeFile` stores
 * the array it is handed, so staging a cached frame into the pipeline costs no
 * additional memory: the cache and the runner point at the same buffer.
 */
const BUDGET_BYTES = 768 * 1024 * 1024;

/** What the converter needs from its host, so this module imports no Tauri. */
export interface RawSourceIo {
  /**
   * Something that changes when the file's contents change.
   *
   * Optional, and the reason it exists: keying on path alone means a file
   * replaced on disk mid-session serves the previous conversion forever. The
   * Rust implementation this replaced avoided that by hashing contents; size
   * and mtime are far cheaper and catch the same case.
   */
  fingerprint?: (path: string) => Promise<string>;
  /** Resolves wasm modules. Defaults to fetching them from `/wasm`; injected in tests. */
  load?: ModuleLoader;
  readFile: (path: string) => Promise<Uint8Array>;
}

interface Entry {
  /** Zero until the conversion resolves, so a pending entry evicts nothing. */
  bytes: number;
  tiff: Promise<Uint8Array<ArrayBuffer>>;
}

/** Insertion-ordered, so the first key is the least recently used. */
const cache = new Map<string, Entry>();
let held = 0;

/**
 * Returns the TIFF bytes for a RAW file, converting on first request.
 *
 * The promise rather than its result is cached, so a thumbnail strip asking
 * for ten frames at once does not start ten instances of a tool that peaks at
 * 266 MiB each.
 */
export async function rawToTiff(
  path: string,
  io: RawSourceIo
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await cacheKey(path, io);

  const hit = cache.get(key);
  if (hit) {
    // Re-inserting moves it to the end, which is what makes eviction least
    // recently *used* rather than merely oldest.
    cache.delete(key);
    cache.set(key, hit);
    return hit.tiff;
  }

  const tiff = convert(path, io).catch((error: unknown) => {
    // A failure must not be remembered as a result, or the file could never be
    // retried without a reload.
    forget(key);
    throw error;
  });

  const entry: Entry = { bytes: 0, tiff };
  cache.set(key, entry);

  tiff
    .then((data) => {
      entry.bytes = data.byteLength;
      held += data.byteLength;
      evictDownToBudget(key);
    })
    .catch(() => {
      // Handled above; this only prevents an unhandled rejection.
    });

  return tiff;
}

async function cacheKey(path: string, io: RawSourceIo): Promise<string> {
  if (!io.fingerprint) {
    return path;
  }
  try {
    return `${path}|${await io.fingerprint(path)}`;
  } catch {
    // A failed stat is not a reason to refuse to convert; falling back to the
    // path alone is exactly what the cache would have done without one.
    return path;
  }
}

/** Drops least-recently-used first, never the entry just added. */
function evictDownToBudget(keep: string): void {
  for (const [key, entry] of Array.from(cache.entries())) {
    if (held <= BUDGET_BYTES) {
      return;
    }
    if (key !== keep) {
      held -= entry.bytes;
      cache.delete(key);
    }
  }
}

function forget(key: string): void {
  const entry = cache.get(key);
  if (entry) {
    held -= entry.bytes;
    cache.delete(key);
  }
}

async function convert(
  path: string,
  io: RawSourceIo
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await io.readFile(path);
  const runner = new WasmToolRunner({
    compile: io.load ? undefined : urlModuleCompiler(WASM_BASE_URL),
    load: io.load ?? urlModuleLoader(WASM_BASE_URL),
  });

  // The name is kept because a path outside /work would need its parent
  // directories created, and dcraw_emu reports errors against it.
  const input = workPath(baseName(path));
  const output = workPath("preview.tiff");

  await runner.writeFile(input, bytes);
  const result = await runner.run("dcraw_emu", dcrawArgs(input, output));
  if (result.code !== 0) {
    throw new Error(
      `dcraw_emu could not convert ${path} (exit ${result.code})` +
        (result.stderr ? `: ${result.stderr.trim()}` : "")
    );
  }

  const tiff = await runner.readFile(output);
  // Frees the source and the runner's own reference. What the cache hands out
  // afterwards is this same buffer, never a copy.
  runner.clear();
  // MEMFS hands back a plain ArrayBuffer-backed view, never a SharedArrayBuffer
  // -- these builds are single-threaded, which is what keeps them hostable
  // without COOP/COEP headers, and a page served without those headers does
  // not even define SharedArrayBuffer. Narrowed here so callers can pass
  // `.buffer` straight to the tiff worker instead of copying it.
  return tiff as Uint8Array<ArrayBuffer>;
}

/**
 * Returns an already-converted TIFF, or undefined. Never converts.
 *
 * The pipeline runs in a worker, so converting here would put the ~2 s a frame
 * back on the main thread -- exactly what moving it off was for. This lets the
 * page hand over conversions it is already holding and leave the rest to the
 * worker.
 */
export async function peekRawTiff(
  path: string,
  io: RawSourceIo
): Promise<Uint8Array | undefined> {
  const key = await cacheKey(path, io);
  const hit = cache.get(key);
  if (!hit) {
    return;
  }
  try {
    return await hit.tiff;
  } catch {
    // A conversion that failed is not a cache hit.
    return;
  }
}

export function clearRawPreviewCache(): void {
  cache.clear();
  held = 0;
}

/** Bytes of converted TIFF currently held. Exposed for tests and diagnostics. */
export function rawCacheBytes(): number {
  return held;
}

function baseName(path: string): string {
  const parts = path.split(PATH_SEPARATOR);
  return parts.at(-1) || "input.raw";
}
