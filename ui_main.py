# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'ui_mainrvpJdh.ui'
##
## Created by: Qt User Interface Compiler version 5.14.1
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide2.QtCore import (QCoreApplication, QMetaObject, QObject, QPoint,
    QRect, QSize, QUrl, Qt)
from PySide2.QtGui import (QBrush, QColor, QConicalGradient, QCursor, QFont,
    QFontDatabase, QIcon, QLinearGradient, QPalette, QPixmap,
    QRadialGradient)
from PySide2.QtWidgets import *
from PyQt5 import QtWidgets
from PyQt5 import QtCore, QtGui
from PyQt5.QtWidgets import QApplication, QMainWindow, QFileDialog
import sys
import os

# For file name extraction
import ntpath

# Creates a region to upload a file to, given input coords, region size, and a region color.
class UploadFileRegion( QWidget ):
    # regionCoords[0]: x
    # regionCoords[1]: y
    # regionSize[0]: width
    # regionSize[1]: height
    def __init__( self, regionName="DefaultLabel", regionCoords=[0,0], regionSize=[128, 128] ):
        QWidget.__init__(self)

        # Store input parameters as class attributes
        self.regionName = regionName
        self.regionXPosition = regionCoords[0]
        self.regionYPosition = regionCoords[1]
        self.regionWidth = regionSize[0]
        self.regionHeight = regionSize[1]

        # Visible region background
        self.uploadRegion = QLabel(self)
        
        # Region label
        self.regionLabel = QLabel( regionName, self )
        
        # File icon pixmap
        self.fileIcon = QLabel( self )
        self.pixmap = QPixmap( './assets/blank-file-128.ico' )

        # File path label
        self.filePathLabel = QLabel( self )

        # File name label
        self.fileNameLabel = QLabel( self )

        # Create remove button for an uploaded file
        self.removeBtn = QPushButton( "Remove", self )


        # Allow dropping files in this region
        self.setAcceptDrops( True )

        # Init. flag that stores if region has an uploaded file.
        self.hasFile = False

        # Adjust elements of object
        self.create()


    def create( self ):
        # Stylesheet path
        stylesheetPath = "./styles/upload_file_region_styles.css"

        # -------------------------------------------------------------------------------------
        # Upload Region ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

        # Set object name
        self.uploadRegion.setObjectName( "UploadFileRegion_{}".format( self.regionName ) )

        # Set style
        with open(stylesheetPath, "r") as stylesheet:
            self.uploadRegion.setStyleSheet( stylesheet.read() )

        # Set size
        self.uploadRegion.setGeometry( QRect( self.regionXPosition, self.regionYPosition, self.regionWidth, self.regionHeight ) )

        # -------------------------------------------------------------------------------------
        # Region Label

        # Set object name
        self.regionLabel.setObjectName( "UploadFileRegionLabel" )

        # Move
        self.regionLabel.move( self.regionXPosition, self.regionYPosition )

        # Set style
        with open(stylesheetPath, "r") as stylesheet:
            self.regionLabel.setStyleSheet( stylesheet.read() )

        # Adjusting font
        regionFont = QFont()
        regionFont.setPointSize( 28 )
        self.regionLabel.setFont( regionFont )

        # -------------------------------------------------------------------------------------
        # File Icon

        # Set object name
        self.fileIcon.setObjectName( "FileIcon" )

        # Reposition relative to region height
        self.fileIcon.move( 0, ( self.uploadRegion.height() - self.pixmap.height() - 24 ) )

        # Set style
        with open(stylesheetPath, "r") as stylesheet:
            self.fileIcon.setStyleSheet( stylesheet.read() )

        # Visibility
        self.fileIcon.hide()

        # Resize and set pixmap : https://stackoverflow.com/questions/21802868/python-how-to-resize-raster-image-with-pyqt
        self.pixmap = self.pixmap.scaledToHeight( self.regionHeight - self.regionLabel.height() - 32 )
        self.fileIcon.setPixmap( self.pixmap )

        # -------------------------------------------------------------------------------------
        # File Path Label (Hidden)

        # Set object name
        self.filePathLabel.setObjectName( "UploadedFilePathLabel" )

        # Set text
        self.filePathLabel.setText( "" )

        # Visibility
        self.filePathLabel.hide()

        # -------------------------------------------------------------------------------------
        # File Name Label

        # Set object name
        self.fileNameLabel.setObjectName( "UploadFileNameLabel" )

        # Move
        self.fileNameLabel.move( ( self.pixmap.width() + 32 ), ( self.regionHeight * 0.7 ) )

        # Set style
        with open(stylesheetPath, "r") as stylesheet:
            self.fileNameLabel.setStyleSheet( stylesheet.read() )

        # Visibility
        self.fileNameLabel.hide()

        # Properties
        self.fileNameLabel.setMaximumWidth( ( self.regionWidth - self.pixmap.width() - 32 ) )

        # Adjusting font
        labelFont = QFont()
        labelFont.setPointSize( 16 )
        self.fileNameLabel.setFont( labelFont )

        # -------------------------------------------------------------------------------------
        # Remove Button

        # Set object name
        self.removeBtn.setObjectName( "UploadFileRemoveButton" )

        # Move
        self.removeBtn.move( ( self.uploadRegion.width() - self.removeBtn.width() ), 16 )

        # Set style
        with open(stylesheetPath, "r") as stylesheet:
            self.removeBtn.setStyleSheet( stylesheet.read() )

        # Connect event to signal
        self.removeBtn.clicked.connect( self.removeBtnClicked )

        # Visibility
        self.removeBtn.hide()

        # -------------------------------------------------------------------------------------

        return
        

    # Allow the dragging of image/text files onto region.
    def dragEnterEvent( self, event ):
        # Only accept dragEnterEvents if region does not have a file already
        if (self.hasFile == False):
            if event.mimeData().hasText():
                event.acceptProposedAction()


    # On image/text file drop event
    def dropEvent(self, event):
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
        self.fileNameLabel.show()

        # Show file icon
        self.fileIcon.show()

        # Show removeBtn
        self.removeBtn.show()

        # Set hasFile flag
        self.hasFile = True

        # Adjust colors
        self.uploadRegion.setStyleSheet( u"background-color: white;" )
        self.fileIcon.setStyleSheet( u"background-color: white;" )
        self.regionLabel.setStyleSheet( u"background-color: white;"
                                         "color: black;"
                                         "font-weight: bold;")
        self.fileNameLabel.setStyleSheet( u"background-color: white;"
                                           "color: black;"
                                           "font-weight: normal;" )
        
        # Basic validation
        if (self.uploadRegion.objectName() == "UploadFileRegion_Vignetting"):
            print( "Upload region is for vignetting. Validating..." )
            self.vc_validation()
        else:
            print( "Upload region is unknown. self.uploadRegion.objectName(): {}".format( self.uploadRegion.objectName() ) )
            

        event.acceptProposedAction()


    # Remove button click event
    def removeBtnClicked( self ):
        # Clear file name/path labels' text
        self.fileNameLabel.setText("")
        self.filePathLabel.setText("")

        # Hide file name label
        self.fileNameLabel.hide()

        # Hide file icon
        self.fileIcon.hide()

        # Hide removeBtn
        self.removeBtn.hide()

        # Set hasFile flag
        self.hasFile = False

        # Adjust colors
        self.uploadRegion.setStyleSheet( u"background-color: {};".format( self.regionColor ) )
        self.fileIcon.setStyleSheet( u"background-color: {};".format( self.regionColor ) )
        self.regionLabel.setStyleSheet( u"background-color: {};"
                                         "color: black;"
                                         "font-weight: bold;".format( self.regionColor ) )
        self.fileNameLabel.setStyleSheet( u"background-color: {};"
                                           "color: black;"
                                           "font-weight: normal;".format( self.regionColor ) )


    # Get the filename from the path
    def getFilenameFromPath( self, path ):
        head, tail = ntpath.split(path)
        return tail or ntpath.basename(head)
    

    # Basic vignetting calibration (vc) file validation
    def vc_validation( self ):
        fileSize = os.stat(self.filePathLabel.text()).st_size

        if ( fileSize == 0 ):
            print( "File: \"{}\" at location {} is empty.".format( self.filePathLabel.text(), self.fileNameLabel.text() ) )

            # Display empty error in this case
        
        else:
            print( "File: \"{}\" at location {} has size: {} bytes.".format( self.filePathLabel.text(), self.fileNameLabel.text(), fileSize ) )

            # In this case, file is not empty so check for variable definitions and initializations

        return
    

    # Basic fisheye correction calibration (fc) file validation
    def fc_validation( self ):
        return
    

    # Basic calibration factor calibration (cf) file validation
    def cf_validation( self ):
        return
    

    # Basic neutral density filter calibration (nd) file validation
    def nd_validation( self ):
        return



class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")

        MainWindow.resize(1000, 500)
        MainWindow.setMinimumSize(QSize(1000, 500))
        MainWindow.setStyleSheet(u"background-color: #EAEAEA;")

        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")

        self.verticalLayout = QVBoxLayout(self.centralwidget)
        self.verticalLayout.setSpacing(0)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.verticalLayout.setContentsMargins(0, 0, 0, 0)

        self.Top_Bar = QFrame(self.centralwidget)
        self.Top_Bar.setObjectName(u"Top_Bar")
        self.Top_Bar.setMaximumSize(QSize(16777215, 40))
        self.Top_Bar.setStyleSheet(u"background-color: rgb(35, 35, 35);")
        self.Top_Bar.setFrameShape(QFrame.NoFrame)
        self.Top_Bar.setFrameShadow(QFrame.Raised)

        self.horizontalLayout = QHBoxLayout(self.Top_Bar)
        self.horizontalLayout.setObjectName(u"horizontalLayout")
        self.horizontalLayout.setSpacing(0)
        self.horizontalLayout.setContentsMargins(0, 0, 0, 0)

        # self.frame_toggle = QFrame(self.Top_Bar)
        # self.frame_toggle.setObjectName(u"frame_toggle")
        # self.frame_toggle.setMaximumSize(QSize(70, 40))
        # self.frame_toggle.setStyleSheet(u"background-color: rgb(85, 170, 255);")
        # self.frame_toggle.setFrameShape(QFrame.StyledPanel)
        # self.frame_toggle.setFrameShadow(QFrame.Raised)

        # self.verticalLayout_2 = QVBoxLayout(self.frame_toggle)
        # self.verticalLayout_2.setObjectName(u"verticalLayout_2")
        # self.verticalLayout_2.setSpacing(0)
        # self.verticalLayout_2.setContentsMargins(0, 0, 0, 0)
       # self.Btn_Toggle = QPushButton(self.frame_toggle)
       # self.Btn_Toggle.setObjectName(u"Btn_Toggle")
       # sizePolicy = QSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
       # sizePolicy.setHorizontalStretch(0)
       # sizePolicy.setVerticalStretch(0)
       # sizePolicy.setHeightForWidth(self.Btn_Toggle.sizePolicy().hasHeightForWidth())
       # self.Btn_Toggle.setSizePolicy(sizePolicy)
       # self.Btn_Toggle.setStyleSheet(u"color: rgb(255, 255, 255);\n"
#"border: 0px solid;")

       # self.verticalLayout_2.addWidget(self.Btn_Toggle)


       # self.horizontalLayout.addWidget(self.frame_toggle)

        # self.frame_top = QFrame(self.Top_Bar)
        # self.frame_top.setObjectName(u"frame_top")
        # self.frame_top.setFrameShape(QFrame.StyledPanel)
        # self.frame_top.setFrameShadow(QFrame.Raised)

        # self.horizontalLayout.addWidget(self.frame_top)

        self.verticalLayout.addWidget(self.Top_Bar)

        self.Content = QFrame(self.centralwidget)
        self.Content.setObjectName(u"Content")
        self.Content.setFrameShape(QFrame.NoFrame)
        self.Content.setFrameShadow(QFrame.Raised)
        self.horizontalLayout_2 = QHBoxLayout(self.Content)
        self.horizontalLayout_2.setObjectName(u"horizontalLayout_2")
        self.horizontalLayout_2.setSpacing(0)
        self.horizontalLayout_2.setContentsMargins(0, 0, 0, 0)

        self.sidebar_menu = QFrame(self.Content)
        self.sidebar_menu.setObjectName(u"sidebar_menu")
        self.sidebar_menu.setMinimumSize(QSize(220, 0))
        self.sidebar_menu.setMaximumSize(QSize(250, 4000))
        self.sidebar_menu.setStyleSheet(u"background-color: #A5A5A5;")
        self.sidebar_menu.setFrameShape(QFrame.StyledPanel)
        self.sidebar_menu.setFrameShadow(QFrame.Raised)
        
        self.sidebar_menu_v_layout = QVBoxLayout(self.sidebar_menu)
        self.sidebar_menu_v_layout.setObjectName(u"sidebar_menu_v_layout")
        self.sidebar_menu_v_layout.setContentsMargins(0, 0, 0, 0)

        self.frame_top_menus = QFrame(self.sidebar_menu)
        self.frame_top_menus.setObjectName(u"frame_top_menus")
        self.frame_top_menus.setFrameShape(QFrame.NoFrame)
        self.frame_top_menus.setFrameShadow(QFrame.Raised)

        self.verticalLayout_4 = QVBoxLayout(self.frame_top_menus)
        self.verticalLayout_4.setObjectName(u"verticalLayout_4")
        self.verticalLayout_4.setSpacing( 8 )
        self.verticalLayout_4.setContentsMargins(0, 0, 0, 0)



        # ---------------------------------------------------------------------------------------
        # Setting up page-routing buttons in menu sidebar

        # Stylesheet path
        stylesheetPath = "./styles/main_styles.css"

        # Page 1 (Welcome landing page)
        self.btn_page_1 = QPushButton(self.frame_top_menus)
        self.btn_page_1.setObjectName(u"btn_page_1")
        self.btn_page_1.setMinimumSize(QSize(0, 40))

        # Set button styling
        with open(stylesheetPath, "r") as stylesheet:
            self.btn_page_1.setStyleSheet( stylesheet.read() )


        # Page 2 (Upload LDR images)
        self.btn_page_2 = QPushButton(self.frame_top_menus)
        self.btn_page_2.setObjectName(u"btn_page_2")
        self.btn_page_2.setMinimumSize(QSize(0, 40))
       
        # Set button styling
        with open(stylesheetPath, "r") as stylesheet:
            self.btn_page_2.setStyleSheet( stylesheet.read() )


        # Page 3 (Adjust camera settings)
        self.btn_page_3 = QPushButton(self.frame_top_menus)
        self.btn_page_3.setObjectName(u"btn_page_3")
        self.btn_page_3.setMinimumSize(QSize(0, 40))

        # Set button styling
        with open(stylesheetPath, "r") as stylesheet:
            self.btn_page_3.setStyleSheet( stylesheet.read() )


        # Page 4 (Adjust calibration settings)
        self.btn_page_4 = QPushButton(self.frame_top_menus)
        self.btn_page_4.setObjectName(u"btn_page_4")
        self.btn_page_4.setMinimumSize(QSize(0, 40))

        # Set button styling
        with open(stylesheetPath, "r") as stylesheet:
            self.btn_page_4.setStyleSheet( stylesheet.read() )


        # Go button - Starts Radiance pipeline process
        self.btn_start_pipeline = QPushButton(self.frame_top_menus)
        self.btn_start_pipeline.setObjectName(u"btn_start_pipeline")
        self.btn_start_pipeline.setMinimumSize(QSize(0, 40))
        
        # Set button styling
        with open(stylesheetPath, "r") as stylesheet:
            self.btn_start_pipeline.setStyleSheet( stylesheet.read() )


        # Add Page 1-routing button to sidebar
        self.verticalLayout_4.addWidget(self.btn_page_1)

        # Add Page 2-routing button to sidebar
        self.verticalLayout_4.addWidget(self.btn_page_2)

        # Add Page 3-routing button to sidebar
        self.verticalLayout_4.addWidget(self.btn_page_3)

        # Add Page 4-routing button to sidebar
        self.verticalLayout_4.addWidget(self.btn_page_4)

        # Add Go button to sidebar
        self.verticalLayout_4.addWidget(self.btn_start_pipeline)

        # ---------------------------------------------------------------------------------------



        self.sidebar_menu_v_layout.addWidget(self.frame_top_menus, 0, Qt.AlignTop)


        self.horizontalLayout_2.addWidget(self.sidebar_menu)

        self.frame_pages = QFrame(self.Content)
        self.frame_pages.setObjectName(u"frame_pages")
        self.frame_pages.setFrameShape(QFrame.StyledPanel)
        self.frame_pages.setFrameShadow(QFrame.Raised)
        self.verticalLayout_5 = QVBoxLayout(self.frame_pages)
        self.verticalLayout_5.setObjectName(u"verticalLayout_5")
        self.stackedWidget = QStackedWidget(self.frame_pages)
        self.stackedWidget.setObjectName(u"stackedWidget")
        self.page_1 = QWidget()
        self.page_1.setObjectName(u"page_1")
        self.verticalLayout_7 = QVBoxLayout(self.page_1)
        self.verticalLayout_7.setObjectName(u"verticalLayout_7")
        self.label_1 = QLabel(self.page_1)
        self.label_1.setObjectName(u"label_1")
        font = QFont()
        font.setPointSize(40)
        labelfont = QFont()
        labelfont.setPointSize(20)
        self.label_1.setFont(font)
        self.label_1.setStyleSheet(u"color: #000;")
        self.label_1.setAlignment(Qt.AlignCenter)

        self.verticalLayout_7.addWidget(self.label_1)

        self.stackedWidget.addWidget(self.page_1)
        self.page_2 = QWidget()
        self.page_2.setObjectName(u"page_2")
        self.verticalLayout_6 = QVBoxLayout(self.page_2)
        self.verticalLayout_6.setObjectName(u"verticalLayout_6")

        #uploading file setup begin -------
        def upload_response(self,fileName):
            self.label.setText(fileName)
            self.update()
        def update(self):
            self.label.adjustSize()
        def openFileNameDialog(self):
            options = QFileDialog.Options()
            options |= QFileDialog.DontUseNativeDialog
            fileName, _ = QFileDialog.getOpenFileName(self,"choose the desired .cal file", "",".Cal Files (*.cal)", options=options)
            file_list = []
            if fileName:
                print("file path imported: " + fileName)
                file_list += [fileName]
                self.file_label.setText(os.path.basename(fileName))
            list_val = []
            list_val = readFile(fileName)
            checkVal(list_val) 
       
        #self.uploadfilebutton = QtWidgets.QPushButton(self.page_4)
        
        #uploading file setup end --------
        

        self.label_2 = QLabel(self.page_2)
        self.label_2.setObjectName(u"label_2")
        self.label_2.setFont(font)
        self.label_2.setStyleSheet(u"color: #000;")
        self.label_2.setAlignment(Qt.AlignCenter)

        self.verticalLayout_6.addWidget(self.label_2)

        self.stackedWidget.addWidget(self.page_2)
        self.page_3 = QWidget()
        self.page_3.setObjectName(u"page_3")
        self.verticalLayout_8 = QVBoxLayout(self.page_3)
        self.verticalLayout_8.setObjectName(u"verticalLayout_8")
        self.label_3 = QLabel(self.page_3)
        self.label_3.setObjectName(u"label_3")
        self.label_3.setFont(font)
        self.label_3.setStyleSheet(u"color: #000;")
        self.label_3.setAlignment(Qt.AlignCenter)

        # Adding page_4 QWidget
        self.page_4 = QWidget()
        self.page_4.setObjectName(u"page_4")
        # self.verticalLayout_9 = QVBoxLayout(self.page_4)
        # self.verticalLayout_9.setObjectName(u"verticalLayout_9")
        # self.label_4 = QLabel(self.page_4)
        # self.label_4.setObjectName(u"label_4")
        # self.label_4.setFont(font)
        # self.label_4.setStyleSheet(u"color: #000;")
        # self.label_4.setAlignment(Qt.AlignCenter)

        # -------------------------------------------------------------------------------------------------
        # Upload file regions
        # Create new layout for self.page_4
        self.calibrationPage = QVBoxLayout( self.page_4 )
       # calibrationPage.setGeometry( QRect( 0, 0,  ) )
        self.calibrationPage.setContentsMargins( 0, 0, 0, 0 )
       # calibrationPage.SetMinimumSize( QLayout() )
        self.calibrationPage.setSpacing( 4 )
        self.calibrationPage.setMargin( 0 )
        

        # Vignetting region
        # Add widget: UploadFileRegionObject class object
        vc_UploadRegion = UploadFileRegion( "Vignetting", [0, 0], [900, 200] )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( vc_UploadRegion, 25 )

        # Fisheye correction region
        # Add widget: UploadFileRegionObject class object
        fc_UploadRegion = UploadFileRegion( "Fisheye Correction", [0, 0], [900, 200] )
        print( fc_UploadRegion.width() )
        print( fc_UploadRegion.height() )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( fc_UploadRegion, 25 )

        # Camera factor region
        # Add widget: UploadFileRegionObject class object
        cf_UploadRegion = UploadFileRegion( "Camera Factor", [0, 0], [900, 200] )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( cf_UploadRegion, 25 )

        # Neutral Density Filter region
        # Add widget: UploadFileRegionObject class object
        nd_UploadRegion = UploadFileRegion( "Neutral Density Filter", [0, 0], [900, 200] )

        # Add vignetting UploadRegion object to the QVBox
        self.calibrationPage.addWidget( nd_UploadRegion, 25 )


        # Add calibrationPage QVbox layout to verticalLayout_9's own QVBox
       # self.verticalLayout_9.addLayout( calibrationPage, 100 )
       # self.page_4.addLayout( self.calibrationPage, 100 )

        # -------------------------------------------------------------------------------------------------


        #------------------------
        # Adding page_4 QWidget end 

        #adding page 5 element
        self.page_5 = QWidget()
        self.page_5.setObjectName(u"page_5")
        self.verticalLayout_10 = QVBoxLayout(self.page_5)
        self.verticalLayout_10.setObjectName(u"verticalLayout_10")
        self.label_5 = QLabel(self.page_5)
        self.label_5.setObjectName(u"label_5")
        self.label_5.setFont(font)
        self.label_5.setStyleSheet(u"color: #000;")
        self.label_5.setAlignment(Qt.AlignCenter)
        #adding page 5 element end 

        self.verticalLayout_8.addWidget(self.label_3)
        #self.verticalLayout_9.addWidget(self.label_4)
        self.verticalLayout_10.addWidget(self.label_5)
        self.stackedWidget.addWidget(self.page_3)
        self.stackedWidget.addWidget(self.page_4)
        self.stackedWidget.addWidget(self.page_5)

        self.verticalLayout_5.addWidget(self.stackedWidget)


        self.horizontalLayout_2.addWidget(self.frame_pages)


        self.verticalLayout.addWidget(self.Content)

        MainWindow.setCentralWidget(self.centralwidget)

        self.retranslateUi(MainWindow)

        self.stackedWidget.setCurrentIndex(0)


        QMetaObject.connectSlotsByName(MainWindow)
    # setupUi

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"HDRI Calibration Tool", None))
       # self.Btn_Toggle.setText(QCoreApplication.translate("MainWindow", u"Expand", None))
        self.btn_page_1.setText(QCoreApplication.translate("MainWindow", u"Welcome", None))
        self.btn_page_2.setText(QCoreApplication.translate("MainWindow", u"Upload LDR images", None))
        self.btn_page_3.setText(QCoreApplication.translate("MainWindow", u"Camera Settings", None))
        self.btn_page_4.setText(QCoreApplication.translate("MainWindow", u"Upload Calibration", None))
        self.btn_start_pipeline.setText(QCoreApplication.translate("MainWindow", u"GO!", None))
        self.label_1.setText(QCoreApplication.translate("MainWindow", u"PAGE 1", None))
        self.label_2.setText(QCoreApplication.translate("MainWindow", u"PAGE 2", None))
        self.label_3.setText(QCoreApplication.translate("MainWindow", u"PAGE 3", None))
        #self.label_4.setText(QCoreApplication.translate("MainWindow", u"", None))
        self.label_5.setText(QCoreApplication.translate("MainWindow", u"PAGE 5", None))
    # retranslateUi

def checkVal(list_val): #checking values of .cal files
    print(" (checkVal function running) ")#compare value
    if list_val[0] == "this": #placeholder
        print("correct")

def readFile(fileName):
    f = open(fileName,"r")
    list_val = []
    lines = f.readlines()
    print(lines)
    for i in lines:
        list_val.append (i.replace(";\n",""))
    print(list_val)
    return list_val

def upload_response(self,fileName):
    self.label.setText(fileName)
    self.update()
def update(self):
    self.label.adjustSize()
def openFileNameDialog(self):
    options = QFileDialog.Options()
    options |= QFileDialog.DontUseNativeDialog
    fileName, _ = QFileDialog.getOpenFileName(self,"choose the desired .cal file", "",".Cal Files (*.cal)", options=options)
    file_list = []
    if fileName:
        print("file path imported: " + fileName)
        file_list += [fileName]
        self.file_label.setText(os.path.basename(fileName))
    list_val = []
    list_val = readFile(fileName)
    checkVal(list_val) 
