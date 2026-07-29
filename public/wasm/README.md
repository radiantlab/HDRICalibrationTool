# WebAssembly pipeline artifacts

Browser builds of the tools the HDR pipeline runs. Served as static files, so
they work identically in the Tauri webview and on a static host.

| Source | Tools |
|---|---|
| [radiantlab/Radiance](https://github.com/radiantlab/Radiance) | `evalglare` `getinfo` `pcomb` `pcompos` `pextrem` `pfilt` `psign` `ra_xyze` |
| [radiantlab/hdrgen](https://github.com/radiantlab/hdrgen) | `hdrgen` |

`falsecolor` is absent on purpose: it is a Perl script upstream, so it has no
wasm build. `src/lib/pipeline/falsecolor.ts` reimplements it by driving
`pcomb`, `pcompos`, `psign` and `pextrem`.

`dcraw_emu` is absent because it has no wasm build **yet** — see
[#237](https://github.com/radiantlab/HDRICalibrationTool/issues/237). Until it
lands, this pipeline handles JPEG and TIFF but not RAW.

## Refreshing

Both repos build these in CI and publish them as artifacts; take them from
there, or build locally:

```sh
# Radiance
emcmake cmake -S . -B build-web -DBUILD_HEADLESS=ON -DBUILD_QT=OFF \
  -DCMAKE_BUILD_TYPE=Release -DRADIANCE_WASM_NODERAWFS=OFF
cmake --build build-web --target evalglare getinfo pcomb pcompos pextrem pfilt psign ra_xyze -j8

# hdrgen
emcmake cmake -S . -B build-web -DCMAKE_BUILD_TYPE=Release -DHDRGEN_WASM_NODERAWFS=OFF
cmake --build build-web --target hdrgen -j8
```

Then copy `bin/*.js` and `bin/*.wasm` here.

Do not substitute a NODERAWFS build: it targets node, runs `main()` at
instantiation before inputs can be staged, and does not export `FS`.

## Why these are committed

They are build outputs, which usually do not belong in a repository. They are
here because the app must be able to load them offline and because the static
export has no build step that could fetch them. The repository already carries
29 MB of native binaries for the same reason; these total under 4 MB.
