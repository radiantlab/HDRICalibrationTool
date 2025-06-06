/**
 * descriptions.ts
 * 
 * Key every field by a string (e.g. "fisheyeDiameter", "xLeftOffset", etc.).
 * This `Record<…, string>` ensures you get compiler errors if you mistype a key.
 */

const descriptions: Record<string, string> = {
  fisheyeDiameter:
    "The diameter (in pixels) of the circular fisheye area.",

  xLeftOffset:
    "Distance between left edge of the image and left edge of fisheye view.",

  yBottomOffset:
    "Distance between bottom edge of the image and bottom edge of fisheye view",

  vh:
    "Horizontal view angle (in degrees) of your fisheye lens. Default is 180 degrees.",

  vv:
    "Vertical view angle (in degrees) of your fisheye lens. Default is 180 degrees.",

  targetRes:
    "The HDR image will be resized to this resolution. Default is 1000 pixels.",

  response:
    "A camera response function is the rule that tells your camera how to turn the brightness of a scene into digital pixel numbers.",

  fisheye:
    "The rule a lens uses to map the angles of a real-world scene onto a flat image.",

  vignetting:
    "Vignetting correction fixes the darkening that happens toward the edges of a photo by measuring how much brightness is lost and then brightening those outer areas to match the center. This ensures the image looks evenly lit from center to edge.",

  neutralDensity:
    "Neutral density correction compensates for an ND filter’s dimming and color tint by measuring its effect with a color chart and applying a simple adjustment to restore true brightness and color.",

  calibrationFactor:
    "Photometric calibration takes the real measured brightness and divides it by the HDR image’s calculated brightness to get a correction factor.",

  scaleLimit:
    "The minimum and maximum data values that the color scale covers, determining which values map to the ends of the color gradient.",

  scaleLabel:
    "The text that describes what the colors represent (e.g., “Illuminance (lux)”) and is shown alongside the color bar",

  scaleLevels:
    "The number of discrete color steps or divisions used in the color bar to represent data values.",

  legendDimensions:
    "The width and height (in pixels or units) of the color bar graphic that displays the scale.",
};

export default descriptions;