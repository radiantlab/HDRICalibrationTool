# Playwright E2E tests (web build)

Drives the **browser** build: the static export in `../out`, served over HTTP,
with no Radiance, no hdrgen and nothing installed.

The desktop build is a separate suite, `../e2e-tests`, driven by WebdriverIO.
That split is forced rather than chosen: Playwright cannot attach to a Tauri
window, because WKWebView and WebKitGTK expose no CDP endpoint. Between them
the two suites cover paths that genuinely differ, not the same path twice:

| | Desktop (`../e2e-tests`) | Web (here) |
|---|---|---|
| Input | dropped filesystem paths | `<input type=file>` via the file dialog |
| Output | written to a chosen folder | downloads |
| Storage | IndexedDB, migrated from disk | IndexedDB |
| Shell | Tauri window | a tab |

## Run

From the repository root, which builds the export first:

```sh
npm run test:e2e:web
```

Or, if `../out` is already built:

```sh
npm --prefix e2e-web test
```

The first run needs browsers:

```sh
npm --prefix e2e-web exec playwright install --with-deps
```

## Browsers

**WebKit is listed first, deliberately.** Safari implements no part of the File
System Access API, so it takes the plain file-input and download path, which is
what this application actually ships to everyone. A suite that only proved
Chromium worked would not have tested the code most users run.

Chromium runs too. Firefox is not in the matrix: it shares WebKit's lack of
File System Access, so it exercises the same branch for roughly a doubling of
wall clock.

## Fixtures

Read from `../e2e-tests/test/inputs/` rather than copied, so both suites run
the same bracket and cannot drift on to different inputs while both stay green.
