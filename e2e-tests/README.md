# WebdriverIO E2E Tests

This directory follows Tauri's WebdriverIO example to provide a minimal end-to-end
test harness for the desktop app.

## Prerequisites

No external WebDriver install is required. Tests run via `@wdio/tauri-service`'s
embedded WebDriver provider, which launches and drives the app directly.

- `wdio.conf.js`'s `onPrepare` hook automatically builds the debug desktop
  binary with the `e2e-driver` Cargo feature enabled (compiling in the
  embedded WebDriver plugin) before the test session starts.
- macOS, Windows, and Linux are all supported, since the embedded provider
  doesn't depend on a platform-specific `tauri-driver` process.

## Run

From the repository root:

```bash
npm --prefix e2e-tests test
```
