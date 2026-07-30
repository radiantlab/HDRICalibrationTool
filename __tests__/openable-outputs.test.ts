import { describe, expect, it } from "@jest/globals";
import { openableOutputs } from "../src/app/runs/openable-outputs";
import type { RunRecord } from "../src/lib/run-history";

const record = (outputs: string[]) => ({ outputs }) as unknown as RunRecord;

describe("openableOutputs", () => {
  it("keeps HDR files", () => {
    expect(
      openableOutputs(record(["/out/2026-07-27.hdr", "/out/2026-07-27_fc.hdr"]))
    ).toHaveLength(2);
  });

  it("drops the output directory that older records stored", () => {
    // The pipeline command resolves to the output directory, and that is what
    // early records captured. Handing it to the viewer fails to load.
    expect(openableOutputs(record(["/Users/me/LumiLab"]))).toEqual([]);
  });
});
