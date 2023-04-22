import os
import sys
import platform

from pathlib import Path

import time


from radiance_pipeline.radiance_data import RadianceData

from radiance_pipeline.logs import *


rp = __import__(__name__)

def radiance_pipeline_get_percent():
  return radiance_pipeline_percent

def radiance_pipeline_get_status_text():
  return radiance_pipeline_status_text

def radiance_pipeline_get_finished():
  return radiance_pipeline_finished

def radiance_pipeline( sessionData ):
  global radiance_pipeline_percent
  global radiance_pipeline_status_text
  global radiance_pipeline_finished
  radiance_pipeline_finished = False
  radiance_pipeline_percent = 0
  radiance_pipeline_status_text = "Setting up..."

  # Grab time pipeline session started for log filenames, only want 1 per session
  sessionTime = time.strftime("%Y%m%d-%H%M%S")

  # Get OS Platform info
  osName = os.name
  osSystem = platform.system()
  osRelease = platform.release()
  osVersion = platform.version()

  print( "OS Name: {}".format( osName ) )
  print( "OS System: {}".format( osSystem ) )
  print( "OS Release: {}".format( osRelease ) )
  print( "OS Version: {}".format( osVersion ) )
  print( "\n" )


  # Apply different merging logic
  TEST_MODE_ON = False

  # Ensure temp directory exists for storing intermediate output files from each pipeline step
  Path( sessionData.path_temp ).mkdir( mode=0o755, parents=True, exist_ok=True )

  # Joining paths for intermediate file results with absolute path of temp directory: cross-platform filepaths
  output1Path = os.path.join( sessionData.path_temp, "output1.hdr" )
  output2Path = os.path.join( sessionData.path_temp, "output2.hdr" )
  output3Path = os.path.join( sessionData.path_temp, "output3.hdr" )
  output4Path = os.path.join( sessionData.path_temp, "output4.hdr" )
  output5Path = os.path.join( sessionData.path_temp, "output5.hdr" )
  output6Path = os.path.join( sessionData.path_temp, "output6.hdr" )
  output7Path = os.path.join( sessionData.path_temp, "output7.hdr" )
  output8Path = os.path.join( sessionData.path_temp, "output8.hdr" )
  output9Path = os.path.join( sessionData.path_temp, "output9.hdr" )
  output10Path = os.path.join( sessionData.path_temp, "output10.hdr" )


  # List of paths
  intermediateOutputFilePaths = [ output1Path, output2Path, output3Path, output4Path, 
                                 output5Path, output6Path, output7Path, output8Path, 
                                 output9Path, output10Path ]


  # --------------------------------------------------------------------------------------------
  # Merging of exposures
  radiance_pipeline_status_text = "Merging exposures (may take a while)"
  if TEST_MODE_ON:
    # Disable merge, since it can take a while
    os.system(f"mv {output1Path} /tmp")
    os.system(f"rm {sessionData.path_temp}/*.hdr")
    os.system(f"mv {output1Path} {sessionData.sessionData.path_temp}/")
  
  # Not testing
  else:
    # Clear temp directory
    try:
      # Loop through each intermediate output file path and remove it
      for intermediateImage in intermediateOutputFilePaths:
          os.remove( f"{intermediateImage}" )

          curCmd = f"os.remove( {intermediateImage} )"

    except FileNotFoundError:
      pass
    except OSError as e:
      print(f"Error on command: {curCmd}")
      recordLog( sessionTime, "ERROR", e )
    finally:
      pass

    # Merge exposures
    try:
      radiance_pipeline_percent = 5
      os.system(f"hdrgen {' '.join(sessionData.paths_ldr)} -o {output1Path}"
                f" -r {sessionData.path_rsp_fn} -a -e -f -g")
    except Exception as e:
      recordLog( sessionTime, "ERROR", e )
    finally:
      print("Finished merging exposures.")
      radiance_pipeline_percent = 10

  # --------------------------------------------------------------------------------------------



  # --------------------------------------------------------------------------------------------
  # Nullifcation of exposure value
  radiance_pipeline_status_text = "Nullifying exposures"
  try:
    os.system(f"ra_xyze -r -o {output1Path} > {output2Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished nullifying exposure values.")
    radiance_pipeline_percent = 20

  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # Cropping
  radiance_pipeline_status_text = "Cropping"
  try:
    os.system(f"pcompos -x {sessionData.diameter} -y {sessionData.diameter} {output2Path} "
              f"-{sessionData.crop_x_left} -{sessionData.crop_y_down}, > {output3Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished cropping image.")
    radiance_pipeline_percent = 30

  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # Vignetting correction
  radiance_pipeline_status_text = "Correcting vignetting"
  try:
    os.system(f"pcomb -f {sessionData.path_vignetting} {output3Path} > {output4Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished correcting for vignetting.")
    radiance_pipeline_percent = 40
  
  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # Crop             
  radiance_pipeline_status_text = "Resizing"
  try:
    os.system(f"pfilt -1 -x {sessionData.target_x_resolution} -y {sessionData.target_y_resolution} "
              f"{output4Path} > {output5Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished resizing image.")
    radiance_pipeline_percent = 50

  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # Projection adjustment
  radiance_pipeline_status_text = "Adjusting projection"
  try:
    os.system(f"pcomb -f {sessionData.path_fisheye} {output5Path} > {output6Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished image projection adjustment.")
    radiance_pipeline_percent = 60

  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # ND Filter correction
  radiance_pipeline_status_text = "Correcting neutral density filter"
  try:
    os.system(f"pcomb -f {sessionData.path_ndfilter} {output6Path} > {output7Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished neutral density filter correction.")
    radiance_pipeline_percent = 70

  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # Photometric adjustment
  radiance_pipeline_status_text = "Performing photometric adjustment"
  try:
    os.system(f"pcomb -h -f {sessionData.path_calfact} {output7Path} > {output8Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished photometric adjustment.")
    radiance_pipeline_percent = 80

  # --------------------------------------------------------------------------------------------


  # --------------------------------------------------------------------------------------------
  # HDR image header editing
  radiance_pipeline_status_text = "Editing header"
  try:
      os.system(f"(getinfo < {output8Path} | sed \"/VIEW/d\" && getinfo - < {output8Path}) "
                f"> {output9Path}")
  except Exception as e:
      recordLog( sessionTime, "ERROR", e )
  finally:
      print("Finished editing image header.")
      radiance_pipeline_percent = 85
    

  # Real Viewing Angle
  radiance_pipeline_status_text = "Adjusting for real viewing angle"
  try:
    os.system(f"getinfo -a \"VIEW = -vta -view_angle_vertical {sessionData.view_angle_vertical} "
          f"-view_angle_horizontal {sessionData.view_angle_horizontal}\" "
          f"< {output9Path} > {output10Path}")
  except Exception as e:
      recordLog( sessionTime, "ERROR", e )
  finally:
      print("Finished adjusting for real viewing angle.")
      radiance_pipeline_percent = 90
  
  # --------------------------------------------------------------------------------------------

  
  # --------------------------------------------------------------------------------------------
  # Validity check
  radiance_pipeline_status_text = "Performing validity check"
  try:
    os.system(f"evalglare -V {output10Path}")
  except Exception as e:
    recordLog( sessionTime, "ERROR", e )
  finally:
    print("Finished output image validity check.")
    radiance_pipeline_percent = 100

  # --------------------------------------------------------------------------------------------
  radiance_pipeline_status_text = "Finished"
  radiance_pipeline_finished = True