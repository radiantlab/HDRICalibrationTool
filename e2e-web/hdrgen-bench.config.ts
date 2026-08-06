/**
 * Config for `tests/hdrgen.bench.ts`, kept apart from the suite and from
 * `perf.config.ts`.
 *
 * `perf.config.ts` runs Chromium only, and says why: it compares two *hosts*
 * and wants the engine held fixed. This benchmark asks the opposite question,
 * so it runs both engines deliberately. WebKit is not decoration here: the
 * desktop app runs WKWebView, so WebKit is what separates "browsers are slow
 * at this" from "Chromium is slow at this", and those have entirely different
 * consequences for a web-first application.
 *
 * No `webServer`. The spec serves the wasm and the frames itself through
 * request interception, so there is no port to bind, no build to wait for, and
 * nothing added to `public/` or the generated `out/`.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  reporter: [["list"]],
  // A retry would report a second, warmer run as though it were the first.
  retries: 0,
  testDir: "./tests",
  testMatch: /hdrgen\.bench\.ts/,
  // Comfortably more than the per-run ceiling times every cell, so the spec's
  // own budget never truncates a measurement.
  timeout: 3_000_000,
  use: { trace: "off", video: "off" },
  workers: 1,
});
