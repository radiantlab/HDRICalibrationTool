# Licensing decisions

Why this application is licensed the way it is, and which obligations follow
from the third-party code it incorporates.

Written so it can be read on its own, without reading the code, by anyone who
needs to sign off on a public release.

**Last reviewed:** 2026-07-29, when the WebAssembly port
([#227](https://github.com/radiantlab/HDRICalibrationTool/issues/227)) changed
LibRaw from a separately-invoked binary into statically linked code.

## The application

**HDRI Calibration Tool is licensed GPL-3.0.** See [`../LICENSE`](../LICENSE).
That predates any of the decisions below and is the fixed point they are
resolved against.

## What is incorporated

| Component | Upstream | Licence | Compatible with GPL-3 |
|---|---|---|---|
| Radiance tools | [LBNL-ETA/Radiance](https://github.com/LBNL-ETA/Radiance), forked to [radiantlab/Radiance](https://github.com/radiantlab/Radiance) | Radiance Software License 2.0, which is BSD-3-Clause in substance | Yes, permissive |
| hdrgen | [radiantlab/hdrgen](https://github.com/radiantlab/hdrgen) | BSD-3-Clause (Gregory J. Ward) | Yes, permissive |
| panlib | [radiantlab/panlib](https://github.com/radiantlab/panlib) | BSD-3-Clause (Gregory J. Ward) | Yes, permissive |
| LibRaw (`dcraw_emu`) | [LibRaw/LibRaw](https://github.com/LibRaw/LibRaw), forked to [radiantlab/LibRaw](https://github.com/radiantlab/LibRaw) | **LGPL-2.1 or CDDL-1.0**, at the recipient's option | See below |

Only LibRaw needs a decision. The three permissive licences impose attribution
and notice retention and nothing else, and all three are satisfied by shipping
their notices, which [`BSD-3-Clause.txt`](BSD-3-Clause.txt) does.

Note the Radiance Software License is at **version 2.0**, which is a plain
BSD-3-Clause. Earlier Radiance licences carried an Apache-1.1-style
acknowledgement clause that the FSF considers GPL-incompatible. That is not the
licence in the tree, and it is worth knowing so the question is not reopened.

## Decision 1: LibRaw is taken under the LGPL, not the CDDL

LibRaw offers a choice of two licences (`COPYRIGHT` in the LibRaw tree):
LGPL-2.1, or CDDL-1.0.

**We take the LGPL-2.1 option.** The CDDL is a fine licence and in some ways an
easier one for static linking, since it is file-scoped and has no relinking
provision. It is nonetheless unusable here: **the CDDL is incompatible with the
GNU GPL**, so CDDL-licensed code cannot be combined into a GPL-3 work at all.
Because this application is GPL-3, the choice makes itself.

Recorded because it is the question a reviewer is most likely to ask, and the
intuition ("static linking, so take the file-scoped licence") points the wrong
way here.

## Decision 2: the WebAssembly bundle is GPL-3, via LGPL-2.1 section 3

Until the WebAssembly port, LibRaw was a **separate executable** that the
application launched as a subprocess, and on Windows it was a separate DLL. The
port statically links LibRaw into `dcraw_emu.wasm` and ships that as part of
the application. That is a genuine change in the nature of the combination and
is the reason this document exists.

The mechanism that resolves it is **LGPL-2.1 section 3**, which permits applying
ordinary GPL terms to a given copy of the library, at "version 2 ... or any
later version". GPL-3 has since appeared, so LibRaw can be brought under GPL-3
for the purpose of this combination. The distributed bundle is then a GPL-3 work
throughout, with no mixed-licence question left open.

Two consequences worth stating plainly:

**The relinking obligation is already satisfied, and would have been either
way.** LGPL-2.1 section 6(a) asks that a work statically linked against the
library be accompanied by the library's complete source plus the linking work
"as object code and/or source code, so that the user can modify the Library and
then relink". The entire application is public GPL-3 source, LibRaw's source is
public at `radiantlab/LibRaw`, and both build through public CI. Anyone can
modify LibRaw and rebuild. This was flagged during planning as the main new
burden of static linking; on inspection it is not a burden at all, because the
application was already fully open source.

**Nothing in the fork is relicensed.** Section 3 alters the notices in *the
copy* that is incorporated, and the copy that matters is the one inside the
distributed bundle. `radiantlab/LibRaw` keeps upstream's dual LGPL-2.1/CDDL-1.0
terms unchanged, so it stays useful to anyone else, and the new `CMakeLists.txt`
added there is offered under those same dual terms.

## Decision 3: components deliberately left out

These are all available in or alongside LibRaw and are switched **off**. Some
are off because nothing needs them; the ones below are off partly or wholly for
licensing reasons, and turning any of them on would reopen this analysis.

| Excluded | Licence | Note |
|---|---|---|
| LibRaw demosaic packs | GPL-2 and GPL-3 | Abandoned upstream and not in the tree. The AHD demosaic the pipeline uses (`-q 3`) is core LibRaw, not a pack. |
| Adobe DNG SDK | Adobe's own terms | Not needed for CR2. |
| RawSpeed | LGPL-2.1, plus its own dependencies | Not needed for CR2. |
| GoPro / GPR SDK | Apache-2.0 | Not needed for CR2. |

Core LibRaw's own third-party pieces are all GPL-compatible and are included:
DCB and FBDD demosaic (BSD-3-Clause, Jacek Gozdz), the X3F reader (BSD-style,
Roland Karlsson), fragments of the Adobe DNG SDK (MIT), and code derived from
Dave Coffin's `dcraw.c`. LibRaw states it does not use the restricted portions
of `dcraw.c`.

## Obligations for the browser build

Serving `.wasm` and `.js` from a web host **is** conveying object code under
GPL-3, so the source obligation applies to a Vercel or Cloudflare deployment
exactly as it does to a desktop release. It is satisfied under **GPL-3 section
6(d)**, which allows offering Corresponding Source from a designated place at no
charge, on a different server from the object code, provided clear directions
are given.

Concretely, before the web build ships:

- [ ] A link to the source, reachable from the application's own UI, not only
      from the repository. GPL-3 6(d) requires "clear directions next to the
      object code".
- [ ] That link must reach the **Corresponding Source**, which includes the
      forks and their build scripts, not only this repository.
- [ ] Notices for all four components carried in the shipped artefact, as they
      are today in [`../README.md`](../README.md).

Nothing here blocks the desktop build, which already satisfies all of it.

## What is not in question

- **Radiance, hdrgen and panlib** impose no copyleft. Their forks can stay
  permissively licensed and be useful to others, which is why the Emscripten
  build changes were made in forks rather than carried as local patches.
- **npm and Cargo dependencies** are conventional permissive licences (MIT,
  Apache-2.0, ISC, BSD). They are recorded in `package-lock.json` and
  `Cargo.lock` and are not enumerated here.
