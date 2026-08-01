/**
 * Config for `tests/perf.bench.ts`, kept separate from `playwright.config.ts`.
 *
 * Separate for three reasons. The benchmark reports numbers rather than
 * asserting behaviour, so it must never run as part of the suite. It needs a
 * `webServer` only when the target is local -- pointing one at a deployed URL
 * would start a server nothing talks to. And it runs Chromium only: the suite
 * leads with WebKit because that is the code most users run, but a benchmark
 * comparing two *hosts* wants one engine held fixed, and mixing them would
 * confound a ~1.5x engine difference into the hosting comparison.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const TARGET = process.env.TARGET_URL ?? `http://127.0.0.1:${PORT}`;
const isLocal = TARGET.includes("127.0.0.1") || TARGET.includes("localhost");

export default defineConfig({
  expect: { timeout: 30_000 },
  fullyParallel: false,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: [["list"]],
  // A retry would silently benchmark a warm HTTP cache and report it as a cold
  // run, which is the one number this file exists to get right.
  retries: 0,
  testDir: "./tests",
  testMatch: /perf\.bench\.ts/,
  timeout: 600_000,
  use: { trace: "off", video: "off" },
  ...(isLocal
    ? {
        webServer: {
          // `next start` cannot serve this build -- `output: "export"` means
          // there is no server to start. See `playwright.config.ts`.
          command: `npx serve ../out -l ${PORT}`,
          reuseExistingServer: true,
          timeout: 60_000,
          url: `http://127.0.0.1:${PORT}/home-page`,
        },
      }
    : {}),
  workers: 1,
});
