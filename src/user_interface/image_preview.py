# Code snippets for a Python class that uses PySide2 to upload multiple image files and display them in a scrollable list region 
# with the file name displayed next to it, and a remove QPushButton that removes an uploaded image from the list.
# Retrieved 2.19.2023 from OpenAI's ChatGPT language model, which was last trained on 2021-09. URL: https://chat.openai.com/chat

import os
from PySide6.QtWidgets import QWidget, QLabel, QPushButton, QHBoxLayout
from PySide6.QtGui import QPixmap
from PySide6.QtCore import Qt

class ImagePreview( QWidget ):
    def __init__( self, imagePath ):
        super().__init__()

        self.imagePath = imagePath

        # Style path
        self.imagePreviewStylePath = "./src/styles/image_preview_styles.css"

        # UI setup
        self.layout = QHBoxLayout()
        self.setLayout( self.layout )

        self.imageLabel = QLabel()
        self.imageLabel.setObjectName( "imageLabel" )

        self.imagePixmap = QPixmap( self.imagePath )
        self.imageLabel.setPixmap( self.imagePixmap.scaled( 150, 150, Qt.KeepAspectRatio ) )
        self.layout.addWidget( self.imageLabel )

        self.filenameLabel = QLabel( os.path.basename( self.imagePath ) )
        self.filenameLabel.setObjectName( "filenameLabel" )
        self.layout.addWidget( self.filenameLabel )

        self.removeBtn = QPushButton( "Remove", self )
        self.removeBtn.setObjectName( "removeButton" )
        self.removeBtn.clicked.connect( self.removeSelf )
        self.layout.addWidget( self.removeBtn )

        self.setWidgetStyle()

        return


    # Remove button click event: removes the ImagePreview object the btn is attached to from the GridLayout
    def removeSelf( self ):
        # Remove this ImagePreview from its parent layout and delete it
        parentLayout = self.parent().layout()
        layoutItem = parentLayout.itemAt( parentLayout.indexOf( self ) )
        parentLayout.removeItem( layoutItem )

        # Get up to the ImageUploader object
        imageUploaderContainer = self.parent().parent().parent().parent()

        # Remove image from the imagePaths list
        imageUploaderContainer.imagePaths.remove( self.imagePath )

        print( "Removing uploaded file from path: {}".format( self.imagePath ) )

        # Update total image count label
        imageUploaderContainer.updateTotalImagesCount()

        # Update ldr_paths variable
        imageUploaderContainer.updatePathsLDR()

        self.deleteLater()

        return
    

    # Sets the style of widgets based on the region having a file or not
    def setWidgetStyle( self ):
        # Apply style
        with open( self.imagePreviewStylePath, "r" ) as stylesheet:
            self.imageLabel.setStyleSheet( stylesheet.read() )
        with open( self.imagePreviewStylePath, "r" ) as stylesheet:
            self.filenameLabel.setStyleSheet( stylesheet.read() )
        with open( self.imagePreviewStylePath, "r" ) as stylesheet:
            self.removeBtn.setStyleSheet( stylesheet.read() )

        return