#!/usr/bin/env python3
"""Extract falsecolor.pl's two .cal heredocs into a TypeScript module.

Generated rather than retyped: pc0.cal carries the `tbo` palette as three
256-entry tables, and a transcription slip there would produce subtly wrong
colours that no test would catch.
"""
import pathlib
import re

SRC = pathlib.Path("/Users/ulbrical/GitHub/Radiance/src/px/falsecolor.pl")
OUT = pathlib.Path(
    "/Users/ulbrical/GitHub/HDRICalibrationTool/src/lib/pipeline/falsecolor-cal.ts"
)

src = SRC.read_text()


def heredoc(tag):
    m = re.search(
        r"print FH%s <<EndOf%s;\n(.*?)\nEndOf%s\n" % (tag, tag.upper(), tag.upper()),
        src,
        re.S,
    )
    if not m:
        raise SystemExit("could not find heredoc " + tag)
    return m.group(1)


pc0 = heredoc("pc0")
pc1 = heredoc("pc1")

print("pc0 chars:", len(pc0), "pc1 chars:", len(pc1))
print("pc0 vars:", sorted(set(re.findall(r"\$\w+", pc0))))
print("pc1 vars:", sorted(set(re.findall(r"\$\w+", pc1))))

SENTINEL = "\x00SLOT\x00"


def to_template(text, slots):
    # protect the interpolations, escape everything else, then restore them
    for perl, ts in slots:
        text = text.replace(perl, SENTINEL + ts + SENTINEL)
    text = text.replace("\\", "\\\\")
    text = text.replace("`", "\\`")
    text = text.replace("$", "\\$")
    parts = text.split(SENTINEL)
    return "".join(p if i % 2 == 0 else p.replace("\\$", "$") for i, p in enumerate(parts))


pc0_slots = [
    ("$scale", "${scale}"),
    ("$mult", "${mult}"),
    ("$ndivs", "${ndivs}"),
    ("$redv", "${redv}"),
    ("$grnv", "${grnv}"),
    ("$bluv", "${bluv}"),
]

header = '''/**
 * The two `.cal` files falsecolor writes to its temp directory.
 *
 * Extracted verbatim from the heredocs in `src/px/falsecolor.pl` (Radiance
 * 6.0) rather than retyped: `pc0.cal` carries the full `tbo` palette as three
 * 256-entry tables, and a transcription slip there would produce subtly wrong
 * colours that no test would notice.
 *
 * Regenerate with `scratchpad/gen-cal.py` if falsecolor.pl changes upstream.
 * Do not hand-edit.
 */

/** Colour mapping definitions. Every palette is kept, not just `def`. */
export function pc0Cal(options: {
  scale: string;
  mult: string;
  ndivs: number;
  redv: string;
  grnv: string;
  bluv: string;
}): string {
  const { scale, mult, ndivs, redv, grnv, bluv } = options;
  return `%s
`;
}

/** Per-pixel value mapping, applied to the source picture. */
export function pc1Cal(): string {
  return `%s
`;
}
'''

OUT.write_text(header % (to_template(pc0, pc0_slots), to_template(pc1, [])))
print("written:", OUT, OUT.stat().st_size, "bytes")
