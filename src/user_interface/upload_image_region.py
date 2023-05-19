# Standard library imports
import re
import ntpath

# Third-party library imports
from PySide6.QtWidgets import QWidget, QLabel, QPushButton, QVBoxLayout, QHBoxLayout, QFileDialog
from PySide6.QtGui import QPixmap
from PySide6.QtCore import Qt, QRect


# Creates a region to upload an image to, given an object name and region size.
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
        self.regionStylePath = "./src/styles/upload_image_region_styles.css"

        # Visible region background
        self.uploadRegion = QWidget( self )

        # Spacers for QVBox/QHBox layouts
        self.regionSpacer = QLabel( self )

        # Region label (Insert spaces before capital letters)
        regionNameWithSpaces = re.sub(r"(\w)([A-Z])", r"\1 \2", regionName)
        self.regionLabel = QLabel( regionNameWithSpaces, self )
        
        # Upload file icon pixmap
        self.uploadFileIcon = QLabel( self )
        self.uploadFileIconPixmap = QPixmap( './src/assets/icons/upload-file-multi.ico' )

        # File path label
        self.filePathLabel = QLabel( self )

        # Browse file button
        self.browseBtn = QPushButton( "Browse", self )

        # Text labels for uploading
        self.dragTextLabel = QLabel( "drag file here to upload", self )
        self.orTextLabel = QLabel( "Or", self )

        # Allow dropping files in this region
        self.setAcceptDrops( True )

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


        # File Path Label
        self.filePathLabel.setObjectName( "filePathLabel" )
        self.filePathLabel.setText( "" )


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

        # Set properties of the created widgets (styles, visibility)
        self.setWidgetProperties()

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
        self.lowerHLayout.addLayout( self.innerVLayout, stretch=6 )

        self.baseVLayout.addLayout( self.upperHLayout, stretch=1 )
        self.baseVLayout.addLayout( self.lowerHLayout, stretch=4 )

        self.innerVLayout.addLayout( self.uploadHLayout, stretch=3 )

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

        # Add all inner layouts to the base layout for the region
        self.uploadRegion.setLayout( self.baseVLayout )

        return


    # Allow the dragging of image/text files onto region.
    def dragEnterEvent( self, event ):
        if event.mimeData().hasText():
            event.acceptProposedAction()


    # On image/text file drop event
    def dropEvent( self, event ):
        # Get file path from file
        filepath = event.mimeData().text()

        # Selecting multiple files to drag+drop concatentates all filepaths into a list, '\n' newline-delimited.
        # Upload each uploaded file
        if ( filepath.find("\n") != -1 ):
            filepath = filepath.split("\n")

            for filename in filepath:
                # Remove 'file:///' if it exists after uploadinf file
                if ( filename.startswith( "file:///" ) ):
                    filename = filename[8:]
                
                # If filename is empty, don't add (Selecting multiple files will newline-delimit a list, and last entry is a '\n')
                if ( filename == "" ):
                    continue

                self.fileUploadedEvent( filename )

        # Single file drag+drop upload
        else:
            # Remove 'file:///' if it exists after uploading file
            if ( filepath.startswith( "file:///" ) ):
                filepath = filepath[8:]

            self.fileUploadedEvent( filepath )


        print( "self.parent().imagePaths: {}".format( self.parent().imagePaths ) )

        event.acceptProposedAction()


    # Get the filename from the path
    def getFilenameFromPath( self, path ):
        head, tail = ntpath.split(path)
        return tail or ntpath.basename(head)


    # Open file dialog box to browse for calibration .cal files
    def browseFiles( self ):
        # Restrict to image file upload
        inputFileNames = QFileDialog.getOpenFileNames( None, "Upload Image(s)", "", "Image files (*.jpg *.png *.JPG *.CR2 *.cr2)" )

        for filename in inputFileNames[0]:
            self.fileUploadedEvent( filename )

        print( "self.parent().imagePaths: {}".format( self.parent().imagePaths ) )

        return


    # Function to handle an uploaded file from any method (drag+drop, click-to-browse) and adjust styling and visibility
    def fileUploadedEvent( self, filename ):
        # Check if file with this name is already uploaded
        if ( filename not in self.parent().imagePaths ):
            # Add image path to list of all uploaded images
            self.parent().imagePaths.append( filename )

            # Create a ImagePreview object to add to ScrollBox list
            self.parent().addImageToList( filename )
    
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

        return
    

    # Sets the style of widgets based on the region having a file or not
    def setWidgetStyle( self ):
        # Apply style
        with open( self.regionStylePath, "r" ) as stylesheet:
            self.uploadRegion.setStyleSheet( stylesheet.read() )
            self.regionSpacer.setStyleSheet( stylesheet.read() )

            # Icons
            self.uploadFileIcon.setStyleSheet( stylesheet.read() )

            # Labels
            self.regionLabel.setStyleSheet( stylesheet.read() )
            self.orTextLabel.setStyleSheet( stylesheet.read() )
            self.dragTextLabel.setStyleSheet( stylesheet.read() )

            # Buttons
            self.browseBtn.setStyleSheet( stylesheet.read() )
        
        return


    # Sets the properties of the region's widgets
    def setWidgetProperties( self ):
        # Set widget visibility
        self.setWidgetVisibility()

        # Set widget style
        self.setWidgetStyle()   

        return
