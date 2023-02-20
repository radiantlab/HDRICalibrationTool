# Code snippets for a Python class that uses PySide2 to upload multiple image files and display them in a scrollable list region 
# with the file name displayed next to it, and a remove QPushButton that removes an uploaded image from the list.
# Retrieved 2.19.2023 from OpenAI's ChatGPT language model, which was last trained on 2021-09. URL: https://chat.openai.com/chat

import os
from PySide2 import QtWidgets, QtGui, QtCore

class ImagePreview( QtWidgets.QWidget ):
    def __init__( self, image_path ):
        super().__init__()

        self.image_path = image_path

        # UI setup
        self.layout = QtWidgets.QHBoxLayout()
        self.setLayout( self.layout )

        image_label = QtWidgets.QLabel()
        image_pixmap = QtGui.QPixmap( self.image_path )
        image_label.setPixmap( image_pixmap.scaled( 150, 150, QtCore.Qt.KeepAspectRatio ) )
        self.layout.addWidget( image_label )

        filename_label = QtWidgets.QLabel( os.path.basename( self.image_path ) )
        self.layout.addWidget( filename_label )

        remove_button = QtWidgets.QPushButton( "Remove" )
        remove_button.clicked.connect( self.remove_self )
        self.layout.addWidget( remove_button )

    def remove_self(self):
        # Remove this ImagePreview from its parent layout and delete it
        parent_layout = self.parent().layout()
        layout_item = parent_layout.itemAt( parent_layout.indexOf( self ) )
        parent_layout.removeItem( layout_item )
        self.deleteLater()