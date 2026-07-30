/**
 * Ported from the `mod tests` blocks in `src-tauri/src/pipeline/cal_check.rs`
 * and `src-tauri/src/pipeline/validity.rs`, with the same fixtures.
 */

import { describe, expect, it } from "@jest/globals";
import {
  calWarning,
  evaluateValidity,
  resolutionDependentConstants,
  validityMessage,
} from "./warnings";

const VIGNETTING = `sq(x)=x*x;
r=sqrt(sq(x-500)+sq(y-500))/500;
sf=(1/(((-0.528613562104476)*(r^4))+((0.1755458928191)*(r^2))+1));
ro=sf*ri(1);
`;

const FISHEYE = `xc : xres/2;
yc : yres/2;
inp_r = sqrt(sq((x-xc)/xres) + sq((y-yc)/yres));
`;

describe("resolutionDependentConstants", () => {
  it("flags a file with hardcoded pixel constants", () => {
    expect(resolutionDependentConstants(VIGNETTING)).toEqual([500]);
  });

  it("clears a file that uses xres and yres", () => {
    expect(resolutionDependentConstants(FISHEYE)).toBeNull();
  });

  it("ignores small numbers", () => {
    // 1.18 is a scale factor, not a coordinate.
    expect(resolutionDependentConstants("ro=ri(1)*1.18;\n")).toEqual([]);
  });

  it("caps the reported constants", () => {
    let text = "";
    for (let n = 100; n < 120; n += 1) {
      text += `a${n}=xy-${n}00;`;
    }
    expect(resolutionDependentConstants(text)).toHaveLength(8);
  });

  it("deduplicates repeated constants", () => {
    // The vignetting fixture mentions 500 three times and reports it once.
    expect(resolutionDependentConstants("a=500;b=500;c=500;")).toEqual([500]);
  });

  it("rejects fragments that are not numbers", () => {
    // A bare dot and a version-like literal both fail Rust's parse::<f64>(),
    // and Number() rejects them the same way.
    expect(resolutionDependentConstants("a=.;b=1.2.3;")).toEqual([]);
  });
});

describe("calWarning", () => {
  it("names the file and the resolution", () => {
    const message = calWarning(
      "vignetting",
      "/cal/vignetting.cal",
      900,
      900,
      [500]
    );
    expect(message).toContain("vignetting.cal");
    expect(message).toContain("900x900");
    expect(message).toContain("500");
  });

  it("says so when there is nothing to list", () => {
    const message = calWarning("fisheye", "/cal/f.cal", 1000, 1000, []);
    expect(message).toContain("no pixel-scale constants were found");
  });

  it("formats whole numbers without a decimal point, as Rust does", () => {
    expect(calWarning("v", "/c.cal", 1, 1, [500, 1024])).toContain(
      "the constants 500, 1024"
    );
  });
});

describe("evaluateValidity", () => {
  it("passes under ten percent", () => {
    expect(evaluateValidity(1050, 1000)).toMatchObject({ kind: "pass" });
  });

  it("treats ten to twenty-five percent as above expected", () => {
    expect(evaluateValidity(1150, 1000)).toMatchObject({
      kind: "above_expected",
    });
  });

  it("fails over twenty-five percent", () => {
    const outcome = evaluateValidity(1260, 1000);
    expect(outcome).toMatchObject({ kind: "failed" });
    expect(outcome?.errorPct).toBeCloseTo(26, 9);
  });

  it("measures underestimates the same way", () => {
    expect(evaluateValidity(740, 1000)).toMatchObject({ kind: "failed" });
  });

  it("yields nothing for a non-positive measurement", () => {
    expect(evaluateValidity(1000, 0)).toBeNull();
    expect(evaluateValidity(1000, -5)).toBeNull();
  });

  it("yields nothing for a non-finite input", () => {
    expect(evaluateValidity(Number.NaN, 1000)).toBeNull();
    expect(evaluateValidity(1000, Number.NaN)).toBeNull();
    expect(evaluateValidity(1000, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

/** evaluateValidity returns null only for inputs these cases never use. */
function outcomeFor(evHdr: number, evMeasured: number) {
  const outcome = evaluateValidity(evHdr, evMeasured);
  if (!outcome) {
    throw new Error(`expected an outcome for ${evHdr} vs ${evMeasured}`);
  }
  return outcome;
}

describe("validityMessage", () => {
  it("spells out the numbers on a failure", () => {
    const message = validityMessage(outcomeFor(1260, 1000), 1260, 1000);
    expect(message).toContain("FAILED");
    expect(message).toContain("1260.0 lux");
    expect(message).toContain("1000.0 lux");
    expect(message).toContain("26.0% error");
  });

  it("is milder above the expected threshold", () => {
    const message = validityMessage(outcomeFor(1150, 1000), 1150, 1000);
    expect(message).not.toContain("FAILED");
    expect(message).toContain("above the 10% typically expected");
  });

  it("is a single sentence on a pass", () => {
    expect(validityMessage(outcomeFor(1050, 1000), 1050, 1000)).toBe(
      "Validity check passed (5.0% error)."
    );
  });
});
