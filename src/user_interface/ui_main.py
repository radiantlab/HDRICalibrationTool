# Standard library imports
import os
from os.path import abspath
import json
import pathlib
import webbrowser

# Third-party library imports
from PySide6.QtCore import QCoreApplication, QMetaObject, QSize, Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication, QWidget, QPushButton, QCheckBox, QFrame, QVBoxLayout, QHBoxLayout, QLabel, QMessageBox, QStackedWidget, QMdiArea, QScrollArea, QLineEdit, QGridLayout

# Local module imports
from src.user_interface.upload_file_region import UploadFileRegion
from src.user_interface.image_uploader import ImageUploader
from src.progress_window import ProgressWindow
from src.helper import param2field, cast

appVersion = "0.1.x"

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        
        # Cache meta-options
        self.recover_cache = True
        self.generate_cache = True
        self.cache_path = pathlib.Path("./cache.json")

        # Settings meta-options
        self.settings_path = pathlib.Path("./settings.json")
        self.recoverSettings()

        # Radiance Data vars
        self.diameter = None
        self.crop_x_left = None
        self.crop_y_down = None
        self.view_angle_vertical = None
        self.view_angle_horizontal = None
        self.target_x_resolution = None
        self.target_y_resolution = None
        self.paths_ldr = [""]
        self.path_temp = os.path.abspath("./temp")
        self.path_errors = os.path.abspath("./errors")
        self.path_logs = os.path.abspath("./logs")
        self.path_rsp_fn = None
        self.path_vignetting = None
        self.path_fisheye = None
        self.path_ndfilter = None
        self.path_calfact = None
        
        if self.recover_cache == True:
            self.recoverCache()

        # Main Window stylesheet path
        self.main_styles_path = "./src/styles/main_styles.css"

        MainWindow.setStyleSheet(u"background-color: #EAEAEA;")

        # Get screen resolution scale factor for consistent sizing and scaling
        scale_factor = self.getScreenScaleFactor()

        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")

        self.verticalLayout = QVBoxLayout(self.centralwidget)
        self.verticalLayout.setSpacing(0)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.verticalLayout.setContentsMargins(0, 0, 0, 0)

        self.Content = QFrame(self.centralwidget)
        self.Content.setObjectName(u"Content")
        self.Content.setFrameShape(QFrame.NoFrame)
        self.Content.setFrameShadow(QFrame.Raised)

        self.mainWindowHLayout = QHBoxLayout( self.Content )
        self.mainWindowHLayout.setObjectName(u"mainWindowHLayout")
        self.mainWindowHLayout.setSpacing(0)
        self.mainWindowHLayout.setContentsMargins(0, 0, 0, 0)


        # Sidebar menu layout setup
        self.sidebarMenuFrame = QFrame( self.Content )
        self.sidebarMenuFrame.setObjectName(u"sidebarMenuFrame")
        self.sidebarMenuFrame.setStyleSheet(u"background-color: #A5A5A5;")

        self.sidebarMenuVLayout = QVBoxLayout( self.sidebarMenuFrame )
        self.sidebarMenuVLayout.setObjectName( "sidebarMenuVLayout" )
        self.sidebarMenuVLayout.setSpacing( 8 )
        self.sidebarMenuVLayout.setContentsMargins( 2, 2, 2, 2 )


        # ---------------------------------------------------------------------------------------
        # Setting up page-routing buttons in menu sidebar

        # Page 1 (Welcome landing page, isActive on app launch)
        self.btn_page_1 = QPushButton( self.sidebarMenuFrame )
        self.btn_page_1.setObjectName( "btn_page_1" )
        self.btn_page_1.setProperty( "isActivePage", True )
        self.btn_page_1.setMinimumSize( QSize( 0, 48 ) )

        # Page 2 (Upload LDR images)
        self.btn_page_2 = QPushButton( self.sidebarMenuFrame )
        self.btn_page_2.setObjectName( "btn_page_2" )
        self.btn_page_2.setProperty( "isActivePage", False )
        self.btn_page_2.setMinimumSize( QSize( 0, 48 ) )

        # Page 3 (Adjust camera settings)
        self.btn_page_3 = QPushButton( self.sidebarMenuFrame )
        self.btn_page_3.setObjectName( "btn_page_3" )
        self.btn_page_2.setProperty( "isActivePage", False )
        self.btn_page_3.setMinimumSize( QSize( 0, 48 ) )

        # Page 4 (Adjust calibration settings)
        self.btn_page_4 = QPushButton( self.sidebarMenuFrame )
        self.btn_page_4.setObjectName( "btn_page_4" )
        self.btn_page_4.setProperty( "isActivePage", False )
        self.btn_page_4.setMinimumSize( QSize( 0, 48 ) )

        # Start pipeline 'Go' button - Starts Radiance pipeline process
        self.btn_start_pipeline = QPushButton( self.sidebarMenuFrame )
        self.btn_start_pipeline.setObjectName( "btn_start_pipeline" )
        self.btn_start_pipeline.setProperty( "isActivePage", False )
        self.btn_start_pipeline.setMinimumSize( QSize( 0, 64 ) )

        # Go button error label
        self.start_pipeline_error_label = QLabel( self.sidebarMenuFrame )
        self.start_pipeline_error_label.setObjectName( "start_pipeline_error_label" )

        # Help button
        self.btn_help = QPushButton( "Help", self.sidebarMenuFrame )
        self.btn_help.setToolTip( "Opens the GitHub Wiki in the web browser" )
        self.btn_help.setObjectName(u"btn_help")
        self.btn_help.setProperty( "isActivePage", False )
        self.btn_help.setMinimumSize(QSize(0, 40))
        self.btn_help.setIcon( QIcon("./src/assets/icons/help-icon.png") )

        # Settings button
        self.btn_settings = QPushButton( "Settings", self.sidebarMenuFrame )
        self.btn_settings.setObjectName( u"btn_settings" )
        self.btn_settings.setProperty( "isActivePage", False )
        self.btn_settings.setMinimumSize( QSize( 0, 52 ) )
        self.btn_settings.setGeometry(0, 0, 200, 30)
        self.btn_settings.setIcon( QIcon("./src/assets/icons/settings-icon.png") )
        

        # Connect click events to sidebar buttons
        # Default active page
        self.activePage = self.btn_page_1

        self.btn_page_1.clicked.connect( lambda: self.setActivePage( self.btn_page_1 ) )
        self.btn_page_2.clicked.connect( lambda: self.setActivePage( self.btn_page_2 ) )
        self.btn_page_3.clicked.connect( lambda: self.setActivePage( self.btn_page_3 ) )
        self.btn_page_4.clicked.connect( lambda: self.setActivePage( self.btn_page_4 ) )
        
        self.btn_start_pipeline.clicked.connect( self.goButtonClicked )
        self.btn_help.clicked.connect( self.openWikiInBrowser )
        self.btn_settings.clicked.connect( lambda: self.setActivePage( self.btn_settings ) )
        

        # Add buttons to sidebar
        self.sidebarMenuVLayout.addWidget( self.btn_page_1, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_page_2, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_page_3, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_page_4, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_start_pipeline, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.start_pipeline_error_label, stretch=4 )
        self.sidebarMenuVLayout.addWidget( QWidget(), stretch=16 )
        self.sidebarMenuVLayout.addWidget( self.btn_help, stretch=1, alignment=Qt.AlignBottom )
        self.sidebarMenuVLayout.addWidget( self.btn_settings, stretch=2, alignment=Qt.AlignBottom )

        # Displays current app version in the bottom left corner
        appVersionLabel = "Version: {}".format( appVersion )
        self.versionLabel = QLabel( appVersionLabel )
        self.sidebarMenuVLayout.addWidget( self.versionLabel, stretch=1, alignment=Qt.AlignBottom )

        # ---------------------------------------------------------------------------------------

        
        self.frame_pages = QFrame(self.Content)
        self.frame_pages.setObjectName(u"frame_pages")
        self.frame_pages.setFrameShape(QFrame.StyledPanel)
        self.frame_pages.setFrameShadow(QFrame.Raised)

        self.verticalLayout_5 = QVBoxLayout(self.frame_pages)
        self.verticalLayout_5.setObjectName(u"verticalLayout_5")

        self.stackedWidget = QStackedWidget(self.frame_pages)
        self.stackedWidget.setObjectName(u"stackedWidget")


        self.mainWindowHLayout.addWidget( self.sidebarMenuFrame, stretch=2 )
        self.mainWindowHLayout.addWidget( self.frame_pages, stretch=9 )

        self.Content.setLayout( self.mainWindowHLayout )


        # -------------------------------------------------------------------------------------------------
        # Page 1 Setup

        self.page_1_layout = QVBoxLayout()
        self.page_1_layout.setObjectName("Page1_QVBoxLayout")

        # Create a container widget to hold the labels
        self.container_widget = QWidget()
        self.container_widget.setObjectName(u"container_widget")
        self.container_widget.setLayout(self.page_1_layout)

        # Set the container widget as the widget of the scroll area
        self.page_1 = QScrollArea()
        self.page_1.setObjectName(u"page_1")
        self.page_1.setWidget(self.container_widget)
        self.page_1.setWidgetResizable(True)

        # Welcome label
        self.welcome_label = QLabel(self.page_1)
        self.welcome_label.setObjectName(u"welcome_label")
        self.welcome_label.setAlignment(Qt.AlignCenter)
        

        # Body text
        self.intro_para = QLabel( self.container_widget )
        self.intro_para.setObjectName( "intro_para" )
        self.intro_para.setAlignment(Qt.AlignTop)
        self.intro_para.setText("This tool was designed to automate the process of merging multiple LDR images together and generating an HDR image.")
        self.intro_para.setWordWrap( True )

        self.intro_para_2 = QLabel( self.container_widget )
        self.intro_para_2.setObjectName( "intro_para_2" )
        self.intro_para_2.setOpenExternalLinks( True )
        paragraphText_2 = 'To read more about the process of generating an HDR image from LDR image input, see the research paper by Clotilde Pierson <a href = \"https://doi.org/10.1080/15502724.2019.1684319\">here.</a><br>'
        self.intro_para_2.setAlignment(Qt.AlignTop)
        self.intro_para_2.setText( paragraphText_2 )
        self.intro_para_2.setWordWrap( True )

        self.intro_para_3 = QLabel( self.container_widget )
        self.intro_para_3.setObjectName( "intro_para_3" )
        self.intro_para_3.setAlignment(Qt.AlignTop)
        self.intro_para_3.setTextFormat(Qt.RichText)
        self.intro_para_3.setText("Things to note about current working version ["+ appVersion + "]:\n<ul>"
                                  "<li>This application requires that Radiance and HDRgen are installed and on your PATH.</li>\n"
                                  "<li>This application assumes that the user already knows the settings of the camera that took the LDR images beforehand.</li>\n"
                                  "<li>This application performs no calculations to cull the LDR images based on exposure.</li>\n"
                                  "<li>Windows users must have the GNU package \"sed for windows\" installed and on the system PATH in order for view angles to be corrected.</li>\n</ul>")
        self.intro_para_3.setWordWrap( True )

        self.intro_para_4 = QLabel( self.container_widget )
        self.intro_para_4.setObjectName( "intro_para_4" )
        self.intro_para_4.setAlignment(Qt.AlignTop)
        paragraphText_4 = "If you need any help with using this app, please see the GitHub Wiki documentation page by clicking the \"Help\" button in the left sidebar.\n"
        self.intro_para_4.setText( paragraphText_4 )
        self.intro_para_4.setWordWrap( True )

        # Add text to layout
        self.page_1_layout.addWidget( self.welcome_label )
        self.page_1_layout.addWidget( self.intro_para )
        self.page_1_layout.addWidget( self.intro_para_2 )
        self.page_1_layout.addWidget( self.intro_para_3 )
        self.page_1_layout.addWidget( self.intro_para_4 )

        # -------------------------------------------------------------------------------------------------


        
        # ------------------------------------------------------------------------------------------------------------
        # Page 2 Setup - Upload Files
        self.page_2 = QWidget()
        self.page_2.setObjectName(u"page_2")
        self.page_2_Vlayout = QVBoxLayout(self.page_2)
        self.page_2_Vlayout.setObjectName(u"page_2_Vlayout")
        self.page_2_Vlayout.setSpacing(0)
        self.page_2_Vlayout.setContentsMargins(0, 0, 0, 0)

        # Flag for .cr2 (raw) image uploaded for merge: will use flag to disable .rsp file upload
        self.rawImageUploaded = False
        
        self.uploader = ImageUploader()
        self.uploader.setObjectName("ImageUploader")

        self.page_2_Vlayout.addWidget( self.uploader, stretch=1 )
        
        # -------------------------------------------------------------------------------------------------



        # ----------------------------------------------------------------------------------------
        # Page 3 setup - Camera Settings Form
        self.page_3 = QWidget()
        self.page_3.setObjectName(u"page_3")

        self.cameraSettingsPageV = QVBoxLayout( self.page_3 )
        self.cameraSettingsPageV.setObjectName(u"cameraSettingsPageV")
        self.cameraSettingsPageV.setContentsMargins( 0, 0, 0, 0 )
        self.cameraSettingsPageV.setSpacing( 4 )

        self.cameraSettingsPageH = QHBoxLayout()
        self.cameraSettingsPageH.setObjectName(u"cameraSettingsPageH")
        self.cameraSettingsPageH.setContentsMargins( 0, 0, 0, 0 )
        self.cameraSettingsPageH.setSpacing( 4 )
        
        # Cropping Region
        self.croppingLayout = QVBoxLayout()
        self.croppingRegion = QWidget()
        self.croppingRegion.setObjectName( "croppingRegion" )
        self.croppingRegion.setLayout( self.croppingLayout )

        self.label_CD = QLabel( "Cropping Dimensions", self.page_3 )
        self.label_CD.setObjectName( "label_CD" )
        self.label_CD.setAlignment(Qt.AlignLeft)
        self.label_CD.adjustSize()


        # Viewing angles
        self.viewingAngleLayout = QVBoxLayout()
        self.viewingAngleRegion = QWidget()
        self.viewingAngleRegion.setObjectName( "viewingAngleRegion" )
        self.viewingAngleRegion.setLayout( self.viewingAngleLayout )


        self.label_LVA = QLabel( "Lens Viewing Angle", self.page_3 )
        self.label_LVA.setObjectName( "label_LVA" )
        self.label_LVA.setAlignment(Qt.AlignLeft)
        self.label_LVA.adjustSize()


        # Output Dimensions
        self.outputDimLayout = QVBoxLayout()
        self.outputDimRegion = QWidget()
        self.outputDimRegion.setObjectName( "outputDimRegion" )
        self.outputDimRegion.setLayout( self.outputDimLayout )

        self.label_OID = QLabel( "Output Image Dimensions", self.page_3 )
        self.label_OID.setObjectName( "label_OID" )
        self.label_OID.setAlignment(Qt.AlignLeft)
        self.label_OID.adjustSize()


        # Cropping Dimension Region form input

        # Fisheye View Diameter field
        self.label_fisheyeViewDiameter = QLabel( "Fisheye View Diameter", self.page_3 )
        self.label_fisheyeViewDiameter.setObjectName( "label_fisheyeViewDiameter" )
        self.label_fisheyeViewDiameter.setAlignment(Qt.AlignBottom)

        self.inputField_fisheyeViewDiameter = QLineEdit( self.page_3 )
        self.inputField_fisheyeViewDiameter.setAlignment(Qt.AlignTop)
        self.inputField_fisheyeViewDiameter.setText(param2field(self.diameter))
        self.inputField_fisheyeViewDiameter.setObjectName("inputField_fisheyeViewDiameter")


        # X Crop Offset field
        self.label_xCropOffset = QLabel( "X Crop Offset", self.page_3 )
        self.label_xCropOffset.setObjectName( "label_xCropOffset" )
        self.label_xCropOffset.setAlignment(Qt.AlignBottom)

        self.inputField_xCropOffset = QLineEdit( self.page_3 )
        self.inputField_xCropOffset.setAlignment(Qt.AlignTop)
        self.inputField_xCropOffset.setText(param2field(self.crop_x_left))
        self.inputField_xCropOffset.setObjectName("inputField_xCropOffset")


        # Y Crop Offset field
        self.label_yCropOffset = QLabel( "Y Crop Offset", self.page_3 )
        self.label_yCropOffset.setObjectName( "label_yCropOffset" )
        self.label_yCropOffset.setAlignment(Qt.AlignBottom)

        self.inputField_yCropOffset = QLineEdit( self.page_3 )
        self.inputField_yCropOffset.setAlignment(Qt.AlignTop)
        self.inputField_yCropOffset.setText(param2field(self.crop_y_down))
        self.inputField_yCropOffset.setObjectName("inputField_yCropOffset")


        # Lens Viewing Angle region form input
        
        # View Angle Vertical field
        self.label_viewAngleVertical = QLabel( "View Angle Vertical", self.page_3 )
        self.label_viewAngleVertical.setObjectName( "label_viewAngleVertical" )
        self.label_viewAngleVertical.setAlignment(Qt.AlignBottom)

        self.inputField_viewAngleVertical = QLineEdit( self.page_3 )
        self.inputField_viewAngleVertical.setAlignment( Qt.AlignTop )
        self.inputField_viewAngleVertical.setText(param2field(self.view_angle_vertical))

        # View Angle Horizontal field
        self.label_viewAngleHorizontal = QLabel( "View Angle Horizontal", self.page_3 )
        self.label_viewAngleHorizontal.setObjectName( "label_viewAngleHorizontal" )
        self.label_viewAngleHorizontal.setAlignment(Qt.AlignBottom)

        self.inputField_viewAngleHorizontal = QLineEdit( self.page_3 )
        self.inputField_viewAngleHorizontal.setAlignment(Qt.AlignTop)
        self.inputField_viewAngleHorizontal.setText(param2field(self.view_angle_horizontal))
        self.inputField_viewAngleHorizontal.setObjectName("inputField_viewAngleHorizontal")


        # Output Image Dimensions region form input

        # Output X Resolution
        self.label_outputXRes = QLabel( "HDR Image Output X Resolution", self.page_3 )
        self.label_outputXRes.setObjectName( "label_outputXRes" )
        self.label_outputXRes.setAlignment(Qt.AlignBottom)

        self.inputField_outputXRes = QLineEdit( self.page_3 )
        self.inputField_outputXRes.setAlignment(Qt.AlignTop)
        self.inputField_outputXRes.setText(param2field(self.target_x_resolution))
        self.inputField_outputXRes.setObjectName("inputField_outputXRes")


        # Output Y Resolution
        self.label_outputYRes = QLabel( "HDR Image Output Y Resolution", self.page_3 )
        self.label_outputYRes.setObjectName( "label_outputYRes" )
        self.label_outputYRes.setAlignment(Qt.AlignBottom)

        self.inputField_outputYRes = QLineEdit(self.page_3)
        self.inputField_outputYRes.setAlignment(Qt.AlignTop)
        self.inputField_outputYRes.setText(param2field(self.target_y_resolution))
        self.inputField_outputYRes.setObjectName("inputField_outputYRes")


        # Upload .rsp file region
        self.rsp_UploadRegion = UploadFileRegion( "CameraResponseFunction", fileType=2 )


        # Add widgets to Layout
        self.croppingLayout.addWidget( self.label_CD, stretch=1 )
        self.croppingLayout.addWidget( self.label_fisheyeViewDiameter, stretch=1 )
        self.croppingLayout.addWidget( self.inputField_fisheyeViewDiameter, stretch=1 )
        self.croppingLayout.addWidget( self.label_xCropOffset, stretch=1 )
        self.croppingLayout.addWidget( self.inputField_xCropOffset, stretch=1 )
        self.croppingLayout.addWidget( self.label_yCropOffset, stretch=1 )
        self.croppingLayout.addWidget( self.inputField_yCropOffset, stretch=1 )

        self.viewingAngleLayout.addWidget( self.label_LVA, stretch=1 )
        self.viewingAngleLayout.addWidget( self.label_viewAngleVertical, stretch=1 )
        self.viewingAngleLayout.addWidget( self.inputField_viewAngleVertical, stretch=1 )
        self.viewingAngleLayout.addWidget( self.label_viewAngleHorizontal, stretch=1 )
        self.viewingAngleLayout.addWidget( self.inputField_viewAngleHorizontal, stretch=1 )

        self.outputDimLayout.addWidget( self.label_OID, stretch=1 )
        self.outputDimLayout.addWidget( self.label_outputXRes, stretch=1 )
        self.outputDimLayout.addWidget( self.inputField_outputXRes, stretch=1 )
        self.outputDimLayout.addWidget( self.label_outputYRes, stretch=1 )
        self.outputDimLayout.addWidget( self.inputField_outputYRes, stretch=1 )

        self.cameraSettingsPageH.addWidget( self.croppingRegion, stretch=1 )
        self.cameraSettingsPageH.addWidget( self.viewingAngleRegion, stretch=1 )
        self.cameraSettingsPageH.addWidget( self.outputDimRegion, stretch=1 )
        
        self.cameraSettingsPageV.addLayout( self.cameraSettingsPageH, stretch=3 )
        self.cameraSettingsPageV.addWidget( self.rsp_UploadRegion, stretch=1 )

        # -------------------------------------------------------------------------------------------------



        # -------------------------------------------------------------------------------------------------
        # Page 4 Setup
        self.page_4 = QWidget()
        self.page_4.setObjectName(u"page_4")


        # Upload file regions
        # Create new layout for self.page_4
        self.calibrationPage = QVBoxLayout( self.page_4 )
        self.calibrationPage.setObjectName( "calibrationPage" )
        self.calibrationPage.setContentsMargins( 0, 0, 0, 0 )
        self.calibrationPage.setSpacing( 4 )
        

        # Vignetting region
        # Add widget: UploadFileRegionObject class object
        self.vc_UploadRegion = UploadFileRegion( "Vignetting", fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.vc_UploadRegion )

        # Fisheye correction region
        # Add widget: UploadFileRegionObject class object
        self.fc_UploadRegion = UploadFileRegion( "FisheyeCorrection", fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.fc_UploadRegion )

        # Calibration factor region
        # Add widget: UploadFileRegionObject class object
        self.cf_UploadRegion = UploadFileRegion( "CalibrationFactor", fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.cf_UploadRegion )

        # Neutral Density Filter region
        # Add widget: UploadFileRegionObject class object
        self.nd_UploadRegion = UploadFileRegion( "NeutralDensityFilter", fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.nd_UploadRegion )

        # -------------------------------------------------------------------------------------------------



        # -------------------------------------------------------------------------------------------------
        # Page 5 setup

        self.page_5 = QWidget()
        self.page_5.setObjectName(u"page_5")

        self.verticalLayout_10 = QVBoxLayout(self.page_5)
        self.verticalLayout_10.setObjectName(u"verticalLayout_10")

        # -------------------------------------------------------------------------------------------------



        # -------------------------------------------------------------------------------------------------

        # Settings page
        self.page_settings = QWidget()
        self.page_settings.setObjectName( "page_settings" )
        
        # Title label
        self.page_settings_title_label = QLabel( "Settings", self.page_settings )
        self.page_settings_title_label.setObjectName( "page_settings_title_label" )
        self.page_settings_title_label.setAlignment( Qt.AlignTop )

        # Cache checkbox and label
        self.enableCacheCheckbox = QCheckBox( "Enable cache" )
        self.enableCacheCheckbox.setObjectName( "enable_cache_checkbox" )
        self.enableCacheCheckbox.clicked.connect( self.toggleCacheUsage )

        cacheCheckBoxLabelText = "When you start a pipeline, the app will cache (save) camera settings, response function file path, and calibration file paths."
        self.cacheCheckboxLabel = QLabel( cacheCheckBoxLabelText )
        self.cacheCheckboxLabel.setObjectName( "cache_checkbox_label" )
        self.cacheCheckboxLabel.setWordWrap( True )

        # Cache save button and label
        self.saveCacheButton = QPushButton("Manually save cache")
        self.saveCacheButton.setObjectName( "save_cache_button" )
        self.saveCacheButton.clicked.connect(self.saveCacheButtonClicked)

        cacheButtonLabelText = "Click here to save your cache without running the pipeline."
        self.cacheButtonLabel = QLabel( cacheButtonLabelText )
        self.cacheButtonLabel.setObjectName( "cache_button_label" )
        self.cacheButtonLabel.setWordWrap( True )
        

        # Save settings
        self.saveSettingsButton = QPushButton("Save settings")
        self.saveSettingsButton.setObjectName( "save_settings_button" )
        self.saveSettingsButton.clicked.connect(self.saveSettings)

        # Add widgets and layouts
        self.page_settings_Vlayout = QVBoxLayout()
        self.cacheButton_Hlayout = QHBoxLayout()
        self.cacheCheckbox_Hlayout = QHBoxLayout()

        self.cacheCheckbox_Hlayout.addWidget( self.enableCacheCheckbox, stretch=2 )
        self.cacheCheckbox_Hlayout.addWidget( QWidget(), stretch=3 )
        self.cacheCheckbox_Hlayout.addWidget( self.cacheCheckboxLabel, stretch=6 )
        self.cacheCheckbox_Hlayout.addWidget( QWidget(), stretch=3 )

        self.cacheButton_Hlayout.addWidget( self.saveCacheButton, stretch=2 )
        self.cacheButton_Hlayout.addWidget( QWidget(), stretch=3 )
        self.cacheButton_Hlayout.addWidget( self.cacheButtonLabel, stretch=6 )
        self.cacheButton_Hlayout.addWidget( QWidget(), stretch=3 )

        self.page_settings_Vlayout.addWidget( self.page_settings_title_label, stretch=1 )
        self.page_settings_Vlayout.addLayout( self.cacheCheckbox_Hlayout, stretch=3 )
        self.page_settings_Vlayout.addLayout( self.cacheButton_Hlayout, stretch=3 )
        self.page_settings_Vlayout.addWidget( self.saveSettingsButton )
        self.page_settings_Vlayout.addWidget( QWidget(), stretch=10 )

        self.page_settings.setLayout( self.page_settings_Vlayout )

        # -------------------------------------------------------------------------------------------------



        # -------------------------------------------------------------------------------------------------

        # Add pages to multi-page view stackedWidget
        self.stackedWidget.addWidget(self.page_1)
        self.stackedWidget.addWidget(self.page_2)
        self.stackedWidget.addWidget(self.page_3)
        self.stackedWidget.addWidget(self.page_4)
        self.stackedWidget.addWidget(self.page_5)
        self.stackedWidget.addWidget(self.page_settings)

        self.verticalLayout_5.addWidget(self.stackedWidget)
        self.verticalLayout.addWidget(self.Content)

        MainWindow.setCentralWidget(self.centralwidget)

        self.retranslateUi(MainWindow)

        self.stackedWidget.setCurrentIndex(0)

        QMetaObject.connectSlotsByName(MainWindow)

        # Set size of MainWindow based on screen resolution
        num_widgets = 4
        MainWindow.resize( 1060 * scale_factor, 800 * scale_factor )
        MainWindow.setMinimumSize( self.vc_UploadRegion.minimumSizeHint() * scale_factor * ( num_widgets + 1.8 ) )
        
        # Grab cached file paths, if they exist
        if self.path_rsp_fn is not None and self.path_rsp_fn != "":
            self.rsp_UploadRegion.setPath(self.path_rsp_fn)
        if self.path_vignetting is not None and self.path_vignetting != "":
            self.vc_UploadRegion.setPath(self.path_vignetting)
        if self.path_fisheye is not None and self.path_fisheye != "":
            self.fc_UploadRegion.setPath(self.path_fisheye)
        if self.path_ndfilter is not None and self.path_ndfilter != "":
            self.nd_UploadRegion.setPath(self.path_ndfilter)
        if self.path_calfact is not None and self.path_ndfilter != "":
            self.cf_UploadRegion.setPath(self.path_calfact)

        # Set checkbox states and apply upload file region styling
        if ( self.recover_cache == True ):
            # Settings cache enable checkbox
            self.enableCacheCheckbox.setChecked( True )

            # Upload file region disable checkboxes
            if ( self.path_rsp_fn == None ):
                self.rsp_UploadRegion.swapRegionInUseChkBox.setChecked( True )
                self.rsp_UploadRegion.swapRegionInUse()
            if ( self.path_vignetting == None ):
                self.vc_UploadRegion.swapRegionInUseChkBox.setChecked( True )
                self.vc_UploadRegion.swapRegionInUse()
            if ( self.path_fisheye == None ):
                self.fc_UploadRegion.swapRegionInUseChkBox.setChecked( True )
                self.fc_UploadRegion.swapRegionInUse()
            if ( self.path_calfact == None ):
                self.cf_UploadRegion.swapRegionInUseChkBox.setChecked( True )
                self.cf_UploadRegion.swapRegionInUse()
            if ( self.path_ndfilter == None ):
                self.nd_UploadRegion.swapRegionInUseChkBox.setChecked( True )
                self.nd_UploadRegion.swapRegionInUse()

        # Set styling
        self.setStyles()

        return
    

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"HDRI Calibration Tool", None))
        self.btn_page_1.setText(QCoreApplication.translate("MainWindow", u"Welcome", None))
        self.btn_page_2.setText(QCoreApplication.translate("MainWindow", u"Upload LDR images", None))
        self.btn_page_3.setText(QCoreApplication.translate("MainWindow", u"Camera Settings", None))
        self.btn_page_4.setText(QCoreApplication.translate("MainWindow", u"Upload Calibration", None))
        self.btn_start_pipeline.setText(QCoreApplication.translate("MainWindow", u"GO", None))
        self.welcome_label.setText(QCoreApplication.translate("MainWindow", u"Welcome!", None))
        self.welcome_label.setAlignment(Qt.AlignHCenter)


    # Sets the active page based on sidebar menu button clicks
    def setActivePage( self, newActiveBtn ):
        # Set attribute
        self.activePage = newActiveBtn

        self.btn_page_1.setProperty( "isActivePage", False )
        self.btn_page_2.setProperty( "isActivePage", False )
        self.btn_page_3.setProperty( "isActivePage", False )
        self.btn_page_4.setProperty( "isActivePage", False )
        self.btn_settings.setProperty( "isActivePage", False )

        if ( newActiveBtn.objectName() == "btn_page_1" ):
            self.btn_page_1.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_page_2" ):
            self.btn_page_2.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_page_3" ):
            self.btn_page_3.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_page_4" ):
            self.btn_page_4.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_settings" ):
            self.btn_settings.setProperty( "isActivePage", True )
        
        self.setButtonStyling()

        return

    
    # Set sidebar menu button styling
    def setButtonStyling( self ):
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_page_1.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_page_2.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_page_3.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_page_4.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_start_pipeline.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_help.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.btn_settings.setStyleSheet( stylesheet.read() )

        return

    
    # Sets the RadianceObject properties from the cropping values inputsection
    def setCroppingValues( self ):
        # print( "self.inputField_fisheyeViewDiameter.text(): {}".format(self.inputField_fisheyeViewDiameter.text()))
        # print( "self.inputField_xCropOffset.text(): {}".format(self.inputField_xCropOffset.text()))
        # print( "self.inputField_yCropOffset.text(): {}".format(self.inputField_yCropOffset.text()))
        
        # Fill Radiance object attribute values from form
        self.diameter = self.inputField_fisheyeViewDiameter.text()
        self.crop_x_left = self.inputField_xCropOffset.text()
        self.crop_y_down = self.inputField_yCropOffset.text()

        return


    # Sets the RadianceObject properties from the lens values inputsection
    def setLensValues( self ):
        # print( "self.inputField_viewAngleVertical.text(): {}".format(self.inputField_viewAngleVertical.text()))
        # print( "self.inputField_viewAngleHorizontal.text(): {}".format(self.inputField_viewAngleHorizontal.text()))

        # Fill Radiance object attribute values from form
        self.view_angle_vertical = self.inputField_viewAngleVertical.text()
        self.view_angle_horizontal = self.inputField_viewAngleHorizontal.text()

        return


    # Sets the RadianceObject properties from the output dimensions inputsection
    def setOutputDimensionValues( self ):
        # print( "self.inputField_outputXRes.text(): {}".format(self.inputField_outputXRes.text()))
        # print( "self.inputField_outputYRes.text(): {}".format(self.inputField_outputYRes.text()))

        # Fill Radiance object attribute values from form
        self.target_x_resolution = self.inputField_outputXRes.text()
        self.target_y_resolution = self.inputField_outputYRes.text()

        return


    # Click event function for the GO button
    def goButtonClicked( self ):
        # Flag to enable or disable GO button
        radianceObjectToSendIsValid = False

        # Validation flags for user input subsections
        uploadedImagesValid = False
        cameraSettingsInputValid = False
        calibrationFilesValid = False


        # Fill attributes from camera settings page
        self.ingestCameraSettingsFormData()

        # If any of the calibration file uploads were disabled, set the filepath to None
        if ( self.vc_UploadRegion.isEnabled == False ):
            print( "vc enabled=false")
            self.path_vignetting = None

        if ( self.cf_UploadRegion.isEnabled == False ):
            print( "cf enabled=false")
            self.path_calfact = None

        if ( self.fc_UploadRegion.isEnabled == False ):
            print( "fc enabled=false")
            self.path_fisheye = None

        if ( self.nd_UploadRegion.isEnabled == False ):
            print( "nd enabled=false")
            self.path_ndfilter = None

        if ( self.rsp_UploadRegion.isEnabled == False ):
            print( "rsp enabled=false")
            self.path_rsp_fn = None


        # Do some basic validation here
        imageErrors = self.validateImages()
        if ( len( imageErrors ) == 0 ):
            uploadedImagesValid = True
        else:
            print( "validateImages() failed!" )
            print( "imageErrors: ", imageErrors )
        
        cameraSettingsErrors = self.validateCameraSettings()
        if ( len( cameraSettingsErrors ) == 0 ):
            cameraSettingsInputValid = True
        else:
            print( "validateCameraSettings() failed!" )
            print( "cameraSettingsErrors: ", cameraSettingsErrors )
        
        calibrationErrors = self.validateCalibration()
        if ( len( calibrationErrors ) == 0 ):
            calibrationFilesValid = True
        else:
            print( "validateCalibration() failed!" )
            print( "calibrationErrors: ", calibrationErrors )
            

        # Check if validation steps all passed
        if ( uploadedImagesValid and cameraSettingsInputValid and calibrationFilesValid ):
            radianceObjectToSendIsValid = True

        # If Radiance object is valid, cache and call pipeline
        if ( radianceObjectToSendIsValid == True):
            print("-----------------------------------------------------")
            print("goBtnClicked, here is the RadianceData obj. being sent:\n")
            print("self.diameter: {}".format( self.diameter ))
            print("self.crop_x_left: {}".format( self.crop_x_left ))
            print("self.crop_y_down: {}".format( self.crop_y_down ))
            print("self.view_angle_vertical: {}".format( self.view_angle_vertical ))
            print("self.view_angle_horizontal: {}".format( self.view_angle_horizontal ))
            print("self.target_x_resolution: {}".format( self.target_x_resolution ))
            print("self.target_y_resolution: {}".format( self.target_y_resolution ))
            print("self.paths_ldr: {}".format( self.paths_ldr ))
            print("self.path_rsp_fn: {}".format( self.path_rsp_fn ))
            print("self.path_vignetting: {}".format( self.path_vignetting ))
            print("self.path_fisheye: {}".format( self.path_fisheye ))
            print("self.path_ndfilter: {}".format( self.path_ndfilter ))
            print("self.path_calfact: {}".format( self.path_calfact ))
            print("-----------------------------------------------------")
            
            if self.generate_cache:
                print("Caching...")
                self.saveCache()

            self.openProgressWindow()


        # Insufficient information, tell user which info is missing
        else:
            self.goBtnErrorDialogOpen( imageErrors, cameraSettingsErrors, calibrationErrors )


        return
    

    # Creates a ProgressWindow object to start pipeline process
    def openProgressWindow( self ):
        self.progressWindow = ProgressWindow( self )

        return


    # This function sets the RadianceDate object attributes that are taken as user input from the Camera Settings page form
    def ingestCameraSettingsFormData( self ):
        self.setCroppingValues()
        self.setLensValues()
        self.setOutputDimensionValues()

        return
    

    # This function verifies that there is at least 1 image uploaded.
    # Returns a list of errors to print.
    def validateImages( self ):
        # Set flag to pass or not
        errors = []

        # Reach imageUploader object
        imageUploader = self.page_2_Vlayout.itemAt(0).widget()
        uploadedImageCount = int( imageUploader.getTotalImagesCount() )

        #print( "Total images uploaded: {}".format( uploadedImageCount ) )

        # Needs at least 1 image uploaded.
        if ( uploadedImageCount <= 1 ):     
            errors.append( "- Too few LDR images uploaded. Please upload at least 2 LDR images. " )

        else:
            # Check if all file extensions match
            if ( self.checkAllExtMatch() == False ):
                errors.append( "- Not all images uploaded have the same file extension. Please upload images of the same file type. " )

        return errors

    
    # This function validates the camera settings page form input.
    # Returns a list of errors to print.
    def validateCameraSettings( self ):
        # Function error list to return
        errors = []

        # Flag defaults
        rspIsEnabled = True
        rspIsEmpty = True
        rspIsValid = False
        cropping_fisheyeDiameterIsEmpty = True
        cropping_xCropOffsetIsEmpty = True
        cropping_yCropOffsetIsEmpty = True
        lens_viewVerticalIsEmpty = True
        lens_viewHorizontalIsEmpty = True
        output_xResolutionIsEmpty = True
        output_yResolutionIsEmpty = True

        # Set flags
        rspIsEnabled = self.rsp_UploadRegion.isEnabled
        rspIsEmpty = not self.rsp_UploadRegion.hasFile
        rspIsValid = self.rsp_UploadRegion.fileIsValid

        if ( self.inputField_fisheyeViewDiameter.text() != "" ):
            cropping_fisheyeDiameterIsEmpty = False

        if ( self.inputField_xCropOffset.text() != "" ):
            cropping_xCropOffsetIsEmpty = False

        if ( self.inputField_yCropOffset.text() != "" ):
            cropping_yCropOffsetIsEmpty = False

        if ( self.inputField_viewAngleVertical.text() != "" ):
            lens_viewVerticalIsEmpty = False

        if ( self.inputField_viewAngleHorizontal.text() != "" ):
            lens_viewHorizontalIsEmpty = False

        if ( self.inputField_outputXRes.text() != "" ):
            output_xResolutionIsEmpty = False

        if ( self.inputField_outputYRes.text() != "" ):
            output_yResolutionIsEmpty = False

        # Set error messages
        if ( rspIsEnabled and not rspIsEmpty and not rspIsValid ):
            errors.append( "- Response Function .rsp file invalid: Upload the correct file or fix formatting (See Wiki). " )
        elif ( rspIsEnabled and rspIsEmpty ):
            errors.append( "- Response Function .rsp file missing: Upload or choose to omit this file. " )
        
        if ( cropping_fisheyeDiameterIsEmpty ):
            errors.append( "- Camera Input Settings: Fisheye view diameter field missing a value. " )
        
        if ( cropping_xCropOffsetIsEmpty ):
            errors.append( "- Camera Input Settings: X Crop Offset field missing a value. " )

        if ( cropping_yCropOffsetIsEmpty ):
            errors.append( "- Camera Input Settings: Y Crop Offset field missing a value. " )

        if ( lens_viewVerticalIsEmpty ):
            errors.append( "- Camera Input Settings: Lens view angle vertical field missing a value. " )

        if ( lens_viewHorizontalIsEmpty ):
            errors.append( "- Camera Input Settings: Lens view angle horizontal field missing a value. " )

        if ( output_xResolutionIsEmpty ):
            errors.append( "- Camera Input Settings: Output image X resolution field missing a value. " )

        if ( output_yResolutionIsEmpty ):
            errors.append( "- Camera Input Settings: Output image Y resolution field missing a value. " )

        return errors
    

    # This function validates the uploaded calibration files.
    # It checks if every calibration file is either disabled or has a file uploaded.
    # Returns a list of errors to print.
    def validateCalibration( self ):
        # Function error list to return
        errors = []

        # File upload flag defaults
        vcIsEnabled = True
        vcIsEmpty = True
        vcIsValid = False
        cfIsEnabled = True
        cfIsEmpty = True
        cfIsValid = False
        fcIsEnabled = True
        fcIsEmpty = True
        fcIsValid = False
        ndIsEnabled = True
        ndIsEmpty = True
        ndIsValid = False

        # Set flags
        vcIsEnabled = self.vc_UploadRegion.isEnabled
        vcIsEmpty = not self.vc_UploadRegion.hasFile
        vcIsValid = self.vc_UploadRegion.fileIsValid
        
        cfIsEnabled = self.cf_UploadRegion.isEnabled
        cfIsEmpty = not self.cf_UploadRegion.hasFile
        cfIsValid = self.cf_UploadRegion.fileIsValid

        fcIsEnabled = self.fc_UploadRegion.isEnabled
        fcIsEmpty = not self.fc_UploadRegion.hasFile
        fcIsValid = self.fc_UploadRegion.fileIsValid

        ndIsEnabled = self.nd_UploadRegion.isEnabled
        ndIsEmpty = not self.nd_UploadRegion.hasFile
        ndIsValid = self.nd_UploadRegion.fileIsValid

        print("vcIsEnabled: ", vcIsEnabled)
        print("vcIsEmpty: ", vcIsEmpty)
        print("vcIsValid: ", vcIsValid)

        # Set error messages
        if ( vcIsEnabled and not vcIsEmpty and not vcIsValid ):
            errors.append( "- Vignetting .cal file invalid: Upload the correct file or fix formatting (See Wiki). " )
        elif ( vcIsEnabled and vcIsEmpty ):
            errors.append( "- Vignetting .cal file missing: Upload or choose to omit this file. " )

        if ( cfIsEnabled and not cfIsEmpty and not cfIsValid ):
            errors.append( "- Calibration Factor .cal file invalid: Upload the correct file or fix formatting (See Wiki). " )
        elif ( cfIsEnabled and cfIsEmpty ):
            errors.append( "- Calibration Factor .cal file missing: Upload or choose to omit this file. " )

        if ( fcIsEnabled and not fcIsEmpty and not fcIsValid ):
            errors.append( "- Fisheye Correction .cal file invalid: Upload the correct file or fix formatting (See Wiki). " )
        elif ( fcIsEnabled and fcIsEmpty ):
            errors.append( "- Fisheye Correction .cal file missing: Upload or choose to omit this file. " )

        if ( ndIsEnabled and not ndIsEmpty and not ndIsValid ):
            errors.append( "- Neutral Denisty Filter .cal file invalid: Upload the correct file or fix formatting (See Wiki). " )
        elif ( ndIsEnabled and ndIsEmpty ):
            errors.append( "- Neutral Denisty Filter .cal file missing: Upload or choose to omit this file. " )

        return errors
    

    # Opens a message box to display errors preventing go button from being clicked
    def goBtnErrorDialogOpen( self, imageErrors, cameraSettingsErrors, calibrationErrors ):
        title = "HDRI Calibration Tool GO Button blocked: Missing info"
        message = "ATTENTION:\nRequired information is missing. Please see the error messages below before starting the HDR Image generation process:\n\n"

        message += '\n'.join( imageErrors )
        message += "\n"
        message += '\n'.join( calibrationErrors )
        message += "\n"
        message += '\n'.join( cameraSettingsErrors )
        message += "\n"

        QMessageBox.about( QWidget(), title, message )

        return


    # Recover cached inputs if they exist
    def recoverCache(self):
        # Make sure it exists
        if not self.cache_path.is_file():
            return
        
        # Create the JSON
        with open(self.cache_path, 'r') as cache_file:
            cache_json = json.load(cache_file)

        #Load parameters
        self.diameter       = cast(cache_json.get("diameter", None), int)
        self.crop_x_left    = cast(cache_json.get("crop_x_left", None), int)
        self.crop_y_down    = cast(cache_json.get("crop_y_down", None), int)
        self.view_angle_vertical    = cast(cache_json.get("view_angle_vertical", None), int)
        self.view_angle_horizontal  = cast(cache_json.get("view_angle_horizontal", None), int)
        self.target_x_resolution    = cast(cache_json.get("target_x_resolution", None), int)
        self.target_y_resolution    = cast(cache_json.get("target_y_resolution", None), int)
        self.path_rsp_fn        = cast(cache_json.get("path_rsp_fn", None), str)
        self.path_vignetting    = cast(cache_json.get("path_vignetting", None), str)
        self.path_fisheye       = cast(cache_json.get("path_fisheye", None), str)
        self.path_ndfilter      = cast(cache_json.get("path_ndfilter", None), str)
        self.path_calfact       = cast(cache_json.get("path_calfact", None), str)

        return
    

    # Save cache
    def saveCache(self):
        cache = {
            "diameter": self.diameter,
            "crop_x_left": self.crop_x_left,
            "crop_y_down": self.crop_y_down,
            "view_angle_vertical": self.view_angle_vertical,
            "view_angle_horizontal": self.view_angle_horizontal,
            "target_x_resolution": self.target_x_resolution,
            "target_y_resolution": self.target_y_resolution,
            "path_rsp_fn": self.path_rsp_fn,
            "path_vignetting": self.path_vignetting,
            "path_fisheye": self.path_fisheye,
            "path_ndfilter": self.path_ndfilter,
            "path_calfact": self.path_calfact
        }

        with open(self.cache_path, 'w') as cache_file:
            json.dump(cache, cache_file)

        return


    # This event function for the "Help" button opens the GitHub Wiki page in a new tab in the browser.
    def openWikiInBrowser( self ):
        wikiURL = "https://github.com/XiangyuLijoey/HDRICalibrationTool/wiki"
        # Try and open wiki in a new tab 
        webbrowser.open( wikiURL, new=2 )

        return
        

    # Toggles using the cache to pull file paths and form data
    def toggleCacheUsage( self ):
        self.generate_cache = not self.generate_cache
        self.recover_cache = not self.recover_cache

        # Cache settings now
        # cache settings function here

        return
    

    def recoverSettings(self):
        # Make sure settings exist
        if not self.settings_path.is_file():
            print("Error: No settings")
            return

        with open(self.settings_path , 'r') as settings_file:
            settings_json = json.load(settings_file)

        self.generate_cache = cast(settings_json.get("generate_cache", None), bool)
        self.recover_cache  = cast(settings_json.get("recover_cache", None), bool)


    def saveSettings(self):
        print("Saving settings...")
        settings = {
                "recover_cache":self.recover_cache,
                "generate_cache":self.generate_cache
                }
        with open(self.settings_path, 'w') as settings_file:
            json.dump(settings, settings_file)
        print("Settings saved")


    def saveCacheButtonClicked(self):
        self.ingestCameraSettingsFormData()
        self.saveCache()


    # Get the screen scale factor to resize widgets based on screen size
    def getScreenScaleFactor( self ):
        # Retrieve the screen resolution
        screen = QApplication.primaryScreen()
        screen_size = screen.size()

        # Calculate the scaling factor based on the screen width
        scaling_factor = screen_size.width() / 1920  # Adjust 1920 to your desired reference width

        return scaling_factor
    

    # Style the widgets
    def setStyles( self ):
        # Set style of sidebar menu buttons
        self.setButtonStyling()
        
        self.setWelcomePageStyles()

        self.setCameraSettingsStyles()

        self.setSettingsStyles()
            
        return
    

    # Set styling for the Welcome page
    def setWelcomePageStyles( self ):
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.welcome_label.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.intro_para.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.intro_para_2.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.intro_para_3.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.intro_para_4.setStyleSheet( stylesheet.read() )

        return
    

    # Style the Camera Settings form widgets
    def setCameraSettingsStyles( self ):
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.croppingRegion.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.viewingAngleRegion.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.outputDimRegion.setStyleSheet( stylesheet.read() )
        
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_CD.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_LVA.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_OID.setStyleSheet( stylesheet.read() )
        
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_fisheyeViewDiameter.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_xCropOffset.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_yCropOffset.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_viewAngleVertical.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_viewAngleHorizontal.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_outputXRes.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.label_outputYRes.setStyleSheet( stylesheet.read() )

        return
    

    # Set settings page styles
    def setSettingsStyles( self ):
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.page_settings_title_label.setStyleSheet( stylesheet.read() )

        with open( self.main_styles_path, "r" ) as stylesheet:
            self.enableCacheCheckbox.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.cacheCheckboxLabel.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.cacheButtonLabel.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.saveCacheButton.setStyleSheet( stylesheet.read() )
        with open( self.main_styles_path, "r" ) as stylesheet:
            self.saveSettingsButton.setStyleSheet( stylesheet.read() )

        return
    

    # Checks uploaded images list and makes sure all file extensions match
    def checkAllExtMatch( self ):
        allMatch = True

        # Early exit if list is empty
        if ( len(self.paths_ldr) == 0 ):
            allMatch = False

            return allMatch

        # Set key as first item in list's extension
        key = pathlib.Path( self.paths_ldr[0].lower() ).suffix

        # Check each image extension
        for ldrImage in self.paths_ldr:
            ext = pathlib.Path( ldrImage.lower() ).suffix

            if ( ext != key ):
                allMatch = False
                
                break
            else:
                continue

        return allMatch
