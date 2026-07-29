# Installing Radiance + hdrgen in CI — Investigation Notes

**Status:** investigation complete, implementation paused pending a decision on hdrgen. Not committed — working notes only.

**Context:** the `e2e-tests` CI job's third test case ("generates an HDR image") can't pass without real Radiance and hdrgen binaries. Historically the test pointed at a hardcoded, Windows-only `AppData/Local/HDRICalibrationTool/tools/...` path that assumed the (unmerged) vendored-binaries work in PR #207. This doc captures what was found when looking for an alternative: installing the tools fresh in CI from their official sources, rather than vendoring binaries into the repo.

## tl;dr

- **Radiance**: works. Official GitHub releases (`LBNL-ETA/Radiance`) ship ready-to-extract per-platform zips. Verified for real under emulated `linux/amd64` Ubuntu 22.04 — `getinfo`, `evalglare`, `falsecolor`, `ra_xyze` all execute correctly.
- **hdrgen**: broken. The official GitHub releases (`radiance-org/hdrgen`, BSD-3-Clause, confirmed real and active) ship binaries missing their OpenEXR shared library dependency, on both macOS and Linux (Windows untested but suspected to share the bug). This is a genuine upstream packaging bug, not something fixable from our CI script alone.
- Neither tool has an official Homebrew or Chocolatey package. A 2021 experimental Radiance Homebrew tap exists but is unmaintained/alpha.
- Recommendation: build hdrgen from source in CI using its own `CMakeLists.txt` (its build process compiles OpenEXR itself via submodule/`FetchContent`, so a from-source build should be self-contained), rather than depending on its currently-broken release zips.

## Sources found

### Radiance — `LBNL-ETA/Radiance`
- https://github.com/LBNL-ETA/Radiance
- Official mirror of the Radiance CVS source tree from radiance-online.org, auto-updated on every commit to master.
- Every commit produces a tagged release (tag = short commit hash) with per-platform installers and archives:
  - `Radiance_<hash>_Linux.zip` — a zip wrapping a `.tar.gz`, which unpacks to `usr/local/radiance/{bin,lib,man}` (175 executables in `bin/`).
  - `Radiance_<hash>_OSX.zip` / `_OSX_arm64.zip` — flat `radiance/{bin,lib,man}` at the zip root (no nested archive).
  - `Radiance_<hash>_Windows.zip` — flat `bin/*.exe` at the zip root (no nested archive).
  - `.pkg` / `.exe` installer variants also exist but are interactive-install-only, not useful for CI.
- Releases are all marked `prerelease` — that's just their publishing convention (one per commit), not a stability signal. There's no stable semver tag, so any CI usage should pin to a specific tag deliberately and bump it as a conscious decision, not track "latest".
- Tag used in local testing: `39b99660` ("Radiance 6.1a", 2026-05-05).

**Verification performed:** downloaded and extracted the Linux and Windows zips locally; downloaded, extracted, and actually *ran* the Linux binaries inside a real `--platform linux/amd64 ubuntu:22.04` Docker container (matching GitHub-hosted `ubuntu-22.04` runners' actual architecture — this machine is Apple Silicon, so native execution would have been a false negative). Results:
- `getinfo`, `evalglare`, `ra_xyze` — all launch and run correctly (their no-args output is normal usage-error text, not a crash).
- `falsecolor` — launches, but errors `psign: not found`. `psign` is a companion Radiance tool that `falsecolor` shells out to for legend text; it exists in the same `bin/` directory but isn't found because that directory isn't on `PATH` when `falsecolor` looks for it. Likely fixable by adding the Radiance `bin/` directory to `PATH` (not just passing its path as a config value) before invoking `falsecolor`. Not yet fixed or fully diagnosed — flagging for whoever wires this in for real.

### hdrgen — `radiance-org/hdrgen`
- https://github.com/radiance-org/hdrgen
- Confirmed real and active (not archived), BSD 3-Clause licensed, builds via CMake (`CMakeLists.txt` + `.gitmodules` at the repo root, i.e. it vendors its own dependencies including OpenEXR).
- Release workflow (`.github/workflows/release.yml`) builds on `ubuntu-latest`, `windows-latest`, `macos-latest` via CMake, then copies only the executables into the release zip:
  - Unix: `hdrgen hdrcvt expose2range PQconvert bitmapop warpimage`
  - Windows: the same as `.exe`
  - macOS additionally builds a `.pkg` installer.
- Latest tagged release: `v1.0.1` (also `v1.0.0` exists). Both marked prerelease, same convention as Radiance.

**Verification performed and the bug found:**
- Ran the real pipeline locally (macOS, real display, real WebKit via `@wdio/tauri-service`'s embedded driver) with `E2E_RADIANCE_PATH`/`E2E_HDRGEN_PATH` pointed at the extracted `v1.0.1` macOS release. Pipeline failed immediately on the `hdrgen` merge-exposures step:
  ```
  dyld[...]: Library not loaded: @rpath/libOpenEXR-3_4.99.dylib
  Referenced from: hdrgen
  Reason: tried: '/Users/runner/work/hdrgen/hdrgen/build/external/panlib/external/openexr/src/lib/OpenEXR/libOpenEXR-3_4.99.dylib' (no such file), [...many more build-machine-absolute paths...]
  ```
  The binary's `@rpath` entries are literal absolute paths from the CI build machine that produced the release (`/Users/runner/work/hdrgen/hdrgen/build/...`). These obviously don't exist on any other machine, including GitHub's own CI runners.
- Repeated the same test for the Linux binary under real `--platform linux/amd64 ubuntu:22.04` Docker emulation:
  ```
  hdrgen: error while loading shared libraries: libOpenEXR-3_4.so.99: cannot open shared object file: No such file or directory
  ```
  Same root cause, different platform: the shared library itself is simply absent from the release zip (it's not an rpath issue this time, `ldd`-visible dependency is just missing entirely).
- Checked whether Ubuntu 22.04's own package repos could fill the gap: `apt-cache policy libopenexr25` only offers **2.5.7-1**. hdrgen needs the `3_4` SONAME (OpenEXR 3.4.x) — an incompatible major version. No apt package can substitute.
- Windows zip inspected (not executed — no Windows/Wine environment available here): contains only the six `.exe` files, no accompanying DLLs, same pattern as macOS (no `.dylib`) and Linsux (no `.so`) in their release zips. Given all three platforms share the identical CMake build + "copy just the executables" packaging script, the Windows binary is suspected to have the same missing-dependency problem, but this is **unverified**, not confirmed.

**Conclusion:** this is a real bug in `radiance-org/hdrgen`'s release packaging — their CI build correctly compiles a self-built OpenEXR (visible from the referenced build paths and the `_deps`/`external/panlib` directory names), but the "prepare artifacts" step in their release workflow only copies the six tool executables, never the shared library those executables link against at runtime. It affects the officially published `v1.0.1` (and likely `v1.0.0`) release assets, not just our download process.

### Package managers
- **Homebrew**: no official formula for either tool. A 2021 experimental Radiance tap (`rfritz/radiance`) exists in a personal GitHub account, marked alpha, not updated since — not something to depend on.
- **Chocolatey**: no package for either tool. Search only surfaced "Luminance HDR" (an unrelated third-party HDR *image editor*, not Radiance/hdrgen).

## Options going forward for hdrgen

1. **Build hdrgen from source in CI**, using its own `CMakeLists.txt`. Since its build process already compiles OpenEXR itself (via a git submodule / CMake `FetchContent`), a from-source build should produce a fully self-contained, correctly-linked binary with no missing-library risk. Cost: extra CI time for the build (untested how long — likely a few minutes based on the dependency tree seen in the crash's build paths: Imath, OpenEXR, OpenJPH, etc.).
2. **Vendor just the missing shared library** ourselves alongside the downloaded prebuilt `hdrgen` executable, setting `LD_LIBRARY_PATH` (Linux) / `DYLD_LIBRARY_PATH` (macOS) to point at it. Fragile: the exact OpenEXR 3.4.x build isn't published anywhere as a standalone artifact either, so we'd likely need to build *that* from source anyway, which mostly erases the benefit over option 1.
3. **File an issue with `radiance-org/hdrgen`** about the missing library in their release artifacts and wait for an upstream fix. Cleanest long-term outcome, but outside our timeline/control, and doesn't unblock CI now.
4. **Vendor prebuilt hdrgen binaries directly in this repo** (the approach PR #207 took). Explicitly not something to pursue right now per direction received — noted here only because this bug is exactly the kind of thing that makes vendoring tempting; recorded for completeness, not as a live recommendation.

**Recommendation:** option 1 (build from source in CI). It's the most reliable path given the current releases can't be trusted, and hdrgen's own build system exists specifically to produce a working binary — we're just not able to lean on their *release* process to have done that packaging step correctly.

Radiance does not need any of this — its official release zips work as-is and should be installed via direct download exactly as originally planned.
