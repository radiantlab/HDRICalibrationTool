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
class UploadFileRegion( QWidget ):
    # regionSize[0]: width
    # regionSize[1]: height
    # fileType: Restricts file upload to: [0: any;  1: .cal;  2: .rsp]
    def __init__( self, regionName="DefaultLabel", regionSize=[128, 128], fileType=0 ):
        QWidget.__init__(self)

        # Store input parameters as class attributes
        self.regionName = regionName
        self.regionWidth = regionSize[0]
        self.regionHeight = regionSize[1]
        self.fileType = fileType

        # Style path
        self.region_style_path = "./styles/upload_file_region_styles.css"

        # Visible region background
        self.uploadRegion = QLabel( self )

        # Spacers for QVBox/QHBox layouts
        self.regionSpacer = QLabel( self )

        # Region label
        regionNameWithSpaces = re.sub(r"(\w)([A-Z])", r"\1 \2", regionName)
        self.regionLabel = QLabel( regionNameWithSpaces, self )
        
        # File icon pixmap
        self.fileIcon = QLabel( self )
        self.fileIconPixmap = QPixmap( './assets/icons/blank-file-128.ico' )

        # Upload file icon pixmap
        self.uploadFileIcon = QLabel( self )
        self.uploadFileIconPixmap = QPixmap( './assets/icons/upload-file-multi.ico' )

        # File path label
        self.filePathLabel = QLabel( self )

        # File name label
        self.fileNameLabel = QLabel( self )

        # Create remove button for an uploaded file
        self.removeBtn = QPushButton( "Remove", self )

        # Browse file button
        self.browseBtn = QPushButton( "Browse", self )

        # Text labels for uploading
        self.dragTextLabel = QLabel( "drag file here to upload", self )
        self.orTextLabel = QLabel( "Or", self )

        # Allow dropping files in this region
        self.setAcceptDrops( True )

        # Init. flag that stores if region has an uploaded file.
        self.hasFile = False

        # Adjust elements of object
        self.create()


    # Setting widget object names and pixmaps
    def create( self ):
        # -------------------------------------------------------------------------------------
        # Upload Region
        self.uploadRegion.setObjectName( "uploadFileRegion_{}".format( self.regionName ) )
        self.uploadRegion.setGeometry( QRect( 0, 0, self.regionWidth, self.regionHeight ) )


        # Region Spacer Region
        self.regionSpacer.setObjectName( "regionSpacer" )


        # Region Label
        self.regionLabel.setObjectName( "regionLabel" )


        # File Icon
        self.fileIcon.setObjectName( "fileIcon" )
        # Set pixmap
        self.fileIcon.setPixmap( self.fileIconPixmap )


        # File Path Label
        self.filePathLabel.setObjectName( "filePathLabel" )
        self.filePathLabel.setText( "" )


        # File Name Label
        self.fileNameLabel.setObjectName( "fileNameLabel" )


        # Remove Button
        self.removeBtn.setObjectName( "removeButton" )
        # Connect event to signal
        self.removeBtn.clicked.connect( self.removeBtnClicked )


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
        self.lowerHLayout.addWidget( self.fileIcon, stretch=1 )
        self.lowerHLayout.addLayout( self.innerVLayout, stretch=6 )

        self.baseVLayout.addLayout( self.upperHLayout, stretch=1 )
        self.baseVLayout.addLayout( self.lowerHLayout, stretch=4 )

        self.innerVLayout.addLayout( self.uploadHLayout, stretch=3 )
        self.innerVLayout.addWidget( self.fileNameLabel, stretch=1 )

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
        self.upperHLayout.addWidget( self.removeBtn, stretch=1 )

        # Add all inner layouts to the base layout for the region
        self.uploadRegion.setLayout( self.baseVLayout )

        return


    # Allow the dragging of image/text files onto region.
    def dragEnterEvent( self, event ):
        # Only accept dragEnterEvents if region does not have a file already
        if (self.hasFile == False):
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


    # Remove button click event
    def removeBtnClicked( self ):
        print( "Removing uploaded file: {} from path: {}".format( self.fileNameLabel.text(), self.filePathLabel.text() ) )

        self.resetWidgetState()

   
    # Reset the widget to the default state
    def resetWidgetState( self ):
        # Set hasFile flag
        self.hasFile = False

        # Clear file name/path labels' text
        self.fileNameLabel.setText("")
        self.filePathLabel.setText("")

        # Set widget states
        self.setWidgetStates()


    # Get the filename from the path
    def getFilenameFromPath( self, path ):
        head, tail = ntpath.split(path)
        return tail or ntpath.basename(head)
    

    # Open file dialog box to browse for calibration .cal files
    def browseFiles( self ):
        # Restrict to .cal file upload
        if ( self.fileType == 1 ):
            inputFileName = QFileDialog.getOpenFileName( None, "Upload {} File".format( self.regionLabel.text() ), "", "Calibration File (*.cal)" )
        
        # Restrict to .rsp file upload
        elif ( self.fileType == 2 ):
            inputFileName = QFileDialog.getOpenFileName( None, "Upload {} File".format( self.regionLabel.text() ), "", "Response Function File (*.rsp)" )

        # Allow any file to upload
        else:
            inputFileName = QFileDialog.getOpenFileName( None, "Upload {} File".format( self.regionLabel.text() ), "" )

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
        # Always
        self.filePathLabel.hide()

        if ( self.hasFile == True ):
            # Show fileNameLabel
            self.fileNameLabel.show()

            # Show file icon
            self.fileIcon.show()

            # Show removeBtn
            self.removeBtn.show()

            # Hide text labels
            self.dragTextLabel.hide()
            self.orTextLabel.hide()

            # Hide upload file icon
            self.uploadFileIcon.hide()

            # Hide Browse button
            self.browseBtn.hide()
        
        else:
            # Hide file name label
            self.fileNameLabel.hide()

            # Hide file icon
            self.fileIcon.hide()

            # Hide removeBtn
            self.removeBtn.hide()

            # Show text labels
            self.dragTextLabel.show()
            self.orTextLabel.show()

            # Show upload file icon
            self.uploadFileIcon.show()

            # Show Browse button
            self.browseBtn.show()
    

    # Sets the style of widgets based on the region having a file or not
    def setWidgetStyle( self ):
        # Set property for stylesheet to apply correct style
        self.uploadRegion.setProperty( "hasFile", self.hasFile )
        self.regionSpacer.setProperty( "hasFile", self.hasFile )

        # Icons
        self.fileIcon.setProperty( "hasFile", self.hasFile )
        self.uploadFileIcon.setProperty( "hasFile", self.hasFile )

        # Labels
        self.fileNameLabel.setProperty( "hasFile", self.hasFile )
        self.regionLabel.setProperty( "hasFile", self.hasFile )
        self.orTextLabel.setProperty( "hasFile", self.hasFile )
        self.dragTextLabel.setProperty( "hasFile", self.hasFile )


        # Apply style
        with open( self.region_style_path, "r" ) as stylesheet:
            self.uploadRegion.setStyleSheet( stylesheet.read() )
            self.regionSpacer.setStyleSheet( stylesheet.read() )

            # Icons
            self.fileIcon.setStyleSheet( stylesheet.read() )
            self.uploadFileIcon.setStyleSheet( stylesheet.read() )

            # Labels
            self.fileNameLabel.setStyleSheet( stylesheet.read() )
            self.regionLabel.setStyleSheet( stylesheet.read() )
            self.orTextLabel.setStyleSheet( stylesheet.read() )
            self.dragTextLabel.setStyleSheet( stylesheet.read() )

            # Buttons
            self.removeBtn.setStyleSheet( stylesheet.read() )
            self.browseBtn.setStyleSheet( stylesheet.read() )


    # Sets the state of the region's widgets
    def setWidgetStates( self ):
        # Set widget visibility
        self.setWidgetVisibility()

        # Set widget style
        self.setWidgetStyle()   


    # Uploaded file validation. Ensures file is not empty.
    def validateFile( self ):
        # Check file size
        fileSize = os.stat( self.filePathLabel.text() ).st_size

        # Handle empty file
        if ( fileSize == 0 ):
            print( "File: \"{}\" at location {} is empty.".format( self.filePathLabel.text(), self.fileNameLabel.text() ) )

            # TODO
            # Display empty error in this case
        
        # In this case, file is not empty so check for variable definitions and initializations (varies by calibration file)
        else:
            print( "File: \"{}\" at location {} has size: {} bytes.".format( self.filePathLabel.text(), self.fileNameLabel.text(), fileSize ) )

            # Upload region is for Vignetting
            if ( self.uploadRegion.objectName() == "uploadFileRegion_Vignetting" ):
                print( "Upload region is for vignetting. Validating..." )

                # Set RadianceData object path_vignetting here when valid vc file
                if ( self.vc_validation() == True ):
                    path_vignetting = self.filePathLabel.text()
                    print( "Set path_vignetting to path: {}".format( path_vignetting ) )
                    #TODO: reference obj. name

            # Upload region is for Fisheye Correction
            elif ( self.uploadRegion.objectName() == "uploadFileRegion_FisheyeCorrection" ):
                print( "Upload region is for fisheye correction. Validating..." )
                
                # Set RadianceData object path_fisheye here when valid fc file
                if ( self.fc_validation() == True ):
                    path_fisheye = self.filePathLabel.text()
                    print( "Set path_fisheye to path: {}".format( path_fisheye ) )
                    #TODO: reference obj. name

            # Upload region is for Camera Factor
            elif ( self.uploadRegion.objectName() == "uploadFileRegion_CameraFactor" ):
                print( "Upload region is for camera factor adjustment. Validating..." )

                # Set RadianceData object path_calfact here when valid cf file
                if ( self.cf_validation() == True ):
                    path_calfact = self.filePathLabel.text()
                    print( "Set path_calfact to path: {}".format( path_calfact ) )
                    #TODO: reference obj. name

            # Upload region is for ND Filter
            elif ( self.uploadRegion.objectName() == "uploadFileRegion_NeutralDensityFilter" ):
                print( "Upload region is for neutral density filter adjustment. Validating..." )
                
                # Set RadianceData object path_ndfilter here when valid nd file
                if ( self.nd_validation() == True ):
                    path_ndfilter = self.filePathLabel.text()
                    print( "Set path_ndfilter to path: {}".format( path_ndfilter ) )
                    #TODO: reference obj. name

            # Upload region is for camera response function file (.rsp for camera settings page)
            elif ( self.uploadRegion.objectName() == "uploadFileRegion_CameraResponseFileUpload" ):
                print( "Upload region is for camera response function. Validating..." )
                
                # Set RadianceData object path_rsp_fn here when valid rsp file
                if ( self.rsp_validation() == True ):
                    path_rsp_fn = self.filePathLabel.text()
                    print( "Set path_rsp_fn to path: {}".format( path_rsp_fn ) )
                    #TODO: reference obj. name

            else:
                print( "Upload region is unknown. self.uploadRegion.objectName(): {}".format( self.uploadRegion.objectName() ) )


    # Basic vignetting calibration (vc) file validation
    def vc_validation( self ):
        # Validation flags
        fileIsValid = False
        r_var_exists = False
        sf_var_exists = False
        ro_var_exists = False
        go_var_exists = False
        bo_var_exists = False

        # Check for vars in file
        with open( self.filePathLabel.text(), "r" ) as file:
            # loop through each line in file
            for num, line in enumerate( file, 1 ):
                # Remove spaces and tab characters, but maintain \n \r
                line = line.replace( " ", "" ).replace( "\t", "" )

                # Found an instance of var, print to console the value
                if ( "r=" in line ):
                    print( "Value of 'r' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    r_var_exists = True

                if ( "sf=" in line ):
                    print( "Value of 'sf' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    sf_var_exists = True
                    
                if ( "ro=" in line ):
                    print( "Value of 'ro' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    ro_var_exists = True
                    
                if ( "go=" in line ):
                    print( "Value of 'go' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    go_var_exists = True
                    
                if ( "bo=" in line ):
                    print( "Value of 'bo' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    bo_var_exists = True
                    
        # If all expected vars a represent, set flag to true
        if ( r_var_exists
             and sf_var_exists
             and ro_var_exists
             and go_var_exists
             and bo_var_exists ):
            fileIsValid = True

        return fileIsValid
    

    # Basic fisheye correction calibration (fc) file validation
    def fc_validation( self ):
        # Validation flags
        fileIsValid = False
        map_inverse_exists = False
        inp_r_exists = False
        mapped_r_exists = False
        rmult_exists = False
        xoff_exists = False
        yoff_exists = False
        ro_var_exists = False
        go_var_exists = False
        bo_var_exists = False
        rad_r_exists = False

        # Check for vars in file
        with open( self.filePathLabel.text(), "r" ) as file:
            # loop through each line in file
            for num, line in enumerate( file, 1 ):
                # Remove spaces and tab characters, but maintain \n \r
                line = line.replace( " ", "" ).replace( "\t", "" )

                # Found an instance of var, print to console the value
                if ( "map_inverse=" in line ):
                    print( "Value of 'map_inverse' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    map_inverse_exists = True

                if ( "inp_r=" in line ):
                    print( "Value of 'inp_r' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    inp_r_exists = True

                if ( "mapped_r=" in line ):
                    print( "Value of 'mapped_r' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    mapped_r_exists = True

                if ( "rmult=" in line ):
                    print( "Value of 'rmult' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    rmult_exists = True
                
                if ( "xoff=" in line ):
                    print( "Value of 'xoff' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    xoff_exists = True

                if ( "yoff=" in line ):
                    print( "Value of 'yoff' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    yoff_exists = True
                                   
                if ( "ro=" in line ):
                    print( "Value of 'ro' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    ro_var_exists = True
                    
                if ( "go=" in line ):
                    print( "Value of 'go' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    go_var_exists = True
                    
                if ( "bo=" in line ):
                    print( "Value of 'bo' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    bo_var_exists = True
                
                if ( "rad(r)=" in line ):
                    print( "Function definition for 'rad(r)' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    rad_r_exists = True
                    
        # If all expected vars a represent, set flag to true
        if ( map_inverse_exists 
             and inp_r_exists
             and mapped_r_exists
             and rmult_exists
             and xoff_exists
             and yoff_exists
             and ro_var_exists
             and go_var_exists
             and bo_var_exists
             and rad_r_exists ):
            fileIsValid = True

        return fileIsValid
    

    # Basic calibration factor calibration (cf) file validation
    def cf_validation( self ):
        # Validation flags
        fileIsValid = False
        ro_var_exists = False
        go_var_exists = False
        bo_var_exists = False

        # Check for vars in file
        with open( self.filePathLabel.text(), "r" ) as file:
            # loop through each line in file
            for num, line in enumerate( file, 1 ):
                # Remove spaces and tab characters, but maintain \n \r
                line = line.replace( " ", "" ).replace( "\t", "" )

                # Found an instance of var, print to console the value                   
                if ( "ro=" in line ):
                    print( "Value of 'ro' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    ro_var_exists = True
                    
                if ( "go=" in line ):
                    print( "Value of 'go' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    go_var_exists = True
                    
                if ( "bo=" in line ):
                    print( "Value of 'bo' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    bo_var_exists = True
                    
        # If all expected vars a represent, set flag to true
        if ( ro_var_exists
             and go_var_exists
             and bo_var_exists ):
            fileIsValid = True

        return fileIsValid
    

    # Basic neutral density filter calibration (nd) file validation
    def nd_validation( self ):
        # Validation flags
        fileIsValid = False
        ro_var_exists = False
        go_var_exists = False
        bo_var_exists = False

        # Check for vars in file
        with open( self.filePathLabel.text(), "r" ) as file:
            # loop through each line in file
            for num, line in enumerate( file, 1 ):
                # Remove spaces and tab characters, but maintain \n \r
                line = line.replace( " ", "" ).replace( "\t", "" )

                # Found an instance of var, print to console the value                   
                if ( "ro=" in line ):
                    print( "Value of 'ro' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    ro_var_exists = True
                    
                if ( "go=" in line ):
                    print( "Value of 'go' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    go_var_exists = True
                    
                if ( "bo=" in line ):
                    print( "Value of 'bo' found on line {}: {}".format( num, line.split( "=" )[1] ) )
                    bo_var_exists = True
                    
        # If all expected vars a represent, set flag to true
        if ( ro_var_exists
             and go_var_exists
             and bo_var_exists ):
            fileIsValid = True

        return fileIsValid
    

    # Basic camera response function (rsp) file validation
    def rsp_validation( self ):
        # Validation flags
        fileIsValid = False
        rgb_response_function_def_count = 0

        # Check for vars in file
        with open( self.filePathLabel.text(), "r" ) as file:
            # loop through each line in file
            for lineNum, line in enumerate( file, 1 ):
                # Replace tab characters with space character, but maintain other spaces. Remove newline
                line = line.replace( "\t", " " ).replace( "\n", "" )

                # Split line into a tokenized list, space-delimited
                tokenizedLine = line.split( " " )

                # If the first token of a line is not a digit, unexpected format             
                if ( tokenizedLine[0].isdigit == False ):
                    print( "Incorrect format on line {}: Expected a digit, instead token is: {}".format( lineNum, tokenizedLine[0] ) )

                    break
                    
                else:
                    # If the first value doesn't signify the order of the function (number of tokens following), unexpected format
                    # Subtract 2 from length check: 1 for first token that says the order of function, 1 more for the x^0 term
                    if ( ( len( tokenizedLine ) - 2 ) != int( tokenizedLine[0] ) ):
                        print( "Incorrect format on line {}: Expected the first token to signify number of tokens following-- {} != {}".format( lineNum, int( tokenizedLine[0] ), ( len(tokenizedLine) - 2 ) ) )
                    
                    # Valid response function definition found
                    else:
                        tokenizedLineAsFunction = self.formatRspAsFunction( tokenizedLine )
                        print( "Response function defintion found on line {}: {}".format( lineNum, tokenizedLineAsFunction ) )

                        rgb_response_function_def_count += 1

                        # Found a response function for all 3 colors
                        if ( rgb_response_function_def_count == 3 ):
                            print( "R, G, B response function definitions found on line {}".format( lineNum ) )

                            fileIsValid = True
                        
                        # File has more than 3 (RGB) response function definitions, unsure what they all go to
                        elif ( rgb_response_function_def_count > 3 ):
                            print( "Incorrect format: Too many response function definitions found." )

                            fileIsValid = False

        return fileIsValid
    

    # Formats a tokenized list as a list[0]-order polynomial
    def formatRspAsFunction( self, tokenizedList ):
        order = int( tokenizedList[0] )
        numTokens = len( tokenizedList )

        formattedString = ""

        for currentTerm in range( 1, numTokens ):
            # Token has a negative sign
            if ( tokenizedList[currentTerm].find( "-" ) != -1 ):
                formattedString += " - "

                # Remove the hyphen from the token
                tokenizedList[currentTerm].replace( "-", "" )

            else:
                # Token isn't first, so prepend an addition sign
                if ( currentTerm > 1 ):
                    formattedString += " + "

            # Print token
            formattedString += "({})".format( tokenizedList[currentTerm] )

            # Print x on 1st order or higher
            if ( currentTerm < ( numTokens - 1 ) ):
                formattedString += "x"
                
                # Have an exponent on terms 2nd order or higher
                if ( currentTerm < numTokens ):
                    formattedString += "^{}".format( order )

            order -= 1

        return formattedString