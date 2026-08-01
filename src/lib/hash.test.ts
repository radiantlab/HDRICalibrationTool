import { describe, expect, it } from "@jest/globals";
import { sha256Hex } from "./hash";

const HEX_DIGEST = /^[0-9a-f]{64}$/;

describe("sha256Hex", () => {
  it("returns the known digest of the empty input", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("returns 64 lowercase hex characters", async () => {
    const digest = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(digest).toMatch(HEX_DIGEST);
  });

  it("distinguishes different bytes", async () => {
    expect(await sha256Hex(new Uint8Array([1]))).not.toBe(
      await sha256Hex(new Uint8Array([2]))
    );
  });
});
