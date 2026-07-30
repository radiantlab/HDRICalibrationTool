/**
 * Resolves paths that do not exist on any disk.
 *
 * The whole app is built around file paths: `PipelineParams.inputImages` is
 * `string[]`, `dcrawArgs` and `hdrgenArgs` build argv out of paths, and the
 * wasm runner uses a tool's argv as its dependency list. That contract is what
 * the byte-identical validation was measured against, so the browser build
 * keeps it rather than threading `File` objects through the pipeline.
 *
 * Instead, files that have no real path get a synthetic one, and this module
 * maps it back to bytes. Two kinds, with deliberately different lifetimes:
 *
 *  - **Session paths** (`/session/...`), for images the user just picked. A
 *    browser cannot reopen last session's file anyway, so these are registered
 *    in memory and die with the tab.
 *  - **Stored paths** (`/presets/...`), for a preset's calibration files. These
 *    must survive a reload, because a preset that cannot resolve its own `.cal`
 *    is the zero-byte bug in a new costume. They resolve from IndexedDB, and
 *    the path is derived from the preset id and slot, so it is the same string
 *    in every session.
 *
 * A path that is not synthetic is left alone, which is what lets the desktop
 * build keep using real ones for input images.
 */

import { getFile } from "./storage/kv";

const LEADING_SLASH = /^\//;
const SESSION_PREFIX = "/session/";
const STORED_PREFIX = "/presets/";

/** In-memory, for this session's picked files. */
const session = new Map<string, Uint8Array>();

export function isVirtualPath(path: string): boolean {
  return path.startsWith(SESSION_PREFIX) || path.startsWith(STORED_PREFIX);
}

/**
 * Registers bytes under a session path and returns it.
 *
 * The name is kept in the path because it reaches the user in error messages,
 * and because `dcraw_emu` and hdrgen both report against the filename.
 */
export function registerSessionFile(name: string, bytes: Uint8Array): string {
  const path = `${SESSION_PREFIX}${nextId()}/${name}`;
  session.set(path, bytes);
  return path;
}

/**
 * Registers a finished picture so the viewer can open it.
 *
 * In a browser an output is downloaded, and a download leaves nothing the app
 * can read back: the file belongs to the browser now. Keeping the bytes under
 * a readable path means "view result" still works after a run, which is most
 * of the point of producing the picture.
 */
export function registerOutputFile(name: string, bytes: Uint8Array): string {
  const path = `${SESSION_PREFIX}output/${name}`;
  session.set(path, bytes);
  return path;
}

/** The stable path for a preset's calibration file. */
export function presetPath(id: string, fileName: string): string {
  return `${STORED_PREFIX}${id}/${fileName}`;
}

/** The blob-store key a stored path maps to. */
export function storedKey(path: string): string {
  return path.replace(LEADING_SLASH, "");
}

/**
 * Reads a synthetic path.
 *
 * Throws rather than returning empty for a path that should resolve and does
 * not. An empty `.cal` silently turns its correction into a no-op, which is
 * exactly the failure mode this design exists to remove, so the one thing this
 * must never do is hand back nothing and let the run continue.
 */
export async function readVirtual(path: string): Promise<Uint8Array> {
  if (path.startsWith(SESSION_PREFIX)) {
    const bytes = session.get(path);
    if (!bytes) {
      throw new Error(
        `${path} is no longer available. Files chosen in a previous session ` +
          "have to be selected again."
      );
    }
    // A registered entry can still read as nothing, because a consumer that
    // transfers the array to a worker detaches it and leaves a zero-length
    // view behind in this map. That is a bug in the consumer -- staging is
    // supposed to copy first -- but it used to surface as a silently empty
    // file, which is the failure this module exists to prevent, so it is
    // reported here rather than passed on.
    if (bytes.byteLength === 0) {
      throw new Error(
        `${path} reads as empty, which should not be possible for a file that ` +
          "was registered with contents. Select the files again."
      );
    }
    return bytes;
  }

  const stored = await getFile(storedKey(path));
  if (!stored) {
    throw new Error(`${path} is not in storage`);
  }
  if (stored.length === 0) {
    throw new Error(
      `${path} is empty, so the correction it carries would silently do ` +
        "nothing. Re-save the preset from an intact source file."
    );
  }
  return stored;
}

export async function virtualExists(path: string): Promise<boolean> {
  if (path.startsWith(SESSION_PREFIX)) {
    return session.has(path);
  }
  return (await getFile(storedKey(path))) !== undefined;
}

/** Frees this session's registered files. */
export function clearSessionFiles(): void {
  session.clear();
}

let counter = 0;
function nextId(): string {
  counter += 1;
  // Deliberately not random: two files picked in the same session need
  // distinct paths, and nothing outside this session ever sees them.
  return String(counter);
}
