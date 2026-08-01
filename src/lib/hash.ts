/**
 * Content hashing, in its own module so a worker can use it.
 *
 * This lived in `presets.ts`, which imports a React config provider. Importing
 * that into `raw-worker.ts` would pull React into the worker bundle for the
 * sake of one twelve-line function.
 */

/** Lowercase hex SHA-256. `crypto.subtle` is polyfilled for tests in jest.setup.js. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
