# Author: OpenAI (heavily adapted by Nate Klump)
# Title: Python Class for Uploading Multiple Images and Displaying Them with PyQt5
# Year: 2023
# URL: https://chat.openai.com/
# Access date: 2.19.2023


# Standard library imports
import pathlib

# Third-party library imports
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QScrollArea, QLabel, QPushButton

# Local module imports
from src.user_interface.image_preview import ImagePreview
from src.user_interface.upload_image_region import UploadImageRegion


class ImageUploader( QWidget ):
    def __init__( self ):
        super().__init__()

        self.imageUploaderStylePath = "./src/styles/image_uploader_styles.css"

        # UI setup
        self.setWindowTitle( "Image Uploader" )
        self.setGeometry( 100, 100, 500, 500 )

        self.baseVLayout = QVBoxLayout()
        self.setLayout( self.baseVLayout )

        self.imageUploadRegion = UploadImageRegion( "Upload Image Files" )
        self.imageUploadRegion.setParent( self )
        self.baseVLayout.addWidget( self.imageUploadRegion, stretch=4 )

        self.scrollArea = QScrollArea()
        self.scrollArea.setWidgetResizable( True )

        self.scrollAreaWidgetContents = QWidget()
        self.scrollArea.setWidget( self.scrollAreaWidgetContents )

        self.gridLayout = QGridLayout( self.scrollAreaWidgetContents )

        self.baseVLayout.addWidget( self.scrollArea, stretch=10 )

        self.baseHLayout = QHBoxLayout()

        self.totalImagesLabel = QLabel()
        
        self.removeAllBtn = QPushButton( "Remove All Images" )
        self.removeAllBtn.setObjectName( "removeAllBtn" )
        self.removeAllBtn.clicked.connect( self.removeAllImages )

        self.baseHLayout.addWidget( self.totalImagesLabel, stretch=4 )
        self.baseHLayout.addWidget( self.removeAllBtn, stretch=2 )

        self.baseVLayout.addLayout( self.baseHLayout )

        self.updateTotalImagesCount()

        # Initialize list of images
        self.imagePaths = []

        # Apply styling
        self.setWidgetStyle()

        return


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

        self.checkForRawImages()

        return


    # Removes all uploaded images
    def removeAllImages( self ):
        print("Removing all uploaded images...")
        # Clear imagePaths list
        self.imagePaths = []

        # Remove image_preview widgets
        layout = self.gridLayout
        # Source: https://stackoverflow.com/questions/4528347/clear-all-widgets-in-a-layout-in-pyqt#:~:text=for%20future%20reference%3A-,def%20clearLayout(layout)%3A,-while%20layout.
        while layout.count():
            child = layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        # Update Radiance object, total images count label
        self.updatePathsLDR()
        self.updateTotalImagesCount()

        return
    

    # Sets the style of widgets
    def setWidgetStyle( self ):
        # Apply style
        with open( self.imageUploaderStylePath, "r" ) as stylesheet:
            self.removeAllBtn.setStyleSheet( stylesheet.read() )

        return
    

    # This function checks the list of images uploaded, and if there is a raw image, sets a flag.
    def checkForRawImages( self ):
        # Reach Ui_MainWindow object
        uiObject = self.parent().parent().parent().parent().parent().parent().ui

        uiObject.rawImageUploaded == False

        # Check each image extension
        for ldrImage in self.imagePaths:
            ext = pathlib.Path( ldrImage.lower() ).suffix

            if ( ext == ".cr2" ):
                uiObject.rawImageUploaded == True
                uiObject.rsp_UploadRegion.setRspRegionState()
                # Just need to find at least one for flag to be set, can break out of loop after
                break

        return
    