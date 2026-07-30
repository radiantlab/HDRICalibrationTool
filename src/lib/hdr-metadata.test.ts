/**
 * Header parsing, ported from the `read_hdr_metadata` Tauri command.
 *
 * The fixtures are real headers from pipeline output: one CR2 run with no
 * calibration files, which keeps the whole provenance chain, and one JPEG run
 * with them, which keeps almost nothing because the last `pcomb` passes `-h`.
 * See #241 for why those differ.
 */

import { describe, expect, it } from "@jest/globals";
import { parseHdrMetadata } from "./hdr-metadata";

const encode = (text: string) => new TextEncoder().encode(text);

const CR2_HEADER = `#?RADIANCE
CAPDATE= 2026:07:29 12:08:25
GMT= 2026:07:29 19:08:25
/work/nullify_exposure_value.hdr:
\tCAMERA= Canon EOS 5D Mark III version dcraw v9.26
\tPRIMARIES= 0.6400 0.3300 0.2900 0.6000 0.1500 0.0600 0.3333 0.3333
EXPOSURE=1.0000e+00
pfilt -1 -x 1000 -y 1000
VIEW= -vta -vv 180 -vh 180
COMPUTED_VERTICAL_ILLUMINANCE=18.282153
FORMAT=32-bit_rle_rgbe

-Y 1000 +X 1000
PIXELS-FOLLOW`;

describe("parseHdrMetadata", () => {
  it("reads the key/value lines of a real header", () => {
    const metadata = parseHdrMetadata(encode(CR2_HEADER));

    expect(metadata.COMPUTED_VERTICAL_ILLUMINANCE).toBe("18.282153");
    expect(metadata.VIEW).toBe("-vta -vv 180 -vh 180");
    expect(metadata.FORMAT).toBe("32-bit_rle_rgbe");
    expect(metadata.EXPOSURE).toBe("1.0000e+00");
    // Indented continuation lines carry real information and are not skipped.
    expect(metadata.CAMERA).toBe("Canon EOS 5D Mark III version dcraw v9.26");
  });

  it("stops at the blank line and never reads pixels", () => {
    // A payload byte that happens to look like a header line must not appear.
    const withPayload = `${CR2_HEADER}\nSHOULD_NOT_APPEAR=1`;
    expect(
      parseHdrMetadata(encode(withPayload)).SHOULD_NOT_APPEAR
    ).toBeUndefined();
  });

  it("ignores lines that are not key=value", () => {
    const metadata = parseHdrMetadata(encode(CR2_HEADER));
    // The command line pfilt wrote has no '=' in it.
    expect(Object.keys(metadata)).not.toContain("pfilt -1 -x 1000 -y 1000");
    expect(Object.keys(metadata)).not.toContain("#?RADIANCE");
  });

  it("drops entries with an empty key or value, as the Rust version did", () => {
    const metadata = parseHdrMetadata(encode("A=\n=B\nC=1\n\n-Y 1 +X 1\n"));
    expect(metadata).toEqual({ C: "1" });
  });

  it("returns keys sorted, matching the BTreeMap it replaced", () => {
    const metadata = parseHdrMetadata(encode("ZED=1\nALPHA=2\nMID=3\n\n"));
    expect(Object.keys(metadata)).toEqual(["ALPHA", "MID", "ZED"]);
  });

  it("keeps '=' inside a value", () => {
    const metadata = parseHdrMetadata(
      encode("VIEW= -vta -vv 180\nEXPR=a=b=c\n\n")
    );
    expect(metadata.EXPR).toBe("a=b=c");
  });

  it("survives a picture with no header at all", () => {
    expect(parseHdrMetadata(new Uint8Array([0xff, 0x00, 0x0a]))).toEqual({});
  });

  it("does not throw on high bytes from the payload", () => {
    const bytes = new Uint8Array(200);
    bytes.set(encode("FORMAT=32-bit_rle_rgbe\n"), 0);
    bytes.fill(0xfe, 23);
    expect(() => parseHdrMetadata(bytes)).not.toThrow();
  });
});
