import assert from "node:assert/strict";
import { test } from "node:test";
import { frameFiles, hdrgenArgv, stagedName } from "./fixtures.mjs";
import { formatTable, median, summarise } from "./report.mjs";

test("frameFiles returns the requested count, sorted", () => {
  const four = frameFiles(4);
  assert.equal(four.length, 4);
  assert.deepEqual([...four].sort(), four);
  assert.ok(four[0].endsWith(".JPG"));
});

test("frameFiles(18) is the whole bracket", () => {
  assert.equal(frameFiles(18).length, 18);
});

// Every leg has to measure the same work. A leg building its own arguments is
// how a benchmark ends up comparing two different things and reporting the
// difference as an engine result.
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

test("formatTable renders a header and one line per row", () => {
  const text = formatTable([
    { frames: 4, leg: "wasm-node", maxMs: 300, medianMs: 200, minMs: 100, note: null },
  ]);
  assert.match(text, /leg/);
  assert.match(text, /wasm-node/);
  assert.match(text, /0\.2/);
});
