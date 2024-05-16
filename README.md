<img src="public/splash.png" alt="HDRI Calibration Interface" />

[![License](https://img.shields.io/badge/license-GPLv3-blue)](./LICENSE)
[![website](https://img.shields.io/badge/website-Radiant%20Lab-green.svg)](https://www.clotildepierson.com/software)
[![Tauri](https://img.shields.io/badge/Tauri-v1.5.2-yellow.svg)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-v1.60-darkred.svg)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-v14.0.1-darkgrey.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v3.3.0-lightblue.svg)](https://nextjs.org/)


## Introduction
The purpose of this application is to give the user a graphical user interface for the Radiance/HDRGen pipeline process. The program works by taking in multiple LDR image files and calibration files in order to return light calculated images containing radiance, luminance and color. The application is intended for interior light design researchers who are concerned with how lighting in a room affects visual discomfort.

## Platforms
This application runs on MacOS, Windows and Linux.

## Getting Started
The user must install [Radiance](https://www.radiance-online.org/) as well as [HDRGen](http://www.anyhere.com/) to their local machine and have access to their location. After the dependencies have been installed, install the [HDRI Calibration Interface](https://github.com/shantimorrell/HDRICalibrationTool-Capstone/actions/runs/8283470432). There will be a build for each platform. After installation, extract the contents of the zipped folder to a desired location. Open the installed `folder/bundle` and the first folder in here will contain the installation for your platform. Continue the installation process. This will install the application on your desktop.

## Use
### Uploading Images
Open the application created by the installer in the previous step. You should be able to see the main page of the program. Next you will need to upload the images in the image selection section by clicking the select button. Optionally, you can select a folder that contains the images you will be uploading. The filetypes supported are JPG, JPEG and raw image format. After uploading the images, you should see a preview of the images and the image count should reflect the number of uploaded images.

### Uploading Response File and Image Information
Upload the response file that should have a file extension of rsp and fill in the image data for the cropping, resizing and view settings.

### Uploading Calibration Files
Select the calibration files for the remaining fields. These should have a cal file extension.

### Settings
Click on the settings tab in the left hand navigation sidebar and you should see a settings display appear. For the Radiance path, give the path to the Radiance binaries. This would be something like `/usr/local/radiance/bin/` with usr being the name of the user on the computer. The HDRGen path should point to /usr/local/bin and the output should point to the location to which you want the output images to go to.

### Generate Images
Once settings are entered, you can close the settings and click the Generate HDR Image button in the navigation sidebar which will give a message about the process that will either complete or give an error.

## Acknowledgements

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