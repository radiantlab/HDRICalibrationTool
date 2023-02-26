# Author: OpenAI (adapted by Nate Klump)
# Title: Python Class for Uploading Multiple Images and Displaying Them with PyQt5
# Year: 2023
# URL: https://chat.openai.com/
# Access date: 2.19.2023

import os
from PySide2 import QtWidgets, QtGui, QtCore
from image_preview import ImagePreview

#from upload_file_region import UploadFileRegion
from upload_image_region import UploadImageRegion

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
        self.layout.addWidget( self.imageUploadRegion, stretch=1 )

        self.scrollArea = QtWidgets.QScrollArea()
        self.scrollArea.setWidgetResizable( True )

        self.scrollAreaWidgetContents = QtWidgets.QWidget()
        self.scrollArea.setWidget( self.scrollAreaWidgetContents )

        self.gridLayout = QtWidgets.QGridLayout( self.scrollAreaWidgetContents )

        self.addImageButton = QtWidgets.QPushButton( "Add Images" )
        self.addImageButton.clicked.connect( self.add_images )

        self.layout.addWidget( self.scrollArea, stretch=2 )

        self.total_images_label = QtWidgets.QLabel()
        self.layout.addWidget( self.total_images_label, stretch=1 )

        self.update_total_image_count()

        # Initialize list of images
        self.image_paths = []


    def add_images(self):
        # Show file dialog to select images
        file_dialog = QtWidgets.QFileDialog()
        file_dialog.setFileMode( QtWidgets.QFileDialog.ExistingFiles )
        file_dialog.setNameFilter( "Image files (*.jpg *.png)" )

        if file_dialog.exec_():
            filenames = file_dialog.selectedFiles()
            for filename in filenames:
                if filename not in self.image_paths:
                    self.image_paths.append( filename )
                    self.add_image_to_list( filename )

        print( "self.image_paths: {}".format( self.image_paths ) )

        return


    def add_image_to_list( self, image_path ):
        # Add ImagePreview to grid layout
        row = self.gridLayout.rowCount()
        preview = ImagePreview( image_path )
        self.gridLayout.addWidget( preview, row, 0 )

        # Update the total images label
        self.update_total_image_count()

        return
    

    def update_total_image_count( self ):
        total_images = self.gridLayout.count()

        self.total_images_label.setText( "Total Images: {}".format( total_images ) )