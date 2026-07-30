/**
 * A registered file resolves, or it says why. It never resolves to nothing.
 *
 * The module exists because an empty calibration file turns its correction into
 * a silent no-op, so a read that hands back zero bytes is the one outcome worth
 * ruling out. The session branch used to return whatever was in the map without
 * looking, which mattered once a consumer transferred one of those arrays to a
 * worker: the transfer detached it, the map kept a zero-length view, and every
 * later reader was served nothing at all.
 */

import { afterEach, describe, expect, it } from "@jest/globals";
import { clearSessionFiles, readVirtual, registerSessionFile } from "./vfs";

afterEach(() => {
  clearSessionFiles();
});

describe("reading a session file", () => {
  it("returns what was registered", async () => {
    const path = registerSessionFile("a.jpg", new Uint8Array([1, 2, 3]));
    await expect(readVirtual(path)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("says so when the path was never registered", async () => {
    await expect(readVirtual("/session/9/gone.jpg")).rejects.toThrow(
      "no longer available"
    );
  });

  it("refuses to serve an entry that has been detached", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const path = registerSessionFile("a.jpg", bytes);
    // Exactly what `postMessage` with a transfer list does to the array it is
    // given, which is how an entry registered with contents comes to read as
    // empty in the first place.
    bytes.buffer.transfer();

    await expect(readVirtual(path)).rejects.toThrow("reads as empty");
  });
});
