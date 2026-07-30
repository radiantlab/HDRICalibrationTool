# Deploying the web build

The app is a static export. There is no server, no build step at request time,
and no API: every image stays in the browser that opened it.

## Vercel

Vercel detects Next.js and needs no configuration. Import the repository and
deploy; `next.config.js` already sets `output: "export"`.

Two things worth knowing rather than discovering:

**No COOP/COEP headers are required.** Every WebAssembly tool in
`public/wasm/` is built single-threaded on purpose, so nothing here uses
`SharedArrayBuffer` and no cross-origin isolation is needed. This was verified
rather than assumed: a page served with no such headers does not even define
`SharedArrayBuffer`, and a full CR2 conversion ran there anyway. Any static
host works.

**`public/wasm/` must be served as `application/wasm`.** Vercel does this by
default. A host that serves `.wasm` as `application/octet-stream` will fail
with a streaming-compilation error.

## Anywhere else

```sh
npm ci
npm run build     # writes ./out
```

Serve `out/` as static files. The only requirements are the `.wasm` MIME type
above and clean-URL handling, which almost every static host does.

For a quick local check, note that Python's `http.server` does **not** map
`/home-page` to `home-page.html`, so use the `.html` paths or a server that
does:

```sh
npx serve out
```

## What to verify after a deploy

1. **The root loads.** `/` should land on the generator. If it 404s, the
   export is missing `index.html`.
2. **The tool versions appear** on the Settings page. If they do not,
   `public/wasm/versions.json` did not ship.
3. **A run completes.** Drop the JPEG bracket in, fill the lens mask, generate.
   Two files should download.

## Licensing, before a public deploy

Serving `.wasm` is conveying object code under GPL-3, so the Corresponding
Source has to be offered from the application itself, not only from the
repository. The Settings page carries that link. Do not remove it. The full
reasoning is in [`licenses/DECISIONS.md`](./licenses/DECISIONS.md).

## Known limits of the web build

- **Outputs are downloaded**, and the browser decides where. There is no
  output-directory setting, and "open folder" is hidden, because a browser has
  no file manager to open and no path to open it at.
- **Files chosen in a previous session cannot be reopened.** A browser gives
  no durable handle to a picked file, so the app registers what it was handed
  and that ends with the tab. Presets are unaffected: they store their
  calibration files, so they survive.
- **Mobile is untested at scale.** A 10-frame CR2 bracket peaks near 700 MB of
  JS heap, comfortable on desktop Chromium (a ~4.2 GB limit) and unmeasured on
  a phone. JPEG sets are far smaller.

- **Downloads are spaced 300ms apart on purpose.** WebKit drops a download
  outright if another starts in the same task, and it keeps the *later* one, so
  a run that saved the picture and then the false-colour map delivered only the
  false-colour map while reporting success for both. Measured directly: at a
  0ms gap WebKit raised one download event of two, at 250ms it raised both, and
  Chromium raised both either way. `src/lib/host/save.ts` queues them; do not
  remove the spacing.

## Safari

Safari is a first-class target and the browser suite runs WebKit first, because
Safari implements no part of the File System Access API and therefore takes the
plain file-input and download path — which is what this application ships to
everyone.

The full pipeline is verified end to end in WebKit: the reference JPEG bracket
completes in about 40 seconds and produces both outputs.

One thing to expect rather than discover: Safari asks "Do you want to allow
downloads on this website?" the first time a run finishes. Both files arrive
once that is allowed.
