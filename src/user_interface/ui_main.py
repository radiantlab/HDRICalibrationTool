import os
from os.path import abspath

from PySide2.QtCore import ( QCoreApplication, QMetaObject, QSize, Qt )
from PySide2.QtGui import ( QFont, QIcon )
from PySide2.QtWidgets import *

from src.user_interface.upload_file_region import UploadFileRegion

from src.user_interface.image_uploader import ImageUploader

from src.progress_window import ProgressWindow

appVersion = "0.9"

class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")

        # Radiance Data vars
        self.diameter = 0
        self.crop_x_left = 0
        self.crop_y_down = 0
        self.view_angle_vertical = 0
        self.view_angle_horizontal = 0
        self.target_x_resolution = 0
        self.target_y_resolution = 0
        self.paths_ldr = [""]
        self.path_temp = os.path.abspath("./temp")
        self.path_errors = os.path.abspath("./errors")
        self.path_logs = os.path.abspath("./logs")
        self.path_rsp_fn = ""
        self.path_vignetting = ""
        self.path_fisheye = ""
        self.path_ndfilter = ""
        self.path_calfact = ""
        

        # Main Window stylesheet path
        self.main_styles_path = "./src/styles/main_styles.css"

        MainWindow.resize(1150, 840)
        MainWindow.setMinimumSize(QSize(1000, 500))
        MainWindow.setStyleSheet(u"background-color: #EAEAEA;")

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
        self.btn_help = QPushButton(self.sidebarMenuFrame)
        self.btn_help.setObjectName(u"btn_help")
        self.btn_help.setProperty( "isActivePage", False )
        self.btn_help.move(0,1000)
        self.btn_help.setMinimumSize(QSize(0, 40))
        self.btn_help.setIcon( QIcon("./src/assets/icons/help-icon.png") )

        # Settings button
        self.btn_settings = QPushButton( "Settings", self.sidebarMenuFrame)
        self.btn_settings.setObjectName( u"btn_settings" )
        self.btn_settings.setProperty( "isActivePage", False )
        self.btn_settings.setMinimumSize( QSize( 0, 52 ) )
        self.btn_settings.setGeometry(0,0, 200, 30)
        self.btn_settings.setIcon( QIcon("./src/assets/icons/settings-icon.png") )
        

        # Default active page
        self.activePage = self.btn_page_1

        self.btn_page_1.clicked.connect( lambda: self.setActivePage( self.btn_page_1 ) )
        self.btn_page_2.clicked.connect( lambda: self.setActivePage( self.btn_page_2 ) )
        self.btn_page_3.clicked.connect( lambda: self.setActivePage( self.btn_page_3 ) )
        self.btn_page_4.clicked.connect( lambda: self.setActivePage( self.btn_page_4 ) )
        
        # Link pipeline function to GO button
        self.btn_start_pipeline.clicked.connect( self.goButtonClicked )

        self.btn_help.clicked.connect( lambda: self.setActivePage( self.btn_help ) )
        self.btn_settings.clicked.connect( lambda: self.setActivePage( self.btn_settings ) )
        
        # Add page-routing buttons to sidebar
        self.sidebarMenuVLayout.addWidget( self.btn_page_1, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_page_2, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_page_3, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_page_4, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.btn_start_pipeline, stretch=1 )
        self.sidebarMenuVLayout.addWidget( self.start_pipeline_error_label, stretch=4 )
        self.sidebarMenuVLayout.addWidget( QWidget(), stretch=16 )
        self.sidebarMenuVLayout.addWidget( self.btn_help, stretch=1, alignment=Qt.AlignBottom )
        self.sidebarMenuVLayout.addWidget( self.btn_settings, stretch=2, alignment=Qt.AlignBottom )

        #displays curr app version in the left bottom corner
        appVersionLabel = "Version: {}".format( appVersion )
        self.versionLabel = QLabel( appVersionLabel )
        self.sidebarMenuVLayout.addWidget( self.versionLabel, stretch=1, alignment=Qt.AlignBottom )

        # Set style of sidebar menu buttons
        self.setButtonStyling()

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
        self.label_1 = QLabel(self.page_1)
        self.label_1.setObjectName(u"label_1")
        self.label_1.setStyleSheet(u"font: 40pt; color: #000;")
        self.label_1.setAlignment(Qt.AlignCenter)
        

        # Body text
        bodyTextFont = QFont()
        bodyTextFont.setPointSize( 16 )
       
        self.intro_para = QLabel( self.container_widget )
        self.intro_para.setAlignment(Qt.AlignTop)
        self.intro_para.setText("This tool was designed to automate the process of merging multiple LDR images together and generating an HDR image.")
        self.intro_para.setFont(bodyTextFont)
        self.intro_para.setStyleSheet( "border-top: 3px solid #6495ED;" )
        self.intro_para.setWordWrap( True )
        self.intro_para.adjustSize()

        self.intro_para_2 = QLabel( self.container_widget )
        self.intro_para_2.setOpenExternalLinks( True )
        paragraphText_2 = 'To read more about the process of generating an HDR image from LDR image input, see the research paper by Clotilde Pierson <a href = \"https://doi.org/10.1080/15502724.2019.1684319\">here.</a><br>'
        self.intro_para_2.setAlignment(Qt.AlignTop)
        self.intro_para_2.setText( paragraphText_2 )
        self.intro_para_2.setFont(bodyTextFont)
        self.intro_para_2.setStyleSheet( "border-top: 3px solid #6495ED;" )
        self.intro_para_2.setWordWrap( True )
        self.intro_para_2.adjustSize()

        self.intro_para_3 = QLabel( self.container_widget )
        self.intro_para_3.setAlignment(Qt.AlignTop)
        self.intro_para_3.setTextFormat(Qt.RichText)
        self.intro_para_3.setText("Things to note about current working version ["+ appVersion + "]:\n<ul>"
                                  "<li>This application requires that Radiance is on your PATH.</li>\n"
                                  "<li>This application assumes that the user already knows the settings of the camera that took the LDR images beforehand.</li>\n"
                                  "<li>This application performs no calculations to cull the LDR images based on exposure.</li>\n"
                                  "<li>Windows users must have the GNU package \"sed for windows\" installed and on the system PATH in order for view angles to be corrected.</li>\n</ul>")
        self.intro_para_3.setFont(bodyTextFont)
        self.intro_para_3.setStyleSheet( "border-top: 3px solid #6495ED;" )
        self.intro_para_3.setWordWrap( True )
        self.intro_para_3.adjustSize()

        self.intro_para_4 = QLabel( self.container_widget )
        self.intro_para_4.setAlignment(Qt.AlignTop)
        paragraphText_4 = "If you need any help with using this app, please see the help page.\n"
        self.intro_para_4.setText( paragraphText_4 )
        self.intro_para_4.setFont(bodyTextFont)
        self.intro_para_4.setStyleSheet( "border-top: 3px solid #6495ED;" )
        self.intro_para_4.setWordWrap( True )
        self.intro_para_4.adjustSize()

        # Add text to layout
        self.page_1_layout.addWidget( self.label_1 )
        self.page_1_layout.addWidget( self.intro_para )
        self.page_1_layout.addWidget( self.intro_para_2 )
        self.page_1_layout.addWidget( self.intro_para_3 )
        self.page_1_layout.addWidget( self.intro_para_4 )

        # -------------------------------------------------------------------------------------------------


        
        # ------------------------------------------------------------------------------------------------------------
        # Page 2 Setup
        self.page_2 = QWidget()
        self.page_2.setObjectName(u"page_2")
        self.page_2_Vlayout = QVBoxLayout(self.page_2)
        self.page_2_Vlayout.setObjectName(u"page_2_Vlayout")
        self.page_2_Vlayout.setSpacing(0)
        self.page_2_Vlayout.setContentsMargins(0, 0, 0, 0)
        
        self.uploader = ImageUploader()
        self.uploader.setObjectName("ImageUploader")

        self.page_2_Vlayout.addWidget( self.uploader, stretch=1 )
        
        # -------------------------------------------------------------------------------------------------



        # ----------------------------------------------------------------------------------------
        # Page 3 setup
        self.page_3 = QWidget()
        self.page_3.setObjectName(u"page_3")

        self.cameraSettingsPage = QVBoxLayout(self.page_3)
        self.cameraSettingsPage.setObjectName(u"cameraSettingsPage")
        self.cameraSettingsPage.setContentsMargins( 0, 0, 0, 0 )
        self.cameraSettingsPage.setSpacing( 4 )
        self.cameraSettingsPage.setMargin( 0 )

        
        # Cropping Area mdiArea
        self.mdiArea = QMdiArea(self.page_3)
        self.mdiArea.setObjectName("mdiArea_2")

        self.label_cd = QLabel(self.mdiArea)
        self.label_cd.setAlignment(Qt.AlignLeft)
        self.label_cd.setText("Cropping Dimensions")
        self.label_cd.setFont(bodyTextFont)
        self.label_cd.adjustSize()
        self.label_cd.setStyleSheet("font: 18pt \".AppleSystemUIFont\";")
        self.label_cd.setStyleSheet("background-color: #a0a0a0")
        self.label_cd.move(10,10)


        # Viewing angles mdiArea
        self.mdiArea_2 = QMdiArea(self.page_3)
        self.mdiArea_2.setObjectName("mdiArea_2")

        self.label_LVA = QLabel(self.mdiArea_2)
        self.label_LVA.setAlignment(Qt.AlignLeft)
        self.label_LVA.setText("Lens Viewing Angle")
        self.label_LVA.setFont(bodyTextFont)
        self.label_LVA.adjustSize()
        self.label_LVA.setStyleSheet("font: 18pt \".AppleSystemUIFont\";")
        self.label_LVA.setStyleSheet("background-color: #a0a0a0")
        self.label_LVA.move(10,10)
        self.label_LVA.raise_()


        # Output Dimensions mdiArea
        self.mdiArea_3 = QMdiArea(self.page_3)
        self.mdiArea_3.setObjectName("mdiArea_3")

        self.label_OID = QLabel(self.mdiArea_3)
        self.label_OID.setAlignment(Qt.AlignLeft)
        self.label_OID.setText("Output Image Dimensions")
        self.label_OID.setFont(bodyTextFont)
        self.label_OID.adjustSize()
        self.label_OID.setStyleSheet("font: 18pt \".AppleSystemUIFont\";")
        self.label_OID.setStyleSheet("background-color: #a0a0a0")
        self.label_OID.move(10,10)
        self.label_OID.raise_()


        # To keep consistent spacing
        x_column2 = 400

        # Cropping Dimension section

        # Fisheye View Diameter field
        self.label_md13 = QLabel(self.mdiArea)
        self.label_md13.setAlignment(Qt.AlignLeft)
        self.label_md13.setText("Fisheye View Diameter")
        self.label_md13.setStyleSheet("background-color: #a0a0a0")
        self.label_md13.move(10,70)

        self.inputField_fisheyeViewDiameter = QLineEdit(self.mdiArea)
        self.inputField_fisheyeViewDiameter.setText("")
        self.inputField_fisheyeViewDiameter.setObjectName("inputField_fisheyeViewDiameter")
        self.inputField_fisheyeViewDiameter.move(10,100)


        # X Crop Offset field
        self.label_md14 = QLabel(self.mdiArea)
        self.label_md14.setAlignment(Qt.AlignLeft)
        self.label_md14.setText("X Crop Offset")
        self.label_md14.setStyleSheet("background-color: #a0a0a0")
        self.label_md14.move(x_column2,70)

        self.inputField_xCropOffset = QLineEdit(self.mdiArea)
        self.inputField_xCropOffset.setText("")
        self.inputField_xCropOffset.setObjectName("inputField_xCropOffset")
        self.inputField_xCropOffset.move(x_column2,100)


        # Y Crop Offset field
        self.label_md15 = QLabel(self.mdiArea)
        self.label_md15.setAlignment(Qt.AlignLeft)
        self.label_md15.setText("Y Crop Offset")
        self.label_md15.setStyleSheet("background-color: #a0a0a0")
        self.label_md15.move(x_column2,140)

        self.inputField_yCropOffset = QLineEdit(self.mdiArea)
        self.inputField_yCropOffset.setText("")
        self.inputField_yCropOffset.setObjectName("inputField_yCropOffset")
        self.inputField_yCropOffset.move(x_column2,160)


        # Lens Viewing Angle section
        
        # View Angle Vertical field
        self.label_md21 = QLabel(self.mdiArea_2)
        self.label_md21.setAlignment(Qt.AlignLeft)
        self.label_md21.setText("View Angle Vertical")
        self.label_md21.setStyleSheet("background-color: #a0a0a0")
        self.label_md21.move(10,70)

        self.inputField_viewAngleVertical = QLineEdit(self.mdiArea_2)
        self.inputField_viewAngleVertical.setText("")
        self.inputField_viewAngleVertical.setObjectName("inputField_viewAngleVertical")
        self.inputField_viewAngleVertical.move(10,90)

        # View Angle Horizontal field
        self.label_md22 = QLabel(self.mdiArea_2)
        self.label_md22.setAlignment(Qt.AlignLeft)
        self.label_md22.setText("View Angle Horizontal")
        self.label_md22.setStyleSheet("background-color: #a0a0a0")
        self.label_md22.move(x_column2,70)

        self.inputField_viewAngleHorizontal = QLineEdit(self.mdiArea_2)
        self.inputField_viewAngleHorizontal.setText("")
        self.inputField_viewAngleHorizontal.setObjectName("inputField_viewAngleHorizontal")
        self.inputField_viewAngleHorizontal.move(x_column2,90)


        # Output Image Dimensions section

        # Output Resolution fields
        self.label_md31 = QLabel(self.mdiArea_3)
        self.label_md31.setAlignment(Qt.AlignLeft)
        self.label_md31.setText("HDR Image Output Resolution")
        self.label_md31.setStyleSheet("background-color: #a0a0a0")
        self.label_md31.move(10,70)

        # Output X Resolution
        self.inputField_outputXRes = QLineEdit(self.mdiArea_3)
        self.inputField_outputXRes.setText("")
        self.inputField_outputXRes.setObjectName("inputField_outputXRes")
        self.inputField_outputXRes.move(10,90)

        self.label_md31x = QLabel(self.mdiArea_3)
        self.label_md31x.setAlignment(Qt.AlignLeft)
        self.label_md31x.setText("x")
        self.label_md31x.setStyleSheet("background-color: #a0a0a0")
        self.label_md31x.move(149,92)

        # Output Y Resolution
        self.inputField_outputYRes = QLineEdit(self.mdiArea_3)
        self.inputField_outputYRes.setText("")
        self.inputField_outputYRes.setObjectName("inputField_outputYRes")
        self.inputField_outputYRes.move(160,90)


        # Area 4 upload .rsp file region
        self.rsp_uploadarea = UploadFileRegion("CameraResponseFileUpload", [900, 200], fileType=2 )


        # Add widgets to Layout
        self.cameraSettingsPage.addWidget( self.mdiArea, stretch=1 )
        self.cameraSettingsPage.addWidget( self.mdiArea_2, stretch=1 )
        self.cameraSettingsPage.addWidget( self.mdiArea_3, stretch=1 )
        self.cameraSettingsPage.addWidget( self.rsp_uploadarea, stretch=1 )
        
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
        self.calibrationPage.setMargin( 0 )
        

        # Vignetting region
        # Add widget: UploadFileRegionObject class object
        self.vc_UploadRegion = UploadFileRegion( "Vignetting", [900, 200], fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.vc_UploadRegion )

        # Fisheye correction region
        # Add widget: UploadFileRegionObject class object
        self.fc_UploadRegion = UploadFileRegion( "FisheyeCorrection", [900, 200], fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.fc_UploadRegion )

        # Camera factor region
        # Add widget: UploadFileRegionObject class object
        self.cf_UploadRegion = UploadFileRegion( "CameraFactor", [900, 200], fileType=1 )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( self.cf_UploadRegion )

        # Neutral Density Filter region
        # Add widget: UploadFileRegionObject class object
        self.nd_UploadRegion = UploadFileRegion( "NeutralDensityFilter", [900, 200], fileType=1 )

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

        # Help page
        self.page_help_layout = QGridLayout()
        self.page_help_layout.setObjectName("PageHelp_QGridLayout")

        self.page_help = QWidget()
        self.page_help.setObjectName( "page_help" )
        self.page_help.setLayout( self.page_help_layout )

        # Title label
        self.page_help_title_label = QLabel( "Help", self.page_help )
        self.page_help_title_label.setObjectName( "page_help_title_label" )
        self.page_help_title_label.setStyleSheet( "font: 40pt; color: black;" )
        self.page_help_title_label.setAlignment( Qt.AlignCenter )

        # Add widgets and layouts
        self.page_help_layout.addWidget( self.page_help_title_label )

        # -------------------------------------------------------------------------------------------------



        # -------------------------------------------------------------------------------------------------

        # Settings page
        self.page_settings_layout = QGridLayout()
        self.page_settings_layout.setObjectName("PageSettings_QGridLayout")

        self.page_settings = QWidget()
        self.page_settings.setObjectName( "page_settings" )
        self.page_settings.setLayout( self.page_settings_layout )

        # Title label
        self.page_settings_title_label = QLabel( "Settings", self.page_help )
        self.page_settings_title_label.setObjectName( "page_settings_title_label" )
        self.page_settings_title_label.setStyleSheet( "font: 40pt; color: black;" )
        self.page_settings_title_label.setAlignment( Qt.AlignCenter )

        # Add widgets and layouts
        self.page_settings_layout.addWidget( self.page_settings_title_label )

        # -------------------------------------------------------------------------------------------------



        # -------------------------------------------------------------------------------------------------

        # Add pages to multi-page view stackedWidget
        self.stackedWidget.addWidget(self.page_1)
        self.stackedWidget.addWidget(self.page_2)
        self.stackedWidget.addWidget(self.page_3)
        self.stackedWidget.addWidget(self.page_4)
        self.stackedWidget.addWidget(self.page_5)
        self.stackedWidget.addWidget(self.page_help)
        self.stackedWidget.addWidget(self.page_settings)

        self.verticalLayout_5.addWidget(self.stackedWidget)
        self.verticalLayout.addWidget(self.Content)

        MainWindow.setCentralWidget(self.centralwidget)

        self.retranslateUi(MainWindow)

        self.stackedWidget.setCurrentIndex(0)

        QMetaObject.connectSlotsByName(MainWindow)

        return
    

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"HDRI Calibration Tool", None))
        self.btn_page_1.setText(QCoreApplication.translate("MainWindow", u"Welcome", None))
        self.btn_page_2.setText(QCoreApplication.translate("MainWindow", u"Upload LDR images", None))
        self.btn_page_3.setText(QCoreApplication.translate("MainWindow", u"Camera Settings", None))
        self.btn_page_4.setText(QCoreApplication.translate("MainWindow", u"Upload Calibration", None))
        self.btn_start_pipeline.setText(QCoreApplication.translate("MainWindow", u"GO", None))
        self.btn_help.setText(QCoreApplication.translate("MainWindow", u"Help", None))
        self.btn_settings.setText(QCoreApplication.translate("MainWindow", u"Settings", None))
        self.label_1.setText(QCoreApplication.translate("MainWindow", u"Welcome!", None))
        self.label_1.setAlignment(Qt.AlignHCenter)


    # Sets the active page based on sidebar menu button clicks
    def setActivePage( self, newActiveBtn ):
        # Set attribute
        self.activePage = newActiveBtn

        self.btn_page_1.setProperty( "isActivePage", False )
        self.btn_page_2.setProperty( "isActivePage", False )
        self.btn_page_3.setProperty( "isActivePage", False )
        self.btn_page_4.setProperty( "isActivePage", False )
        self.btn_help.setProperty( "isActivePage", False )
        self.btn_settings.setProperty( "isActivePage", False )

        if ( newActiveBtn.objectName() == "btn_page_1" ):
            self.btn_page_1.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_page_2" ):
            self.btn_page_2.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_page_3" ):
            self.btn_page_3.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_page_4" ):
            self.btn_page_4.setProperty( "isActivePage", True )
        elif  ( newActiveBtn.objectName() == "btn_help" ):
            self.btn_help.setProperty( "isActivePage", True )
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


        # Do some basic validation here
        imageErrors = self.validateImages()
        if ( len( imageErrors ) > 0 ):
            print( "validateImages() failed!" )
            print( "imageErrors: %s", imageErrors )
            uploadedImagesValid = False
        
        cameraSettingsErrors = self.validateCameraSettings()
        if ( len( cameraSettingsErrors ) > 0 ):
            print( "validateCameraSettings() failed!" )
            print( "cameraSettingsErrors: %s", cameraSettingsErrors )
            cameraSettingsInputValid = False
        
        calibrationErrors = self.validateCalibration()
        if ( len( calibrationErrors ) > 0 ):
            print( "validateCalibration() failed!" )
            print( "calibrationErrors: %s", calibrationErrors )
            calibrationFilesValid = False

        # Check if validation steps all passed
        if ( uploadedImagesValid and cameraSettingsInputValid and calibrationFilesValid ):
            radianceObjectToSendIsValid = True


        # If Radiance object is valid, call pipeline
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

            self.openProgressWindow()


        # Insufficient information, tell user which info is missing
        else:
            self.goBtnErrorDialogOpen( imageErrors, cameraSettingsErrors, calibrationErrors )


        return
    

    # Creates a ProgressWindow object to start pipeline process
    def openProgressWindow( self ):
        self.progressWindow = ProgressWindow( self )


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

        imageUploader = self.page_2_Vlayout.itemAt(0).widget()
        uploadedImageCount = int( imageUploader.getTotalImagesCount() )

        print( "Total images uploaded: {}".format( uploadedImageCount ) )

        # Needs at least 1 image uploaded.
        if ( uploadedImageCount <= 0 ):     
            errors.append( "- No LDR images are uploaded. Please upload at least 1 LDR image. " )

        return errors

    
    # This function validates the camera settings page form input.
    # Returns a list of errors to print.
    def validateCameraSettings( self ):
        # Function error list to return
        errors = []

        # Flag defaults
        rspIsEnabled = True
        rspIsEmpty = True
        cropping_fisheyeDiameterIsEmpty = True
        cropping_xCropOffsetIsEmpty = True
        cropping_yCropOffsetIsEmpty = True
        lens_viewVerticalIsEmpty = True
        lens_viewHorizontalIsEmpty = True
        output_xResolutionIsEmpty = True
        output_yResolutionIsEmpty = True

        # Set flags
        rspIsEnabled = self.vc_UploadRegion.isEnabled
        if ( self.path_rsp_fn == "" ):
            rspIsEmpty = True

        # Set error messages
        if ( rspIsEnabled and rspIsEmpty ):
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
        cfIsEnabled = True
        cfIsEmpty = True
        fcIsEnabled = True
        fcIsEmpty = True
        ndIsEnabled = True
        ndIsEmpty = True

        # Set flags
        vcIsEnabled = self.vc_UploadRegion.isEnabled
        if ( self.path_vignetting == "" ):
            vcIsEmpty = True
        
        cfIsEnabled = self.cf_UploadRegion.isEnabled
        if ( self.path_calfact == "" ):
            cfIsEmpty = True

        fcIsEnabled = self.fc_UploadRegion.isEnabled
        if ( self.path_fisheye == "" ):
            fcIsEmpty = True

        ndIsEnabled = self.nd_UploadRegion.isEnabled
        if ( self.path_ndfilter == "" ):
            ndIsEmpty = True

        # Set error messages
        if (vcIsEnabled and vcIsEmpty ):
            errors.append( "- Vignetting .cal file missing: Upload or choose to omit this file. " )

        if (cfIsEnabled and cfIsEmpty ):
            errors.append( "- Camera Factor .cal file missing: Upload or choose to omit this file. " )

        if (fcIsEnabled and fcIsEmpty ):
            errors.append( "- Fisheye Correction .cal file missing: Upload or choose to omit this file. " )

        if (ndIsEnabled and ndIsEmpty ):
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