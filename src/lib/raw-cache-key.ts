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
 *    from and the flags it is run with. Without it, rebuilding the artifacts
 *    (#244 automates exactly that) would serve pixels produced by a different
 *    demosaic while reporting success -- undoing the byte-identical guarantee
 *    `raw-preview.ts` exists to hold.
 *
 * Folded into the key rather than checked on read, so a tool change simply
 * misses, stale entries age out by LRU, and a rollback re-hits its own entries
 * instead of having discarded them.
 */

import { sha256Hex } from "./hash";
import { dcrawArgs } from "./pipeline/stages";

interface VersionsDocument {
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
    // Not remembered, so a transient fetch failure does not pin an
    // "unknown" tag for the life of the worker.
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
  const commit = versions.tools?.dcraw_emu?.commit ?? "unknown";
  // Placeholder paths, so the tag tracks the flags and does not vary per frame.
  const args = dcrawArgs("in", "out").join(" ");
  const digest = await sha256Hex(new TextEncoder().encode(`${commit}:${args}`));
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
