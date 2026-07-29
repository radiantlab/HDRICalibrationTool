<img src="public/splash.png" alt="HDRI Calibration Interface" />

[![License](https://img.shields.io/badge/license-GPLv3-blue)](./LICENSE)
[![website](https://img.shields.io/badge/website-Radiant%20Lab-green.svg)](https://www.clotildepierson.com/software)
[![Tauri](https://img.shields.io/badge/Tauri-v2.5.1-%2324C8D8?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-v1.82.0-%23000000?logo=rust)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-v15.3.5-%23000000?logo=nextdotjs)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v3.3.0-%2306B6D4?logo=tailwindcss)](https://tailwindcss.com/)

This application provides a graphical user interface for the creation and calibration of High Dynamic Range (HDR) images using Radiance, `hdrgen`, and `dcraw_emu` according to the pipeline process published [here](https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319). The program works by taking in multiple LDR image files as well as some calibration information related to the camera/lens used, in order to return calibrated HDR images, also called luminance maps. The application is intended for lighting and daylighting professionals or researchers who are interested in studying the indoor visual environment and especially discomfort glare.

## Supported Platforms

- Windows
- macOS (Intel and Apple Silicon)
- Ubuntu

## Getting Started

Install [Radiance](https://www.radiance-online.org/) and [hdrgen](http://www.anyhere.com/) to your local machine and note where these tools are located (the folder path). After these dependencies have been installed, install the [HDRI Calibration Interface](https://github.com/radiantlab/HDRICalibrationTool/releases/latest) for your operating system. The binary for dcraw_emu is already included with the application (see Acknowledgements & Licensing below).

Note that the binaries are unsigned and might be flagged as untrusted by your operating system. On macOS, you need to right click on the application and select Open to have the option to run it.

The **HDR image viewer** is built into the application and runs on every supported platform with no additional software. Earlier versions opened images through Radiance's X11-based `ximage`, which is why XQuartz used to be required on macOS and why the viewer was unavailable on Windows; neither applies now.

## Use

### Uploading Images

Open the application created by the installer in the previous step. You should be able to see the main page of the program. Next you will need to upload the images in the image selection section by clicking the select button. Optionally, you can select a folder that contains the images you will be uploading. The filetypes supported are JPG, TIF, and raw image formats. After uploading the images, you should see a list of the images and the image count should reflect the number of uploaded images.

### Uploading Response File and Image Information

Upload the response file that should have a file extension of `.rsp` and fill in the image data for the cropping, resizing and view settings. Check the `example` directory for more information.

### Uploading Calibration Files

Upload the calibration files for the remaining fields. These should have a `.cal` file extension. Check the `example` directory for more information.

### Settings

Click on the settings tab in the left hand navigation sidebar and you should see a settings display appear. For the Radiance path, give the path to the Radiance binaries. This would be something like `/usr/local/radiance/bin/` on macOS/Ubuntu and `C:\Radiance\bin` on Windows. For `hdrgen`, provide the path to the directory where these binaries are installed. This should be something like `/usr/local/bin` on macOS/Ubuntu. Lastly, the output should point to the folder to which you want the output images to be saved to.

### Generate Images

Once settings are entered, you can close the settings and click the Generate HDR Image button in the navigation sidebar. A message will let you know about the process or give you an error if something is wrong.

### Viewing HDR Images

Open the image viewer from the left hand navigation sidebar and drop an `.hdr` file on it. Any Radiance picture works, whether or not this application produced it.

The viewer renders the picture itself or a false-color luminance map, and reads the header for the values the pipeline recorded, including `COMPUTED_VERTICAL_ILLUMINANCE` (the vertical illuminance `evalglare` derived) and `MEASURED_VERTICAL_ILLUMINANCE` (the reference value you supplied, if any).

Hovering reports the luminance under the cursor. Shift+click and drag selects a region and reports its average, median, minimum, maximum and distribution. On a fisheye picture (one whose header records a `-vta` or `-vth` view), the corners of the square crop fall outside the lens circle and never saw the scene, so they are excluded from those statistics; the panel says so when it applies. Non-fisheye pictures fill their frame, so every pixel is counted.

## Additional Resources

For further guidance about creating and calibrating HDR images, please consult [Tutorial: Luminance Maps for Daylighting Studies from High Dynamic Range Photography](https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319) by Clotilde Pierson, Coralie Cauwerts, Magali Bodart, and Jan Wienold.

## Contributing

This project leverages [Tauri](https://tauri.app/) with [Rust](https://www.rust-lang.org/) and the following frameworks:

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/docs/guides/nextjs)

It also relies on the following software/binaries:

- [Radiance](https://github.com/LBNL-ETA/Radiance)
- [hdrgen](https://github.com/radiance-org/hdrgen)
- [dcraw_emu](https://www.libraw.org/)

Contributions are currently limited to those working on the Architectural Lighting Design Capstone Project at Oregon State University. If you are interested in contributing, please contact the project authors.

### Guidelines

1. Create a new issue in the GitHub repository to discuss your feature or bug fix.
2. Fork the repository.
3. Create a new branch for your feature or fix. The branch name should start with the issue number, e.g., `123-feature-name`.
4. Make your changes and commit them with a clear message.
5. Push your changes to your forked repository.
6. Create a pull request against the main repository's `main` branch.

Every PR must be reviewed by at least one team member and successfully build. Once changes have been approved and merged, feature branches should be deleted. We recommend only having one branch open at a time to keep the workflow clean (per contributor).

### Development

In order to create a working environment, first clone the repository, and `cd` into `HDRICalibrationTool`.

Make sure you have the latest [Node.js](https://nodejs.org/en) and [Rust](https://www.rust-lang.org/) installed.

To install dependiencies, run:

```sh
npm install
```

You can also use `pnpm`, `bun`, or `yarn` as alternatives.

Run the development server with:

```sh
npm run tauri dev
```

### Build

For the `tauri build` command to get the arguments, you need to prepend an extra `--`, such as:

```sh
npm run tauri build -- --target universal-apple-darwin
```

## Acknowledgements & Licensing

This app builds upon the scene processing and simulation strengths of existing programs such as Radiance, `hdrgen`, and LibRaw.

The application itself is licensed **GPL-3.0** (see [`LICENSE`](./LICENSE)). It incorporates:

| Component | Licence | Source |
|---|---|---|
| Radiance tools | Radiance Software License 2.0 (BSD-3-Clause in substance) | [radiantlab/Radiance](https://github.com/radiantlab/Radiance) |
| `hdrgen` | BSD-3-Clause, see [`licenses/BSD-3-Clause.txt`](./licenses/BSD-3-Clause.txt) | [radiantlab/hdrgen](https://github.com/radiantlab/hdrgen) |
| panlib | BSD-3-Clause | [radiantlab/panlib](https://github.com/radiantlab/panlib) |
| LibRaw (`dcraw_emu`) | LGPL-2.1, see [`licenses/LGPL-2.1.txt`](./licenses/LGPL-2.1.txt) | [radiantlab/LibRaw](https://github.com/radiantlab/LibRaw), upstream at https://www.libraw.org/ |

LibRaw offers a choice of LGPL-2.1 or CDDL-1.0; the LGPL is the one that applies here, because the CDDL is incompatible with the GPL. Where LibRaw is statically linked rather than invoked as a separate process, as it is in the WebAssembly pipeline, it is incorporated under **LGPL-2.1 section 3**, which permits applying ordinary GPL terms to that copy. The reasoning, and the obligations that follow for a browser deployment, are recorded in [`licenses/DECISIONS.md`](./licenses/DECISIONS.md).

### Authors

- Dr. Clotilde Pierson (Oregon State University)
- Alex Ulbrich (Oregon State University)

Contact: [alexander.ulbrich@oregonstate.edu](mailto:alexander.ulbrich@oregonstate.edu)

### Contributors

#### 2022-2023

- Xiangyu “Joey” Li
- Liam Zimmermann
- Nathaniel Klump

#### 2023-2024

- Jacob Springer
- Shanti Morrell

#### 2024-2025

- Emmitt Carter
- Samuel Croll
- Colin Cone
- Artin Lahni
- Madison Thompson
- Lou Pfluke

#### 2025-2026

- Thomas Eaton
- Joel Fief
