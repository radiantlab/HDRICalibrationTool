<img src="public/splash.png" alt="HDRI Calibration Interface" />

[![License](https://img.shields.io/badge/license-GPLv3-blue)](./LICENSE)
[![website](https://img.shields.io/badge/website-Radiant%20Lab-green.svg)](https://www.clotildepierson.com/software)
[![Tauri](https://img.shields.io/badge/Tauri-v1.5.2-yellow.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-v1.60-darkred.svg)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-v14.0.1-darkgrey.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v3.3.0-lightblue.svg)](https://tailwindcss.com/docs/guides/nextjs)

# For Developers

## Dependencies
This project uses [Tauri](https://tauri.app/) which depends on [Next.js](https://nextjs.org/) (no installation needed) for the frontend [Rust](https://www.rust-lang.org/) and [Tailwind CSS](https://tailwindcss.com/docs/guides/nextjs) (no installation needed) for styling. Next.js and Tailwind CSS depend on the installation of [nodejs](https://nodejs.org/en).

## Installation
In order to create a working environment, first clone the repository and cd into `HDRICalibrationTool-Capstone`.
Run `npm install` and wait for dependencies to install.
Run `npm run tauri dev`. This will install the Tauri dependencies and launch the application once complete.

## File Structure
Forntend: `src/app/(component)` every component of the application is split into its own file (settings, input images, cropping resizing...) which are then used by `page.tsx` and handled by `layout.tsx`.

## Contribution
