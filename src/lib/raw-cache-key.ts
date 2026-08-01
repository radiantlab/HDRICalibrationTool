/**
 * What names a cached conversion.
 *
 * Two parts, and the second is the one that is easy to leave out:
 *
 *  - **The content hash.** Not the path. `registerSessionFile` mints
 *    `/session/<n>/<name>` from a counter that restarts each session, so the
 *    same path names different bytes across visits and a path-keyed cache
 *    would serve the wrong image.
 *  - **A tool tag**, derived from the `dcraw_emu` commit the wasm was built
 *    from, the Emscripten toolchain version it was compiled with, and the
 *    flags it is run with. All three, not just the commit: #244 automates
 *    rebuilding from the same LibRaw commit on a bumped Emscripten, and a tag
 *    that only hashed the commit would call that an identical build and serve
 *    a stale TIFF as a hit over potentially different bytes -- undoing the
 *    byte-identical guarantee `raw-preview.ts` exists to hold.
 *
 * Folded into the key rather than checked on read, so a tool change simply
 * misses, stale entries age out by LRU, and a rollback re-hits its own entries
 * instead of having discarded them.
 */

import { sha256Hex } from "./hash";
import { dcrawArgs } from "./pipeline/stages";

interface VersionsDocument {
  emscripten?: string;
  tools?: Record<string, { commit?: string } | undefined>;
}

/** Memoised per base URL: the file describes committed artifacts. */
const tags = new Map<string, Promise<string>>();

/**
 * Identity of the converter, as twelve hex characters.
 *
 * `build-versions.ts` is not reused here because it hardcodes a relative
 * `/wasm`, and in a worker a relative URL resolves against the worker's own
 * chunk rather than the document. The absolute base is passed in instead.
 */
export function toolTag(wasmBaseUrl: string): Promise<string> {
  const cached = tags.get(wasmBaseUrl);
  if (cached) {
    return cached;
  }
  const deriving = derive(wasmBaseUrl).catch((error: unknown) => {
    // Not remembered, so a transient fetch failure -- or a versions.json that
    // is missing the commit it must report -- does not pin a failure for the
    // life of the worker; a later call with a healthy response can still
    // succeed.
    tags.delete(wasmBaseUrl);
    throw error;
  });
  tags.set(wasmBaseUrl, deriving);
  return deriving;
}

async function derive(wasmBaseUrl: string): Promise<string> {
  const response = await fetch(`${wasmBaseUrl}/versions.json`);
  if (!response.ok) {
    throw new Error(`${wasmBaseUrl}/versions.json returned ${response.status}`);
  }
  const versions = (await response.json()) as VersionsDocument;
  const commit = versions.tools?.dcraw_emu?.commit;
  if (!commit) {
    // Substituting a placeholder here would let two builds that both fail to
    // report a commit -- the likely case, since one build-script bug affects
    // every artifact -- collide on the same tag and share a cache entry, each
    // serving the other's pixels. Throwing instead is safe: the caller (see
    // raw-worker.ts, task 8) falls through to converting without a cache hit
    // or write, so the conversion still succeeds and only the persistent
    // cache is lost for the session.
    throw new Error(
      `${wasmBaseUrl}/versions.json is missing tools.dcraw_emu.commit`
    );
  }
  const { emscripten } = versions;
  if (!emscripten) {
    // Same reasoning as the missing-commit guard above: a placeholder would
    // let two builds that both fail to report it collide on one tag instead
    // of missing safely.
    throw new Error(`${wasmBaseUrl}/versions.json is missing emscripten`);
  }
  // Placeholder paths, so the tag tracks the flags and does not vary per frame.
  const args = dcrawArgs("in", "out").join(" ");
  // Emscripten folded in alongside the commit: rebuilding dcraw_emu.wasm from
  // the same LibRaw commit on a bumped toolchain (#244 automates this) can
  // still change the emitted bytes, and the commit alone can't see that.
  const digest = await sha256Hex(
    new TextEncoder().encode(`${commit}:${emscripten}:${args}`)
  );
  return digest.slice(0, 12);
}

/** `<content hash>-<tool tag>`. */
export async function rawCacheKey(
  bytes: Uint8Array,
  tag: string
): Promise<string> {
  return `${await sha256Hex(bytes)}-${tag}`;
}

export function resetToolTagForTests(): void {
  tags.clear();
}
