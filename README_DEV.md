<img src="public/splash.png" alt="HDRI Calibration Interface" />

[![License](https://img.shields.io/badge/license-GPLv3-blue)](./LICENSE)
[![website](https://img.shields.io/badge/website-Radiant%20Lab-green.svg)](https://www.clotildepierson.com/software)
[![Tauri](https://img.shields.io/badge/Tauri-v1.5.2-yellow.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-v1.60-darkred.svg)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-v14.0.1-darkgrey.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v3.3.0-lightblue.svg)](https://tailwindcss.com/docs/guides/nextjs)

# For Developers

## Dependencies
This project utilizes [Tauri](https://tauri.app/) (no installation needed) which uses these frameworks:

Frontend: [Next.js](https://nextjs.org/) (no installation needed)

Styling: [Tailwind CSS](https://tailwindcss.com/docs/guides/nextjs) (no installation needed)

Next.js and Tailwind CSS depend on the installation of [nodejs](https://nodejs.org/en)

Backend: [Rust](https://www.rust-lang.org/) On Windows, Rust uses the Visual Studio C++ Build Tools

## Installation
In order to create a working environment, first clone the repository and cd into `HDRICalibrationTool-Capstone`.

Run `npm install` and wait for dependencies to install.

Run `npm run tauri dev`. This will install the Tauri dependencies and launch the application once complete.

## File Structure
Frontend: `src/app/(component)` every component of the application is split into its own file (settings, input images, cropping resizing...) which are then used by `page.tsx` and handled by `layout.tsx`. Each file in the front end has the same structure (function declaration, parameters, display states, function states, functions and HTML)

Backend: `src-tauri` contains the `tauri.conf.json` file which handles app title, app size, list of api functions and other configuration settings. `src-tauri/src/pipeline.rs` contains the main functionality for HDRGen. Additional pipeline functions are stored in `src-tauri/src/pipeline` these functions include handling cropping, neutral density, nullification of exposure values and others.

## Contribution
Contribution to the repo is limited to those working on the Architectural Lighting Design Capstone Project.

### Project Backlog
In order to contribute, navigate to Projects in the repo and begin with a draft issue. Then convert the draft to an issue and place that issue in either the backlog, ready or in progress. If working on a selected issue, assign yourself to that issue and be sure to update the progress of the issue in the review and done section. Next, create a branch titled issue and the issue number (issue number one would be titled issue1). Once changes are complete, push changes and open a PR. Every PR must be reviewed by at least one team member and successfully build. Once changes have been approved and merged, feature branches should be deleted. Try to only have one branch open at a time.
