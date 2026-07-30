/**
 * Guards the generated `.cal` templates against drift.
 *
 * The fixtures were produced by interpolating falsecolor.pl's own heredocs in
 * Perl, with the same variables in scope, so this compares the TypeScript
 * extraction against what Radiance actually writes rather than against
 * something I typed. It exists because `pc0.cal` carries the `tbo` palette as
 * three 256-entry tables: a single wrong digit there would shift colours in a
 * way no other test could see.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { pc0Cal, pc1Cal } from "./falsecolor-cal";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "__fixtures__", name), "utf8");

describe("pc0.cal", () => {
  it("matches what falsecolor.pl writes for the default palette", () => {
    const generated = pc0Cal({
      bluv: "def_blu(v)",
      grnv: "def_grn(v)",
      mult: "179",
      ndivs: 8,
      redv: "def_red(v)",
      scale: "1000",
    });
    expect(generated).toBe(fixture("falsecolor-pc0.cal"));
  });

  it("interpolates the scale rather than hardcoding it", () => {
    const generated = pc0Cal({
      bluv: "def_blu(v)",
      grnv: "def_grn(v)",
      mult: "179",
      ndivs: 8,
      redv: "def_red(v)",
      scale: "5000",
    });
    expect(generated).toContain("scale : 5000 ;");
  });

  it("keeps every palette, not just the default", () => {
    const generated = pc0Cal({
      bluv: "def_blu(v)",
      grnv: "def_grn(v)",
      mult: "179",
      ndivs: 8,
      redv: "def_red(v)",
      scale: "1000",
    });
    for (const palette of ["spec", "pm3d", "hot", "eco", "def", "tbo"]) {
      expect(generated).toContain(`${palette}_red`);
    }
  });
});

describe("pc1.cal", () => {
  it("matches what falsecolor.pl writes", () => {
    expect(pc1Cal()).toBe(fixture("falsecolor-pc1.cal"));
  });
});
