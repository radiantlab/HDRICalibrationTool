# Standard library imports
import os
import re
import ntpath

# Third-party library imports
from PySide6.QtWidgets import QWidget, QLabel, QPushButton, QVBoxLayout, QHBoxLayout, QCheckBox, QFileDialog, QApplication, QGridLayout
from PySide6.QtGui import QPixmap, QScreen
from PySide6.QtCore import Qt, QRect


# Creates a region to upload a file to, given an object name, and region size.
class UploadFileRegion( QWidget ):
    # fileType: Restricts file upload to: [0: any;  1: .cal;  2: .rsp]
    def __init__( self, regionName="DefaultLabel", fileType=0 ):
        QWidget.__init__(self)

        # Store input parameters as class attributes
        self.regionName = regionName
        self.fileType = fileType

        # Style path
        self.region_style_path = "./src/styles/upload_file_region_styles.css"

        # Visible region background
        self.uploadRegion = QWidget( self )

        # Create a layout for the region base
        layout = QGridLayout( self )
        layout.addWidget( self.uploadRegion )
        self.setLayout( layout )

        # Spacers for QVBox/QHBox layouts
        self.regionSpacer = QLabel( self )

        # Region label (Insert spaces before capital letters)
        regionNameWithSpaces = re.sub(r"(\w)([A-Z])", r"\1 \2", regionName)
        self.regionLabel = QLabel( regionNameWithSpaces, self )
        
        # File icon pixmap
        self.fileIcon = QLabel( self )
        self.fileIconPixmap = QPixmap( './src/assets/icons/blank-file-128.ico' )

        # Upload file icon pixmap
        self.uploadFileIcon = QLabel( self )
        self.uploadFileIconPixmap = QPixmap( './src/assets/icons/upload-file-multi.ico' )

        # File path label
        self.filePathLabel = QLabel( self )

        # File name label
        self.fileNameLabel = QLabel( self )

        # Create remove button for an uploaded file
        self.removeBtn = QPushButton( "Remove", self )

        # Browse file button
        self.browseBtn = QPushButton( "Browse", self )

        # Disable region label and checkbox
        self.swapRegionInUseLabel = QLabel( self )
        self.swapRegionInUseChkBox = QCheckBox( "Don't use", self )

        # Text labels for uploading
        self.dragTextLabel = QLabel( "drag file here to upload", self )
        self.orTextLabel = QLabel( "Or", self )

        # Init. flag that stores if region has an uploaded file.
        self.hasFile = False

        # Flag that stores if region is disabled.
        self.isEnabled = True

        # Flag that stores if the uploaded file is valid.
        self.fileIsValid = False

        # Adjust elements of object
        self.create()

            
    # Setting widget object names and pixmaps, connecting click event functions
    def create( self ):
        # -------------------------------------------------------------------------------------
        # Upload Region
        self.uploadRegion.setObjectName( "uploadFileRegion_{}".format( self.regionName ) )

        # Region Spacer Region
        self.regionSpacer.setObjectName( "regionSpacer" )

        # Region Label
        self.regionLabel.setObjectName( "regionLabel" )

        # File Icon
        self.fileIcon.setObjectName( "fileIcon" )

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

        # Browse Button
        self.browseBtn.setObjectName( "browseButton" )
        # Connect event to signal
        self.browseBtn.clicked.connect( self.browseFiles )

        # Disable region label
        self.swapRegionInUseLabel.setObjectName( "swapRegionInUseLabel" )
        self.swapRegionInUseLabel.setWordWrap( True )

        # If .cal file, set label text
        if ( self.fileType == 1 ):
            labelText = "This calibration step will be omitted from the pipeline process, which may produce unintended results."
            self.swapRegionInUseLabel.setText( labelText )
        
        # If .rsp file, set label text
        elif ( self.fileType == 2 ):
            labelText = "Radiance will attempt to automatically generate a response function file, which may fail or have unintended results."
            self.swapRegionInUseLabel.setText( labelText )

        # Default label text
        else:
            labelText = "File will not be used."
            self.swapRegionInUseLabel.setText( labelText )
            
        # Disable region checkbox
        self.swapRegionInUseChkBox.setObjectName( "swapRegionInUseChkBox" )
        self.swapRegionInUseChkBox.clicked.connect( self.swapRegionInUse )

        # Drag Text Label
        self.dragTextLabel.setObjectName( "dragTextLabel" )

        # Or Text Label
        self.orTextLabel.setObjectName( "orTextLabel" )

        # -------------------------------------------------------------------------------------

        # Set properties of the created widgets (states, styles, visibility)
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

        self.uploadIconHLayout.addWidget( self.uploadFileIcon, stretch=1, alignment=Qt.AlignCenter )
        self.uploadIconHLayout.addWidget( self.regionSpacer, stretch=1 )

        self.textVLayout.addWidget( self.regionSpacer, stretch=1 )
        self.textVLayout.addLayout( self.buttonLabelHLayout, stretch=2 )
        self.textVLayout.addWidget( self.regionSpacer, stretch=1 )

        self.buttonLabelHLayout.addWidget( self.regionSpacer, stretch=4, alignment=Qt.AlignRight )
        self.buttonLabelHLayout.addWidget( self.browseBtn, stretch=8, alignment=Qt.AlignRight )
        self.buttonLabelHLayout.addWidget( self.orTextLabel, stretch=3, alignment=Qt.AlignCenter )

        self.upperHLayout.addWidget( self.regionLabel, stretch=6 )
        self.upperHLayout.addWidget( self.swapRegionInUseLabel, stretch=8 )
        self.upperHLayout.addWidget( self.swapRegionInUseChkBox, stretch=1 )
        self.upperHLayout.addWidget( self.removeBtn, stretch=1 )

        # Add all inner layouts to the base layout for the region
        self.uploadRegion.setLayout( self.baseVLayout )

        return


    # Allow the dragging of image/text files onto region.
    def dragEnterEvent( self, event ):
        # Only accept dragEnterEvents if region does not have a file already
        if ( self.hasFile == False ):
            mime_data = event.mimeData()
            
            # Restrict to only allow 1 file to be dragged onto this region
            if ( mime_data.hasUrls() and len(mime_data.urls()) == 1 ):
                file_path = mime_data.urls()[0].toLocalFile()
                
                # Restrict to file type of region
                # .cal file
                if ( self.fileType == 1 ):
                    if file_path.endswith( ('.txt', '.cal') ):
                        event.acceptProposedAction()

                # .rsp file
                elif ( self.fileType == 2 ):
                    if file_path.endswith( ('.txt', '.rsp') ):
                        event.acceptProposedAction()
                    
        return


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
        
        return


    # Remove button click event
    def removeBtnClicked( self ):
        print( "Removing uploaded file: {} from path: {}".format( self.fileNameLabel.text(), self.filePathLabel.text() ) )

        # Clear Main Window path for the file
        self.clearMainWindowObjFilePath()

        # Reset widget to default
        self.resetWidgetProperties()

        return

    
    # Region checkbox click event
    def swapRegionInUse( self ):
        # Swap flag value
        self.isEnabled = not self.isEnabled

        if ( self.isEnabled == True ):
            print( "Enabling upload file region: {}".format( self.regionLabel.text() ) )
            self.filePathLabel.setText( "" )

        else:
            print( "Disabling upload file region: {}".format( self.regionLabel.text() ) )

        self.setWidgetProperties()
        
        return

   
    # Reset the widget to the default properties
    def resetWidgetProperties( self ):
        # Set flags
        self.hasFile = False
        self.isEnabled = True
        self.fileIsValid = False

        # Clear file name/path labels' text
        self.fileNameLabel.setText("")
        self.filePathLabel.setText("")

        # Set widget properties
        self.setWidgetProperties()

        return


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

        return


    # Function to handle an uploaded file from any method (drag+drop, click-to-browse) and adjust styling and visibility
    def fileUploadedEvent( self ):
        if ( self.hasFile ):
            print( "self.filePathLabel: {}".format( self.filePathLabel.text() ) )

            self.validateFile()

            self.setWidgetProperties()
        
        else:
            print( "{} has no file!".format( self.regionName ) )
            
        return


    # Sets the visibility of widgets based on the region having a file or not
    def setWidgetVisibility( self ):
        # Always
        self.filePathLabel.hide()

        # Upload File Region is enabled
        if ( self.isEnabled == True ):
            self.swapRegionInUseLabel.hide()
            self.dragTextLabel.show()
            self.orTextLabel.show()
            self.uploadFileIcon.show()
            self.browseBtn.show()
        
        else:
            self.swapRegionInUseLabel.show()
            self.dragTextLabel.hide()
            self.orTextLabel.hide()
            self.uploadFileIcon.hide()
            self.browseBtn.hide()
            return


        # Upload File Region has a file uploaded
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

            # Hide checkbox
            self.swapRegionInUseChkBox.hide()
        
        # No file uploaded
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

            # Show checkbox
            self.swapRegionInUseChkBox.show()

        return
    

    # Sets the style of widgets
    # Style is affected by the checkbox to disable the region, as well as if the file has a file uploaded or not.
    def setWidgetStyle( self ):
        # Set property for stylesheet to apply correct style
        self.uploadRegion.setProperty( "hasFile", self.hasFile )
        self.uploadRegion.setProperty( "isEnabled", self.isEnabled )
        self.uploadRegion.setProperty( "fileIsValid", self.fileIsValid )

        self.regionSpacer.setProperty( "hasFile", self.hasFile )
        self.regionSpacer.setProperty( "isEnabled", self.isEnabled )
        self.regionSpacer.setProperty( "fileIsValid", self.fileIsValid )


        # Icons
        self.fileIcon.setProperty( "hasFile", self.hasFile )
        self.fileIcon.setProperty( "isEnabled", self.isEnabled )
        self.fileIcon.setProperty( "fileIsValid", self.fileIsValid )

        self.uploadFileIcon.setProperty( "hasFile", self.hasFile )
        self.uploadFileIcon.setProperty( "isEnabled", self.isEnabled )


        # Labels
        self.fileNameLabel.setProperty( "hasFile", self.hasFile )
        self.fileNameLabel.setProperty( "isEnabled", self.isEnabled )
        self.fileNameLabel.setProperty( "fileIsValid", self.fileIsValid )

        self.regionLabel.setProperty( "hasFile", self.hasFile )
        self.regionLabel.setProperty( "isEnabled", self.isEnabled )
        self.regionLabel.setProperty( "fileIsValid", self.fileIsValid )

        self.orTextLabel.setProperty( "hasFile", self.hasFile )
        self.orTextLabel.setProperty( "isEnabled", self.isEnabled )

        self.dragTextLabel.setProperty( "hasFile", self.hasFile )
        self.dragTextLabel.setProperty( "isEnabled", self.isEnabled )

        self.swapRegionInUseLabel.setProperty( "isEnabled", self.isEnabled )


        # Buttons and checkboxes
        self.browseBtn.setProperty( "isEnabled", self.isEnabled )

        self.swapRegionInUseChkBox.setProperty( "isEnabled", self.isEnabled )


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
            self.swapRegionInUseLabel.setStyleSheet( stylesheet.read() )

            # Buttons
            self.removeBtn.setStyleSheet( stylesheet.read() )
            self.browseBtn.setStyleSheet( stylesheet.read() )

            # Checkbox
            self.swapRegionInUseChkBox.setStyleSheet( stylesheet.read() )
        
        return


    # Sets the states of widgets
    def setWidgetStates( self ):
        self.swapRegionInUseChkBox.setEnabled( True )

        if ( self.isEnabled == True ):
            self.browseBtn.setEnabled( True )
            self.setAcceptDrops( True )
            self.swapRegionInUseChkBox.setChecked( False )

        else:
            self.browseBtn.setEnabled( False )
            self.setAcceptDrops( False )
            self.swapRegionInUseChkBox.setChecked( True )

        return


    # Sets the visibility, states, and styling of the region's widgets
    def setWidgetProperties( self ):
        # Set widget visibility
        self.setWidgetVisibility()

        # Set widget states
        self.setWidgetStates()

        # Set widget style
        self.setWidgetStyle()

        # Adjust widget scaling based off of screen size
        self.adjustScaling()

        return


    # Returns the type of calibration/response file this region is for (e.g. vignetting, calibration factor, response function, etc.)
    # Does NOT return the file's extension (.cal, .rsp, .txt, etc.)
    def getFileType( self ):
        if ( self.uploadRegion.objectName() == "uploadFileRegion_Vignetting" ):
            return "Vignetting"
        elif ( self.uploadRegion.objectName() == "uploadFileRegion_FisheyeCorrection" ):
            return "FisheyeCorrection"
        elif ( self.uploadRegion.objectName() == "uploadFileRegion_CalibrationFactor" ):
            return "CalibrationFactor"
        elif ( self.uploadRegion.objectName() == "uploadFileRegion_NeutralDensityFilter" ):
            return "NeutralDensityFilter"
        elif ( self.uploadRegion.objectName() == "uploadFileRegion_CameraResponseFunction" ):
            return "CameraResponseFunction"
        else:
            #print("upload_file_region doesn't have a valid calibration or response function file type. self.uploadRegion.objectName(): {}\n".format( self.uploadRegion.objectName() ) )
            return None


    # Uploaded file validation. Ensures file is not empty.
    def validateFile( self ):
        # Check file size
        fileSize = os.stat( self.filePathLabel.text() ).st_size

        # Handle empty file
        if ( fileSize == 0 ):
            print( "File: \"{}\" at location {} is empty.".format( self.filePathLabel.text(), self.fileNameLabel.text() ) )
        
        # In this case, file is not empty so check for variable definitions and initializations (varies by calibration file)
        else:
            print( "File: \"{}\" at location {} has size: {} bytes.".format( self.filePathLabel.text(), self.fileNameLabel.text(), fileSize ) )

            fileType = self.getFileType()

            # Reach Ui_MainWindow object
            uiObject = self.parent().parent().parent().parent().parent().parent().ui

            # Upload region is for Vignetting
            if ( fileType == "Vignetting" ):
                print( "Upload region is for vignetting. Validating..." )

                # Set RadianceData object path_vignetting here when valid vc file
                if ( self.vc_validation() == True ):
                    self.fileIsValid = True
                    uiObject.path_vignetting = self.filePathLabel.text()
                    print( "Valid file. Set path_vignetting to path: {}".format( self.filePathLabel.text() ) )
                
                else:
                    print( "Invalid vignetting file: {}".format( self.filePathLabel.text() ) )


            # Upload region is for Fisheye Correction
            elif ( fileType == "FisheyeCorrection" ):
                print( "Upload region is for fisheye correction. Validating..." )
                
                # Set RadianceData object path_fisheye here when valid fc file
                if ( self.fc_validation() == True ):
                    self.fileIsValid = True
                    uiObject.path_fisheye = self.filePathLabel.text()
                    print( "Set path_fisheye to path: {}".format( self.filePathLabel.text() ) )

                else:
                    print( "Invalid fisheye correction file: {}".format( self.filePathLabel.text() ) )


            # Upload region is for Calibration Factor
            elif ( fileType == "CalibrationFactor" ):
                print( "Upload region is for calibration factor adjustment. Validating..." )

                # Set RadianceData object path_calfact here when valid cf file
                if ( self.cf_validation() == True ):
                    self.fileIsValid = True
                    uiObject.path_calfact = self.filePathLabel.text()
                    print( "Set path_calfact to path: {}".format( self.filePathLabel.text() ) )

                else:
                    print( "Invalid calibration factor file: {}".format( self.filePathLabel.text() ) )


            # Upload region is for ND Filter
            elif ( fileType == "NeutralDensityFilter" ):
                print( "Upload region is for neutral density filter adjustment. Validating..." )
                
                # Set RadianceData object path_ndfilter here when valid nd file
                if ( self.nd_validation() == True ):
                    self.fileIsValid = True
                    uiObject.path_ndfilter = self.filePathLabel.text()
                    print( "Set path_ndfilter to path: {}".format( self.filePathLabel.text() ) )
                
                else:
                    print( "Invalid ND filter file: {}".format( self.filePathLabel.text() ) )


            # Upload region is for camera response function file (.rsp for camera settings page)
            elif ( fileType == "CameraResponseFunction" ):
                print( "Upload region is for camera response function. Validating..." )
                
                # Set RadianceData object path_rsp_fn here when valid rsp file
                if ( self.rsp_validation() == True ):
                    self.fileIsValid = True
                    uiObject.path_rsp_fn = self.filePathLabel.text()
                    print( "Set path_rsp_fn to path: {}".format( self.filePathLabel.text() ) )

                else:
                    print( "Invalid response function file: {}".format( self.filePathLabel.text() ) )


            # Default
            else:
                print( "Upload region is unknown. self.uploadRegion.objectName(): {}".format( self.uploadRegion.objectName() ) )

        return


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
        if ( map_inverse_exists and
             inp_r_exists and
             mapped_r_exists and
             rmult_exists and
             xoff_exists and
             yoff_exists and
             ro_var_exists and
             go_var_exists and
             bo_var_exists and
             rad_r_exists ):
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
        if ( ro_var_exists and
             go_var_exists and
             bo_var_exists ):
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
                tokenizedList[currentTerm] = tokenizedList[currentTerm].replace( "-", "" )

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


    # Clears the correct MainWindow Radiance object file path the region is for to empty string ""
    def clearMainWindowObjFilePath( self ):
        fileType = self.getFileType()

        # Reach Ui_MainWindow object
        uiObject = self.parent().parent().parent().parent().parent().parent().ui

        if ( fileType == "Vignetting" ):
            uiObject.path_vignetting = ""
            print( "Cleared path_vignetting and set path to empty string: \"\"\n" )

        elif ( fileType == "FisheyeCorrection" ):
            uiObject.path_fisheye = ""
            print( "Cleared path_fisheye and set path to empty string: \"\"\n" )
        
        elif ( fileType == "CalibrationFactor" ):
            uiObject.path_calfact = ""
            print( "Cleared path_calfact and set path to empty string: \"\"\n" )

        elif ( fileType == "NeutralDensityFilter" ):
            uiObject.path_ndfilter = ""
            print( "Cleared path_ndfilter and set path to empty string: \"\"\n" )

        elif ( fileType == "CameraResponseFunction" ):
            uiObject.path_rsp_fn = ""
            print( "Cleared path_rsp_fn and set path to empty string: \"\"\n" )

        else:
            print( "Tried to clear an unknown file type. fileType: {}\n".format( fileType ) )
        

        return
    

    # Sets the file from some non-event mechanism
    def setPath( self, newPath ):
        self.hasFile = True
        self.filepath = newPath

        # Set filePathLabel
        self.filePathLabel.setText( self.filepath )

        # Set fileNameLabel and show
        filename = self.getFilenameFromPath( self.filepath )
        self.fileNameLabel.setText( filename )

        self.fileUploadedEvent()
        
        print(f"Default path set for {self.regionName}: {self.filepath}")


    # Rescales widgets based off of the screen size
    def adjustScaling(self):  
        # Retrieve the scaling factor
        scaling_factor = self.getScreenScalingFactor()
        
        # Calculate the desired icon size based on the scaling factor
        file_icon_size = int( 84 * scaling_factor )
        upload_file_icon_size = int( 52 * scaling_factor )

        # Resize the icon pixmap to the desired size
        file_icon_pixmap_resized = self.fileIconPixmap.scaledToWidth( file_icon_size, Qt.SmoothTransformation )
        upload_file_icon_pixmap_resized = self.uploadFileIconPixmap.scaledToWidth( upload_file_icon_size, Qt.SmoothTransformation )
        
        # Set the resized pixmap to the QLabel
        self.fileIcon.setPixmap( file_icon_pixmap_resized )
        self.uploadFileIcon.setPixmap( upload_file_icon_pixmap_resized )

        return


    # Calculates the scale factor for widgets based off of the screen size
    def getScreenScalingFactor(self):
        # Retrieve the screen resolution
        screen = QApplication.primaryScreen()
        screen_size = screen.size()
        
        # Calculate the scaling factor based on the screen width
        scaling_factor = screen_size.width() / 1920
        
        return scaling_factor
    

    # Sets the state of the region based on the ui_main self.rawImageUploaded flag. This is to disable uploading .rsp files when using .cr2 images.
    def setRspRegionState( self ):
        # Reach Ui_MainWindow object
        uiObject = self.parent().parent().parent().parent().parent().parent().ui

        self.isEnabled = not uiObject.rawImageUploaded

        self.setWidgetProperties()

        return
