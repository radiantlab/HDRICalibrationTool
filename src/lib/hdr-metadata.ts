/**
 * Reads a Radiance picture's header as key/value pairs.
 *
 * Port of the `read_hdr_metadata` Tauri command (`hdr_metadata.rs`), which was
 * the last one. Doing it here means Tauri holds no commands at all, and the
 * image viewer works in a browser unchanged.
 *
 * The header is the text before the first blank line. Everything the pipeline
 * records lands there: `VIEW=`, `COMPUTED_VERTICAL_ILLUMINANCE=`,
 * `MEASURED_VERTICAL_ILLUMINANCE=`, and whatever the tools wrote on the way
 * through.
 */

/** Sorted, matching the Rust `BTreeMap` the viewer's display order relied on. */
export type HdrMetadata = Record<string, string>;

/**
 * Only the header is decoded, not the pixels.
 *
 * A finished picture is tens of megabytes and the header is a few hundred
 * bytes, so decoding the whole file as text to find the first blank line would
 * be wasteful and, for RGBE payloads, would produce a great deal of garbage on
 * the way. 64 KB is far beyond any header this pipeline writes: the longest
 * observed is under 1.5 KB, from a CR2 run carrying the full hdrgen
 * provenance block.
 */
const HEADER_SCAN_BYTES = 64 * 1024;

export function parseHdrMetadata(bytes: Uint8Array): HdrMetadata {
  const head = bytes.subarray(0, Math.min(bytes.length, HEADER_SCAN_BYTES));
  // latin1 rather than utf-8: the header is ASCII, and a stray high byte from
  // the payload must not throw or produce a replacement character that changes
  // where the blank line is found.
  const text = new TextDecoder("latin1").decode(head);

  const metadata: HdrMetadata = {};
  const keys: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    // The blank line ends the header. Everything after it is the resolution
    // line and then pixels.
    if (line === "") {
      break;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    // Both halves must be non-empty, matching the Rust original. A bare `=`
    // or a valueless key is not information.
    if (key === "" || value === "") {
      continue;
    }
    if (!(key in metadata)) {
      keys.push(key);
    }
    metadata[key] = value;
  }

  // Sorted, because the Rust implementation returned a BTreeMap and the
  // viewer's metadata panel shows them in iteration order.
  const sorted: HdrMetadata = {};
  // Explicit comparator: header keys are ASCII, so the default lexicographic
  // sort is what the Rust BTreeMap did, but stating it keeps the linter and
  // the reader on the same page about locale not being involved.
  for (const key of keys.sort((a, b) => (a < b ? -1 : 1))) {
    sorted[key] = metadata[key] as string;
  }
  return sorted;
}
