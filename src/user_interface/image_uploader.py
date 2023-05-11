# Author: OpenAI (adapted by Nate Klump)
# Title: Python Class for Uploading Multiple Images and Displaying Them with PyQt5
# Year: 2023
# URL: https://chat.openai.com/
# Access date: 2.19.2023

import os
from PySide2 import QtWidgets, QtGui, QtCore
from src.user_interface.image_preview import ImagePreview

from src.user_interface.upload_image_region import UploadImageRegion

class ImageUploader( QtWidgets.QWidget ):
    def __init__( self ):
        super().__init__()

        # UI setup
        self.setWindowTitle( "Image Uploader" )
        self.setGeometry( 100, 100, 500, 500 )

        self.layout = QtWidgets.QVBoxLayout()
        self.setLayout( self.layout )

        self.imageUploadRegion = UploadImageRegion( "Upload Image Files", [900, 200] )
        self.imageUploadRegion.setParent( self )
        self.layout.addWidget( self.imageUploadRegion, stretch=4 )

        self.scrollArea = QtWidgets.QScrollArea()
        self.scrollArea.setWidgetResizable( True )

        self.scrollAreaWidgetContents = QtWidgets.QWidget()
        self.scrollArea.setWidget( self.scrollAreaWidgetContents )

        self.gridLayout = QtWidgets.QGridLayout( self.scrollAreaWidgetContents )

        self.layout.addWidget( self.scrollArea, stretch=10 )

        self.totalImagesLabel = QtWidgets.QLabel()
        self.layout.addWidget( self.totalImagesLabel, stretch=1 )

        self.updateTotalImagesCount()

        # Initialize list of images
        self.imagePaths = []


    # Adds a single image to the ScrollBox by creating an ImagePreview obj.
    def addImageToList( self, imagePath ):
        # Create ImagePreview object for given image
        row = self.gridLayout.rowCount()
        preview = ImagePreview( imagePath )

        # Add ImagePreview to grid
        self.gridLayout.addWidget( preview, row, 0 )

        # Update the total images label
        self.updateTotalImagesCount()

        # Update the ldr_paths variable
        self.updatePathsLDR()

        return
    

    # Updates the total image count label self.totalImages
    def updateTotalImagesCount( self ):
        # Get count, set text
        totalImages = self.gridLayout.count()
        self.totalImagesLabel.setText( "Total Images: {}".format( totalImages ) )

        return
    

    # This function returns the count of total images uploaded to the region
    def getTotalImagesCount( self ):
        uploadedImageCount = int( self.gridLayout.count() )

        return uploadedImageCount
    

    # Updates the paths_ldr variable for the Radiance object
    def updatePathsLDR( self ):
        # Reach Ui_MainWindow object
        uiObject = self.parent().parent().parent().parent().parent().parent().ui

        uiObject.paths_ldr = self.imagePaths

        return
