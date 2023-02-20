# Author: OpenAI (adapted by Nate Klump)
# Title: Python Class for Uploading Multiple Images and Displaying Them with PyQt5
# Year: 2023
# URL: https://chat.openai.com/
# Access date: 2.19.2023

import os
from PySide2 import QtWidgets, QtGui, QtCore
from image_preview import ImagePreview

class ImageUploader( QtWidgets.QWidget ):
    def __init__( self ):
        super().__init__()

        # UI setup
        self.setWindowTitle( "Image Uploader" )
        self.setGeometry( 100, 100, 500, 500 )

        self.layout = QtWidgets.QVBoxLayout()
        self.setLayout( self.layout )

        self.scrollArea = QtWidgets.QScrollArea()
        self.scrollArea.setWidgetResizable( True )

        self.scrollAreaWidgetContents = QtWidgets.QWidget()
        self.scrollArea.setWidget( self.scrollAreaWidgetContents )

        self.gridLayout = QtWidgets.QGridLayout( self.scrollAreaWidgetContents )

        self.addImageButton = QtWidgets.QPushButton( "Add Images" )
        self.addImageButton.clicked.connect( self.add_images )
        self.layout.addWidget( self.addImageButton )

        self.layout.addWidget( self.scrollArea )

        # Initialize variables
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


    def add_image_to_list( self, image_path ):
        # Add ImagePreview to grid layout
        row = self.gridLayout.rowCount()
        preview = ImagePreview( image_path )
        self.gridLayout.addWidget( preview, row, 0 )
