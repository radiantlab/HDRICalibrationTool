import { describe, expect, it } from "@jest/globals";
import { presetId } from "../src/lib/presets";

describe("presetId", () => {
  it("slugs a normal name", () => {
    expect(presetId("Canon 5D II f/8")).toBe("canon-5d-ii-f-8");
  });

  it("cannot contain a path separator", () => {
    // The id becomes a directory name under the presets folder, so a separator
    // would place the preset outside it.
    expect(presetId("Canon 5D II + Sigma 8mm, f/8")).not.toContain("/");
    expect(presetId("a\\b")).not.toContain("\\");
  });

  it("cannot traverse upwards", () => {
    expect(presetId("../../etc/passwd")).toBe("etc-passwd");
    expect(presetId("..")).toBe("preset");
  });

  it("falls back for a name with nothing usable", () => {
    expect(presetId("///")).toBe("preset");
    expect(presetId("   ")).toBe("preset");
  });

  it("does not start or end with a separator", () => {
    expect(presetId(" f/8 ")).toBe("f-8");
  });
});
