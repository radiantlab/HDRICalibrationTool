#!/bin/bash

# Setting up our work paths and file names
OUTPUT_FILE=${!#}
INPUT_FILES=0
TEMP_FILEPATH="/tmp"
TEMP_FILENAME=""
TEMP_FILENAME_ALT="" # Used to go back-and-fourth on compiling the image.

# Required files needed
CONFIG_CALFAC_PATH=""	# Calibration Factor
CONFIG_VIG_PATH=""	# Vignetting
CONFIG_ND_PATH=""	# Neutral Density Filter
CONFIG_FISHEYE_PATH=""	# Fisheye Correction
CONFIG_CAMRESP_PATH=""	# Camera Response
CONFIG_FISHEYE_DIAM=""	# Fisheye Diameter
CONFIG_CROP_X=""	# Crop the image starting at X
CONFIG_CROP_Y=""	# Crop the image starting at Y
CONFIG_VA_V=""		# View angle of the lens vertically
CONFIG_VA_H=""		# View angle of the lens horizontally
CONFIG_OUT_X=""		# Output width of the image
CONFIG_OUT_Y=""		# Output height of the image

# Radiance prints the image to STDOUT, so we can use two variable to go back and fourth on applying modifiers.
IMAGE_VAR1=""
IMAGE_VAR2=""

# Print Help function
printhelp() {
	echo "LDR 2 HDR"
	echo "Automating the creation of HDR images from LDR sets"
	echo "Outputs to CWD, with the HDR name being the MD5SUM"
	echo "Required arguments:"
	echo "-h [path] | HDRGen binary path"
	echo "-r [path] | Radiance package binary path"
	echo "-i [path/file wildcard] | Input image path/wildcard"
	echo "-z [file] | Calibration Factoring File"
	echo "-x [file] | Vignetting Config File"
	echo "-c [file] | Neutral Density Filter File"
	echo "-v [file] | Fisheye Correction File"
	echo "-b [file] | Camera Response File"
	echo "-n [file] | Camera Settings File"
}

# Check to see if no args were given

if [[ -z $1 ]]; then
	printhelp
	exit 0
fi

# Argument Parsing

# -h| HDRGEN path
# -r| Radiance path
# -i| Input images, can be regex or directory too.
# ARUGMENTS ARE DESIGNED TO BE NEXT TO EACH OTHER ON THE KEYBOARD FOR EASE OF USE.
# -z| Calibration Factoring File
# -x| Vignetting Config File
# -c| Neautral Density Filter File
# -v| Fisheye Correction File
# -b| Camera Response File
# -n| Camera Settings File

while getopts "h:r:i:z:x:c:v:b:n:" arg; do
  case $arg in
    h|r) # Setting HDRGEN path or radiance path
      export PATH+=":$OPTARG"
      ;;&
    i) # Getting the input files
      INPUT_FILES=($OPTARG*)
      for file in "$INPUT_FILES"; do
        if ! [[ -f "$file" ]]; then
          echo "ERROR LOADING FILES: $file IS NOT A FILE.";
	  echo "Other files attempting to load:"
          printf '%s\n' "${INPUT_FILES[@]}"
	  exit 1
	fi
      done;
      ;;
    z) # Calibration Factoring File
      CONFIG_CALFAC_PATH=$OPTARG
      ;;
    x) # Vignetting Config File
      CONFIG_VIG_PATH=$OPTARG
      ;;
    c) # Neutral Density Filter File
      CONFIG_ND_PATH=$OPTARG
      ;;
    v) # Fisheye Correction File
      CONFIG_FISHEYE_PATH=$OPTARG
      ;;
    b) # Camera Response File
      CONFIG_CAMRESP_PATH=$OPTARG
      ;;
    n) # Camera Setting File
      # Use regex magic to parse the file for all the information we need.
      CONFIG_FISHEYE_DIAM=$(grep -Po "(?<=diameter <- ).*" $OPTARG)
      CONFIG_CROP_X=$(grep -Po "(?<=xleft <- ).*" $OPTARG)
      CONFIG_CROP_Y=$(grep -Po "(?<=ydown <- ).*" $OPTARG)
      CONFIG_VA_V=$(grep -Po "(?<=-vv ).*" $OPTARG)
      CONFIG_VA_H=$(grep -Po "(?<=-vh ).*" $OPTARG)
      CONFIG_OUT_X=$(grep -Po "\d*(?=x\d*)" $OPTARG)
      CONFIG_OUT_Y=$(grep -Po "(?<=\dx)\d*" $OPTARG)
      ;;
      
  esac
done

# Ensure all variable are set

if [[ -z $INPUT_FILES ]]; then
	echo "ERROR: No input files given, please give as path to all files."
	exit 1
fi
if [[ -z $CONFIG_CALFAC_PATH ]]; then
	echo "ERROR: No calibration factoring file given, please give file."
	exit 1
fi
if [[ -z $CONFIG_VIG_PATH ]]; then
	echo "ERROR: No vignetting config file given, please give file."
	exit 1
fi
if [[ -z $CONFIG_FISHEYE_PATH ]]; then
	echo "ERROR: No fisheye correction config file given, please give file."
	exit 1
fi
if [[ -z $CONFIG_CAMRESP_PATH ]]; then
	echo "ERROR: No camera response config file given, please give file."
	exit 1
fi
if [[ -z $CONFIG_FISHEYE_DIAM || -z $CONFIG_CROP_X || -z $CONFIG_CROP_Y || -z $CONFIG_VA_V || -z $CONFIG_VA_H || -z $CONFIG_OUT_X || -z $CONFIG_OUT_Y ]]; then
	echo "ERROR: Camera settings file did not give all information needed! Please check it."
	exit 1
fi

# Set up the temp files, something simple.
TEMP_FILENAME="$TEMP_FILEPATH/$(md5sum ${INPUT_FILES[0]} | awk '{ print $1 }').hdr"
TEMP_FILENAME_ALT="$TEMP_FILEPATH/$(md5sum ${INPUT_FILES[1]} | awk '{ print $1 }').hdr"

# Make sure neither file already exists
rm $TEMP_FILENAME 2> /dev/null
rm $TEMP_FILENAME_ALT 2> /dev/null

# One last check, let's make sure that the Radiance suite and hdrgen are in PATH.

# hdrgen
if ! $(which hdrgen 2>&1 > /dev/null); then
	echo "ERROR: Missing PATH to hdrgen, please add to your PATH or set with -h flag."
	exit 1
fi;

# pcomb from Radiance
if ! $(which pcomb 2>&1 > /dev/null); then
	echo "ERROR: Missing PATH to Radiance utilities, please add to your PATH or set with -r flag."
	exit 1
fi;
# We have Radiance and hdrgen available!

# With all of the images selected, generate the HDR image.
hdrgen ${INPUT_FILES[@]} -o $TEMP_FILENAME -r $CONFIG_CAMRESP_PATH -a -e -f -g

echo "Compiled the initial HDR image, now processing..."

# Exposure Nullification
echo "Nullifying Exposures..."

ra_xyze -r -o $TEMP_FILENAME > $TEMP_FILENAME_ALT

# Image Cropping
echo "Cropping Image..."

pcompos -x $CONFIG_FISHEYE_DIAM -y $CONFIG_FISHEYE_DIAM $TEMP_FILENAME_ALT -$CONFIG_CROP_X -$CONFIG_CROP_Y > $TEMP_FILENAME

# Vignetting Correction
echo "Correcting the vignetting..."

pcomb -f $CONFIG_VIG_PATH -e "diameter=$CONFIG_FISHEYE_DIAM" $TEMP_FILENAME > $TEMP_FILENAME_ALT

# Resize Image
echo "Rescaling Image..."

pfilt -1 -x $CONFIG_OUT_X -y $CONFIG_OUT_Y $TEMP_FILENAME_ALT > $TEMP_FILENAME

# Fisheye Correction
echo "Correcting Fisheye..."

pcomb -f $CONFIG_FISHEYE_PATH $TEMP_FILENAME > $TEMP_FILENAME_ALT

# Applying Neutral Density Filter
echo "Applying Neutral Density Filter..."

pcomb -f $CONFIG_ND_PATH $TEMP_FILENAME_ALT > $TEMP_FILENAME

# Photometic Adjustments
echo "Applying Photometic Adjustments..."

pcomb -h -f $CONFIG_CALFAC_PATH $TEMP_FILENAME > $TEMP_FILENAME_ALT

# Edit the header
echo "Editing the header..."

getinfo < $TEMP_FILENAME_ALT | sed "/VIEW/d" > /dev/null

# Adjust for real viewing angle
echo "Adjusting for real viewing angle..."

getinfo -a "VIEW = -vta -view_angle_verticle $CONFIG_VA_V -view_angle_horizontal $CONFIG_VA_H" < $TEMP_FILENAME_ALT > $TEMP_FILENAME

# Final evaluation
echo "Performing final evaluation..."

EVAL_OUTPUT=$(evalglare -V -vta -vv $CONFIG_VA_V -vh $CONFIG_VA_H $TEMP_FILENAME)
EVAL_OUTPUT=$(printf "%.0f" $EVAL_OUTPUT)

if [ $EVAL_OUTPUT -eq 0 ]; then
	echo "Error compiling!"
	exit 1
fi

OUTPUT_FILE=$PWD/$(md5sum $TEMP_FILENAME | awk '{ print $1 }').hdr

mv $TEMP_FILENAME $OUTPUT_FILE

echo "Test passed! HDR file can be found at"
echo "$OUTPUT_FILE"
