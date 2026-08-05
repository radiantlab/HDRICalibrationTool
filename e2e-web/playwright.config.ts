/**
 * Playwright drives the *web* build. The desktop build is driven by
 * WebdriverIO in `../e2e-tests`, and the split is not a preference: Playwright
 * cannot attach to a Tauri window, because WKWebView and WebKitGTK expose no
 * CDP endpoint for it to speak to. Two harnesses is the honest cost of
 * shipping two hosts.
 *
 * What this suite is for is the half the desktop suite structurally cannot
 * reach. In a browser, files arrive through `<input type=file>` rather than a
 * path, outputs leave as downloads rather than as writes to a chosen folder,
 * and the pipeline has no filesystem behind it at all. None of those paths
 * exist on the desktop, so none of them were covered until now.
 */

import { defineConfig, devices } from "@playwright/test";

/** Fixed rather than ephemeral, so `baseURL` and the server cannot disagree. */
const PORT = 4321;

export default defineConfig({
  expect: {
    // The pipeline is WebAssembly, single-threaded on purpose, and a JPEG
    // bracket is tens of seconds of real work. A default 5s assertion timeout
    // would fail on a run that is progressing perfectly well.
    timeout: 15_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  projects: [
    // WebKit first, deliberately. Safari has no File System Access API at all,
    // so it takes the `<input type=file>` and download path -- which is to say
    // the path this application actually ships. A suite that only proves
    // Chromium works has not tested the code most users run.
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // One worker. Every spec drives a full WebAssembly pipeline that peaks in
  // the hundreds of megabytes, and running two at once on a 2-core CI runner
  // trades wall clock for out-of-memory flakes.
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests",
  // Generous: a cold WebAssembly compile plus a six-stage pipeline. The point
  // of a timeout here is to catch a hang, not to police performance.
  timeout: 300_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: {
    // `next start` cannot serve this build: `next.config.js` sets
    // `output: "export"`, so there is no server to start. `serve` maps
    // `/pipeline` to `pipeline.html`, which Python's `http.server` notably
    // does not -- see DEPLOYMENT.md.
    command: `npx serve ../out -l ${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: `http://127.0.0.1:${PORT}/pipeline`,
  },
  workers: 1,
});
