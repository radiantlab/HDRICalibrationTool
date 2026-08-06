import assert from "node:assert/strict";
import { test } from "node:test";
import { frameFiles, hdrgenArgv, stagedName } from "./fixtures.mjs";
import { formatTable, median, summarise } from "./report.mjs";

const LEG_HEADING = /leg/;
const LEG_NAME = /wasm-node/;
const MEDIAN_SECONDS = /0\.2/;

test("frameFiles returns the requested count, in order", () => {
  const four = frameFiles(4);
  assert.equal(four.length, 4);
  assert.deepEqual([...four].sort(), four);
  assert.ok(four[0].endsWith(".JPG"));
});

test("frameFiles(18) is the whole bracket", () => {
  assert.equal(frameFiles(18).length, 18);
});

// The reason this is not a prefix. A bracket is an exposure sequence, so the
// first four frames are four long exposures that differ barely at all -- the
// pipeline's own filter kept one of them. Sampling across the sequence is what
// makes a four-frame measurement a measurement of four frames' work.
test("frameFiles spreads across the bracket rather than taking a prefix", () => {
  const all = frameFiles(18);
  const four = frameFiles(4);

  assert.equal(four[0], all[0], "the first frame anchors the range");
  assert.equal(four[3], all[17], "the last frame anchors the other end");
  assert.notDeepEqual(four, all.slice(0, 4));

  // Evenly spaced, to within the rounding a non-integer stride forces.
  const positions = four.map((file) => all.indexOf(file));
  const gaps = positions.slice(1).map((at, index) => at - positions[index]);
  assert.ok(
    Math.max(...gaps) - Math.min(...gaps) <= 1,
    `expected even spacing, got positions ${positions.join(",")}`
  );
});

test("frameFiles never repeats a frame", () => {
  for (const count of [4, 8, 12, 18]) {
    const frames = frameFiles(count);
    assert.equal(
      new Set(frames).size,
      count,
      `${count} frames should be distinct`
    );
  }
});

test("hdrgenArgv matches the shape the app builds", () => {
  const argv = hdrgenArgv({
    frames: ["/src/1-a.JPG", "/src/2-b.JPG"],
    out: "/work/out.hdr",
    response: "/src/resp.rsp",
  });
  assert.deepEqual(argv, [
    "-m",
    "1000",
    "/src/1-a.JPG",
    "/src/2-b.JPG",
    "-o",
    "/work/out.hdr",
    "-r",
    "/src/resp.rsp",
    "-a",
    "-e",
    "-f",
    "-g",
    "-F",
  ]);
});

test("stagedName keeps the basename and prefixes the position", () => {
  assert.equal(stagedName("/a/b/IMG_6955.JPG", 0), "1-IMG_6955.JPG");
});

test("median takes the middle of an odd set and the mean of an even one", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

// A timeout is data. Summarising it as a missing number, or worse as a zero,
// would report the one case this benchmark exists to measure as the fastest.
test("summarise reports timeouts instead of averaging them away", () => {
  const rows = summarise([
    { frames: 18, leg: "wasm-chromium", runMs: null, status: "timeout" },
    { frames: 18, leg: "wasm-chromium", runMs: null, status: "timeout" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].medianMs, null);
  assert.equal(rows[0].note, "2/2 timed out");
});

test("summarise groups by leg and frame count", () => {
  const rows = summarise([
    { frames: 4, leg: "wasm-node", runMs: 100, status: "ok" },
    { frames: 4, leg: "wasm-node", runMs: 300, status: "ok" },
    { frames: 4, leg: "wasm-node", runMs: 200, status: "ok" },
    { frames: 8, leg: "wasm-node", runMs: 500, status: "ok" },
  ]);
  assert.equal(rows.length, 2);
  const four = rows.find((row) => row.frames === 4);
  assert.equal(four.medianMs, 200);
  assert.equal(four.minMs, 100);
  assert.equal(four.maxMs, 300);
});

// A partly-timed-out cell is the interesting case: reporting only the runs that
// finished would make a leg that usually fails look fast.
test("summarise notes partial timeouts alongside the median", () => {
  const rows = summarise([
    { frames: 18, leg: "wasm-webkit", runMs: 1000, status: "ok" },
    { frames: 18, leg: "wasm-webkit", runMs: null, status: "timeout" },
  ]);
  assert.equal(rows[0].medianMs, 1000);
  assert.equal(rows[0].note, "1/2 timed out");
});

// A crash and a hang are different findings. Reporting a leg that aborted as
// one that "timed out" would send the next person looking for a slow engine
// when what they have is a broken one.
test("summarise tells an error apart from a timeout", () => {
  const rows = summarise([
    { frames: 8, leg: "wasm-webkit", runMs: 900, status: "ok" },
    { frames: 8, leg: "wasm-webkit", runMs: null, status: "error" },
  ]);
  assert.equal(rows[0].medianMs, 900);
  assert.equal(rows[0].note, "1/2 errored");
});

test("summarise counts both when a cell has each", () => {
  const rows = summarise([
    { frames: 18, leg: "wasm-chromium", runMs: null, status: "timeout" },
    { frames: 18, leg: "wasm-chromium", runMs: null, status: "error" },
  ]);
  assert.equal(rows[0].medianMs, null);
  assert.equal(rows[0].note, "1/2 timed out, 1/2 errored");
});

test("formatTable renders a header and one line per row", () => {
  const text = formatTable([
    {
      frames: 4,
      leg: "wasm-node",
      maxMs: 300,
      medianMs: 200,
      minMs: 100,
      note: null,
    },
  ]);
  assert.match(text, LEG_HEADING);
  assert.match(text, LEG_NAME);
  assert.match(text, MEDIAN_SECONDS);
});

// The browser leg cannot import this module, so it carries its own copy of the
// spread when run by hand. Pinning the selection here means that at least one
// of the two cannot drift unnoticed, and the orchestrator passes this exact
// list to the browser leg so a real run never uses the copy at all.
test("frameFiles picks a known, evenly spread selection", () => {
  const all = frameFiles(18).map((file) => file.split("/").pop());
  const positions = (count) =>
    frameFiles(count).map((file) => all.indexOf(file.split("/").pop()));

  assert.deepEqual(positions(4), [0, 6, 11, 17]);
  assert.deepEqual(positions(8), [0, 2, 5, 7, 10, 12, 15, 17]);
  assert.deepEqual(positions(12), [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17]);
  assert.deepEqual(positions(18), [...new Array(18).keys()]);
});
