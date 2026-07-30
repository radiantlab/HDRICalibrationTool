/**
 * Writing finished pictures out.
 *
 * Two hosts, two very different shapes, and the difference is not cosmetic.
 *
 * The desktop writes each output to the configured directory. A browser
 * cannot: `showSaveFilePicker` requires a user gesture *per file*, and a batch
 * produces two files per image set, so a ten-set run would ask for twenty
 * gestures. Even where File System Access exists, that is unusable.
 *
 * So a browser downloads. The browser decides where the file lands, which is
 * why the output-path setting is hidden there rather than left to look
 * meaningful. Downloads are triggered from an anchor rather than a picker,
 * which needs no gesture at all and works in Safari, where File System Access
 * does not exist.
 */

import { registerOutputFile } from "../vfs";
import { isTauri } from "./env";

export interface SavedOutput {
  /**
   * True when the file went to the browser's download folder rather than
   * somewhere the app chose. Callers should say so: a picture that appears
   * nowhere the user was looking is indistinguishable from one that was never
   * written.
   */
  downloaded: boolean;
  /** A path the app can read back. Real on the desktop, virtual in a browser. */
  location: string;
  name: string;
}

/**
 * Writes one output and returns where it went.
 *
 * `directory` is ignored in a browser, where there is nowhere to put it but
 * the download folder.
 */
export async function saveOutput(
  directory: string,
  name: string,
  bytes: Uint8Array
): Promise<SavedOutput> {
  if (isTauri()) {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const location = joinPath(directory, name);
    await writeFile(location, bytes);
    return { downloaded: false, location, name };
  }

  download(name, bytes);
  // Also kept in the session filesystem. The download is the user's copy and
  // the app cannot read it back, so without this the viewer would have nothing
  // to open after a run that just succeeded.
  return { downloaded: true, location: registerOutputFile(name, bytes), name };
}

function download(name: string, bytes: Uint8Array): void {
  // A copy into a fresh ArrayBuffer: the caller's view may be a subarray of a
  // larger buffer, and Blob would otherwise capture the whole thing.
  const blob = new Blob(
    [
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
    ],
    { type: "application/octet-stream" }
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Not revoked immediately: the download is started asynchronously and
  // revoking too early cancels it in some browsers. A picture is tens of
  // megabytes, so it is not left indefinitely either.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Joins an output directory and a filename.
 *
 * `node:path` is not usable here -- next.config.js aliases `path` to
 * path-browserify for tiff.js -- and the separator is whichever the host
 * already used, so a Windows path stays a Windows path.
 */
export function joinPath(directory: string, name: string): string {
  const trimmed = directory.replace(TRAILING_SEPARATOR, "");
  const separator = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${name}`;
}

/** A trailing slash or backslash on the output directory. */
const TRAILING_SEPARATOR = /[\\/]+$/;
