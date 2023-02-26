import os

from PySide2.QtWidgets import QWidget, QLabel, QPushButton, QVBoxLayout, QHBoxLayout
from PySide2.QtGui import QPixmap
from PySide2.QtCore import Qt, QRect

from PyQt5.QtWidgets import QFileDialog

# For file name extraction
import ntpath

# For regular expressions
import re


# Creates a region to upload a file to, given an object name, and region size.
class UploadImageRegion( QWidget ):
    # regionSize[0]: width
    # regionSize[1]: height
    def __init__( self, regionName="DefaultLabel", regionSize=[128, 128] ):
        QWidget.__init__(self)

        # Store input parameters as class attributes
        self.regionName = regionName
        self.regionWidth = regionSize[0]
        self.regionHeight = regionSize[1]

        # Style path
        self.region_style_path = "./styles/upload_image_region_styles.css"

        # Visible region background
        self.uploadRegion = QLabel( self )

        # Spacers for QVBox/QHBox layouts
        self.regionSpacer = QLabel( self )

        # Region label (Insert spaces before capital letters)
        regionNameWithSpaces = re.sub(r"(\w)([A-Z])", r"\1 \2", regionName)
        self.regionLabel = QLabel( regionNameWithSpaces, self )
        
        # # File icon pixmap
        # self.fileIcon = QLabel( self )
        # self.fileIconPixmap = QPixmap( './assets/icons/blank-file-128.ico' )

        # Upload file icon pixmap
        self.uploadFileIcon = QLabel( self )
        self.uploadFileIconPixmap = QPixmap( './assets/icons/upload-file-multi.ico' )

        # File path label
        self.filePathLabel = QLabel( self )

        # # File name label
        # self.fileNameLabel = QLabel( self )

        # # Create remove button for an uploaded file
        # self.removeBtn = QPushButton( "Remove", self )

        # Browse file button
        self.browseBtn = QPushButton( "Browse", self )

        # Text labels for uploading
        self.dragTextLabel = QLabel( "drag file here to upload", self )
        self.orTextLabel = QLabel( "Or", self )

        # Allow dropping files in this region
        self.setAcceptDrops( True )

        # # Init. flag that stores if region has an uploaded file.
        # self.hasFile = False

        # Adjust elements of object
        self.create()


    # Setting widget object names and pixmaps
    def create( self ):
        # -------------------------------------------------------------------------------------
        # Upload Region
        self.uploadRegion.setObjectName( "uploadImageRegion_{}".format( self.regionName ) )
        self.uploadRegion.setGeometry( QRect( 0, 0, self.regionWidth, self.regionHeight ) )


        # Region Spacer Region
        self.regionSpacer.setObjectName( "regionSpacer" )


        # Region Label
        self.regionLabel.setObjectName( "regionLabel" )


        # # File Icon
        # self.fileIcon.setObjectName( "fileIcon" )
        # # Set pixmap
        # self.fileIcon.setPixmap( self.fileIconPixmap )


        # File Path Label
        self.filePathLabel.setObjectName( "filePathLabel" )
        self.filePathLabel.setText( "" )


        # # File Name Label
        # self.fileNameLabel.setObjectName( "fileNameLabel" )


        # # Remove Button
        # self.removeBtn.setObjectName( "removeButton" )
        # # Connect event to signal
        # self.removeBtn.clicked.connect( self.removeBtnClicked )


        # Upload File Icon
        self.uploadFileIcon.setObjectName( "uploadFileIcon" )
        # Set pixmap 
        self.uploadFileIcon.setPixmap( self.uploadFileIconPixmap )


        # Browse Button
        self.browseBtn.setObjectName( "browseButton" )
        # Connect event to signal
        self.browseBtn.clicked.connect( self.browseFiles )


        # Drag Text Label
        self.dragTextLabel.setObjectName( "dragTextLabel" )


        # Or Text Label
        self.orTextLabel.setObjectName( "orTextLabel" )

        # -------------------------------------------------------------------------------------

        # Set states of the created widgets (styles, visibility)
        self.setWidgetStates()

        # Create layout and add widgets
        self.initRegionLayout()
        
        return
    

    # Sets up the region layouts
    def initRegionLayout( self ):
        # Create layouts
        self.baseVLayout = QVBoxLayout()

        self.upperHLayout = QHBoxLayout()
        self.lowerHLayout = QHBoxLayout()

        self.innerVLayout = QVBoxLayout()

        self.uploadHLayout = QHBoxLayout()
        self.textVLayout = QVBoxLayout()
        self.buttonLabelHLayout = QHBoxLayout()
        self.uploadIconVLayout = QVBoxLayout()
        self.uploadIconHLayout = QHBoxLayout()

        # Add widgets and layouts
       # self.lowerHLayout.addWidget( self.fileIcon, stretch=1 )
        self.lowerHLayout.addLayout( self.innerVLayout, stretch=6 )

        self.baseVLayout.addLayout( self.upperHLayout, stretch=1 )
        self.baseVLayout.addLayout( self.lowerHLayout, stretch=4 )

        self.innerVLayout.addLayout( self.uploadHLayout, stretch=3 )
        #self.innerVLayout.addWidget( self.fileNameLabel, stretch=1 )

        self.uploadHLayout.addLayout( self.textVLayout, stretch=7 )
        self.uploadHLayout.addLayout( self.uploadIconVLayout, stretch=4 )
        self.uploadHLayout.addWidget( self.regionSpacer, stretch=3 )

        self.uploadIconVLayout.addLayout( self.uploadIconHLayout, stretch=6)
        self.uploadIconVLayout.addWidget( self.dragTextLabel, stretch=2, alignment=Qt.AlignLeft )
        self.uploadIconVLayout.addWidget( self.regionSpacer, stretch=1 )

        self.uploadIconHLayout.addWidget( self.uploadFileIcon, stretch=1, alignment=Qt.AlignCenter )
        self.uploadIconHLayout.addWidget( self.regionSpacer, stretch=1 )

        self.textVLayout.addWidget( self.regionSpacer, stretch=1 )
        self.textVLayout.addLayout( self.buttonLabelHLayout, stretch=2 )
        self.textVLayout.addWidget( self.regionSpacer, stretch=1 )

        self.buttonLabelHLayout.addWidget( self.regionSpacer, stretch=4, alignment=Qt.AlignRight )
        self.buttonLabelHLayout.addWidget( self.browseBtn, stretch=8, alignment=Qt.AlignRight )
        self.buttonLabelHLayout.addWidget( self.orTextLabel, stretch=3, alignment=Qt.AlignCenter )

        self.upperHLayout.addWidget( self.regionLabel, stretch=6 )
        self.upperHLayout.addWidget( self.regionSpacer, stretch=1 )
       # self.upperHLayout.addWidget( self.removeBtn, stretch=1 )

        # Add all inner layouts to the base layout for the region
        self.uploadRegion.setLayout( self.baseVLayout )

        return


    # Allow the dragging of image/text files onto region.
    def dragEnterEvent( self, event ):
        if event.mimeData().hasText():
            event.acceptProposedAction()


    # On image/text file drop event
    def dropEvent( self, event ):
        # Set hasFile flag
        self.hasFile = True

        # Get file path from file
        filepath = event.mimeData().text()

        # Remove 'file:///' if it exists after uploadinf file
        if ( filepath.startswith( "file:///" ) ):
            filepath = filepath[8:]

        # Set filePathLabel
        self.filePathLabel.setText( filepath )

        # Set fileNameLabel and show
        filename = self.getFilenameFromPath( filepath )
        self.fileNameLabel.setText( filename )

        
        self.fileUploadedEvent()


        event.acceptProposedAction()


    # # Remove button click event
    # def removeBtnClicked( self ):
    #     print( "Removing uploaded file: {} from path: {}".format( self.fileNameLabel.text(), self.filePathLabel.text() ) )

    #     self.resetWidgetState()

   
    # Reset the widget to the default state
    def resetWidgetState( self ):
        # Clear file path labels' text
        self.filePathLabel.setText("")

        # Set widget states
        self.setWidgetStates()


    # Get the filename from the path
    def getFilenameFromPath( self, path ):
        head, tail = ntpath.split(path)
        return tail or ntpath.basename(head)
    

    # Open file dialog box to browse for calibration .cal files
    def browseFiles( self ):
        # # Restrict to .cal file upload
        # if ( self.fileType == 1 ):
        #     inputFileName = QFileDialog.getOpenFileName( None, "Upload {} File".format( self.regionLabel.text() ), "", "Calibration File (*.cal)" )
        
        # # Restrict to .rsp file upload
        # elif ( self.fileType == 2 ):
        #     inputFileName = QFileDialog.getOpenFileName( None, "Upload {} File".format( self.regionLabel.text() ), "", "Response Function File (*.rsp)" )

        # # Allow any file to upload
        # else:
        inputFileName = QFileDialog.getOpenFileName( None, "Upload {} File".format( self.regionLabel.text() ), "Image Files (*.jpg, *.png)" )

        # Clicking 'cancel' button in dialog box will return empty string, so don't set attribute values in this case
        if (inputFileName[0] != ""):
            # Set file flag
            self.hasFile = True

            print( "Click-to-Browse got this filename: {}".format( inputFileName[0] ) )

            self.filePathLabel.setText( inputFileName[0] )

            filename = self.getFilenameFromPath( inputFileName[0] )
            self.fileNameLabel.setText( filename )

            self.fileUploadedEvent()

        else:
            print( "User clicked cancel on browse dialog" )


    # Function to handle an uploaded file from any method (drag+drop, click-to-browse) and adjust styling and visibility
    def fileUploadedEvent( self ):
        if ( self.hasFile ):
            print( "self.filePathLabel: {}".format( self.filePathLabel.text() ) )

            self.validateFile()

            self.setWidgetStates()
        
        else:
            print( "{} has no file!".format( self.regionName ) )
            
            return


    # Sets the visibility of widgets based on the region having a file or not
    def setWidgetVisibility( self ):
        self.filePathLabel.hide()

        # Show text labels
        self.dragTextLabel.show()
        self.orTextLabel.show()

        # Show upload file icon
        self.uploadFileIcon.show()

        # Show Browse button
        self.browseBtn.show()
    

    # Sets the style of widgets based on the region having a file or not
    def setWidgetStyle( self ):
        # Apply style
        with open( self.region_style_path, "r" ) as stylesheet:
            self.uploadRegion.setStyleSheet( stylesheet.read() )
            self.regionSpacer.setStyleSheet( stylesheet.read() )

            # Icons
          #  self.fileIcon.setStyleSheet( stylesheet.read() )
            self.uploadFileIcon.setStyleSheet( stylesheet.read() )

            # Labels
          #  self.fileNameLabel.setStyleSheet( stylesheet.read() )
            self.regionLabel.setStyleSheet( stylesheet.read() )
            self.orTextLabel.setStyleSheet( stylesheet.read() )
            self.dragTextLabel.setStyleSheet( stylesheet.read() )

            # Buttons
           # self.removeBtn.setStyleSheet( stylesheet.read() )
            self.browseBtn.setStyleSheet( stylesheet.read() )


    # Sets the state of the region's widgets
    def setWidgetStates( self ):
        # Set widget visibility
        self.setWidgetVisibility()

        # Set widget style
        self.setWidgetStyle()   
