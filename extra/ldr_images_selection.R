# TO RUN: have LDR images in a /data directory, and create an /output directory

computeMaskIndexes <- function(xres, yres, diameter, xleft, ydown, xcenter = NULL, ycenter = NULL) {
  # Description:
  #   Returns the indexes of the pixels outside the fisheye horizon.
  #
  # Input:
  #   - xres: the resolution of the image in x
  #   - yres: the resolution of the image in y
  #   AND
  #     - (xcenter, ycenter): the (x,y) coordinates of the pixel
  #         in the center of the fisheye horizon
  #   OR
  #     - diameter: the diameter in number of pixels of the fisheye horizon
  #     - xleft: the number of pixels between the left border of the frame 
  #         and the right extremity of the fisheye horizon
  #     - ydown: the number of pixels between the bottom border of the frame
  #         and the bottom extremity of the fisheye horizon
  #
  # Output: data.table with 
  #   - (x,y) pixel coordinates
  #   - sqdist: the squared distance from the center
  #   - id: the indexes of the pixels outside the fisheye horizon
  #
  # Remarks:
  #   Computes the center of the horizon, if not specified, based
  #   on the number of black pixels on the left, down, and the diameter
  #   of the horizon.
  
  library(data.table)
  radius <- diameter/2
  
  if (is.null(xcenter) & is.null(ycenter)) {
    # compute xcenter and ycenter if not specified
    xcenter <- xleft + radius
    ycenter <- ydown + radius
  }
  
  # create indexes matrix
  xind <- 1:xres
  yind <- sort(rep(1:yres, xres))
  pixelIndex <- data.table(xind = xind, yind = yind)
  pixelIndex[, sqdist := (xind - xcenter)^2 + (yind - ycenter)^2]
  pixelIndex[, id := 1:.N]
  pixelIndex <- pixelIndex[sqdist >= radius^2, ]

  # return only pixel indexes for mask
  return(pixelIndex)
}

selectLDRImages <- function(folderPath, outputPath, pixelIndex, skip = F) {
  # Description:
  #   Put the sequence of LDR images corresponding to HDR merging characteristics (27-228) in a new folder.
  #
  # Input:
  #   - folderPath: the path of the folder containing the entire sequence of LDR images
  #   - pixelIndex: the datatable with the indexes of the pixels outside the fisheye horizon
  #   - skip: if set on T, the function is skipped and all LDR images are copied in the new folder
  #           if set on F, the function will select the right LDR images and copy them in the new folder
  #
  # Output: list with (targetdir, read_exif(imagesList[1, filePath]), str_extract(imagesList[1, file], "^.+(?=_)"),imagesList) 
  #   - targetdir: path of the folder containing the selected LDR images
  #   - read_exif: exif data of first selected image
  #   - str_extract: name of the selected images
  #   - imagesList: for each image, the number of pixel below 27 and over 228

  library(data.table)
  library(stringr)
  library(imager)
  library(exif)
  
  roughContour =  nrow(pixelIndex)
  
  imagesList <- data.table(file = list.files(folderPath))
  imagesList <- imagesList[str_detect(tolower(file), "jpg|jpeg"), ] # only select images
  imagesList[, id_img := as.numeric(str_extract(file, "\\d+"))]
  setorder(imagesList, id_img)
  imagesList[, id := 1:.N]
  imagesList[, filePath := str_c(folderPath, file)]
  
  cat(str_c("  Pictures to process: ", nrow(imagesList),"\n"))
  
  if (!skip) {
    for (i in imagesList$id) {
      cat(str_c("    Processing picture ",i, " ... "))
      
      # Load image
      originalImage <- load.image(imagesList[id == i, filePath])
      
      # Transform image in 3 vectors (RGB)
      originalImage.matR <- originalImage[,,,1]
      originalImage.vecR <- as.vector(originalImage.matR)
      rm(originalImage.matR)
      
      originalImage.matG <- originalImage[,,,2]
      originalImage.vecG <- as.vector(originalImage.matG)
      rm(originalImage.matG)
      
      originalImage.matB <- originalImage[,,,3]
      originalImage.vecB <- as.vector(originalImage.matB)
      rm(originalImage.matB)
      
      rm(originalImage)
      
      # Set the 'outside of the fisheye horizon' pixels to black
      originalImage.vecR[pixelIndex$id] <- 0
      originalImage.vecG[pixelIndex$id] <- 0 
      originalImage.vecB[pixelIndex$id] <- 0
      
      # Regroup the 3 vectors (RGB) in an image
      maskedImage <- as.cimg(array(data = c(originalImage.vecR, originalImage.vecG, originalImage.vecB), dim = c(xres, yres, 1, 3)))
      rm(originalImage.vecR, originalImage.vecG, originalImage.vecB)
      
      # Add two columns contaning the number of pixels below 27 and above 228
      imagesList[id == i, min27 := sum(maskedImage[,,,1]*255 < 27 & maskedImage[,,,2]*255 < 27 & maskedImage[,,,3]*255 < 27) - roughContour]
      imagesList[id == i, max228 := sum(maskedImage[,,,1]*255 > 228 & maskedImage[,,,2]*255 > 228 & maskedImage[,,,3]*255 > 228)]
      
      rm(maskedImage)
      cat("Done.\n")
    }

    # Select the index of the "firstgoodlightestimage" (the first picture when you go towards lighter pictures which has no pixel below 27)
    # if that image does not exist, take first image
    firstImage <- max(min(imagesList$id), max(imagesList[min27 == 0, id]))
    
    # Select the index of the "firstgooddarkestimage" (the first picture when going towards darker pictures which has no pixel over 228)
    # if that picture does not exist, take last image
    lastImage <- min(min(imagesList[max228 == 0, id]), max(imagesList$id))
    
    # Select files to copy to new directory based on first and last indexes
    filestocopy <- c(imagesList[firstImage:lastImage, filePath])
    targetdir <- str_c(outputPath, "Selected_Images/")
    
    dir.create(targetdir, showWarnings = FALSE)
    # copy files
    file.copy(from=filestocopy, to=targetdir, copy.mode = TRUE)
    # move files
    #file.rename(from=filestocopy, to=targetdir)
    
    filestorename <-  str_c(targetdir, list.files(targetdir))
    file.rename(from=filestorename, to=str_replace(filestorename, " ", "_"))
  } else {
    filestocopy <- c(imagesList[, filePath])
    targetdir <- str_c(outputPath, "Selected_Images/")

    dir.create(targetdir, showWarnings = FALSE)
    # copy files
    file.copy(from=filestocopy, to=targetdir, copy.mode = TRUE)
    # move files
    #file.rename(from=filestocopy, to=targetdir)
    
    filestorename <-  str_c(targetdir, list.files(targetdir))
    file.rename(from=filestorename, to=str_replace(filestorename, " ", "_"))
    # targetdir <- folderPath
  }
  
  return(list(targetdir, read_exif(imagesList[1, filePath]), str_extract(imagesList[1, file], "^.+(?=_)"),imagesList))
}

images <- list.files("./data")

xres <- 5616
yres <- 3744
diameter <- 3612
xleft <- 1019
ydown <- 74

pixelIndex <- computeMaskIndexes(xres = xres, yres = yres, diameter = diameter,
                                 xleft = xleft, ydown = ydown)

selectLDRImages("./data/", "./output/", pixelIndex, skip = F)
