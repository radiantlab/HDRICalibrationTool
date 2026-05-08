# WebdriverIO E2E Tests

This directory follows Tauri's WebdriverIO example to provide a minimal end-to-end
test harness for the desktop app.

## Prerequisites

- Install `tauri-driver` globally:

```bash
cargo install tauri-driver --locked
```

- Tauri's official WebDriver support currently works on desktop only for Windows
  and Linux. macOS desktop WebDriver sessions are not officially supported.

## Run

From the repository root:

```bash
npm --prefix e2e-tests test
```
