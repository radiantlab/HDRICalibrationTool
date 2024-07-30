<img src="public/splash.png" alt="HDRI Calibration Interface" />

[![License](https://img.shields.io/badge/license-GPLv3-blue)](./LICENSE)
[![website](https://img.shields.io/badge/website-Radiant%20Lab-green.svg)](https://www.clotildepierson.com/software)
[![Tauri](https://img.shields.io/badge/Tauri-v1.6.0-yellow.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-v1.80.0-darkred.svg)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-v14.0.1-darkgrey.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v3.3.0-lightblue.svg)](https://tailwindcss.com/)

## Introduction

This application provides a graphical user interface for the creation and calibration of High Dynamic Range (HDR) images using Radiance, `hdrgen`, and `dcraw_emu` according to the pipeline process published [here](https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319). The program works by taking in multiple LDR image files as well as some calibration information related to the camera/lens used, in order to return calibrated HDR images, also called luminance maps. The application is intended for lighting and daylighting professionals or researchers who are interested in studying the indoor visual environment and especially discomfort glare.

## Platforms

This application runs on macOS (Intel and Apple Silicon), Windows, and Ubuntu.

## Getting Started

Install [Radiance](https://www.radiance-online.org/), [hdrgen](http://www.anyhere.com/), and the [dcraw_emu](https://www.libraw.org/download) to your local machine and note where these tools are located (the folder path). After these dependencies have been installed, install the [HDRI Calibration Interface](https://github.com/radiantlab/HDRICalibrationTool/releases/latest) for your operating system.

Note that the binaries are unsigned and might be flagged as untrusted by your operating system. On macOS, you need to right click on the application and select Open to have the option to run it.

## Use

### Uploading Images

Open the application created by the installer in the previous step. You should be able to see the main page of the program. Next you will need to upload the images in the image selection section by clicking the select button. Optionally, you can select a folder that contains the images you will be uploading. The filetypes supported are JPG, TIF, and raw image formats. After uploading the images, you should see a list of the images and the image count should reflect the number of uploaded images.

### Uploading Response File and Image Information

Upload the response file that should have a file extension of `.rsp` and fill in the image data for the cropping, resizing and view settings. Check the `example` directory for more information.

### Uploading Calibration Files

Upload the calibration files for the remaining fields. These should have a `.cal` file extension. Check the `example` directory for more information.

### Settings

Click on the settings tab in the left hand navigation sidebar and you should see a settings display appear. For the Radiance path, give the path to the Radiance binaries. This would be something like `/usr/local/radiance/bin/` on macOS/Ubuntu and `C:\Radiance\bin` on Windows. For `hdrgen` and `dcraw_emu`, provide the path to the directory where these binaries are installed. These should be something like `/usr/local/bin` on macOS/Ubuntu. Lastly, the output should point to the folder to which you want the output images to be saved to.

### Generate Images

Once settings are entered, you can close the settings and click the Generate HDR Image button in the navigation sidebar. A message will let you know about the process or give you an error if something is wrong.

## Additional Resources

For further guidance about creating and calibrating HDR images, please consult [Tutorial: Luminance Maps for Daylighting Studies from High Dynamic Range Photography](https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319) by Clotilde Pierson, Coralie Cauwerts, Magali Bodart, and Jan Wienold.

## Acknowledgements

This app builds upon the scene processing and simulation strengths of existing programs such as Radiance, `hdrgen`, and LibRaw.

### Authors

- Dr. Clotilde Pierson (Oregon State University)
- Alex Ulbrich (Oregon State University)

### Contributors

#### 2022 - 2023 Development Team

- Xiangyu “Joey” Li
- Liam Zimmermann
- Nathaniel Klump

#### 2023 - 2024 Development Team

- Jacob Springer
- Shanti Morrell
