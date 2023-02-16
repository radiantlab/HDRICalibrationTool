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
    QFontDatabase, QIcon, QLinearGradient, QPalette, QPainter, QPixmap,
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
class UploadFileRegion(QWidget):
    # regionCoords[0]: x
    # regionCoords[1]: y
    # regionSize[0]: width
    # regionSize[1]: height
    # regionColor[0]: R value 0-255
    # regionColor[1]: G value 0-255
    # regionColor[2]: B value 0-255
    def __init__( self, regionLabel="DefaultLabel", regionCoords=[0,0], regionSize=[128, 128], regionColor=[255,255,255] ):
        QWidget.__init__(self)
        # Visible region
        region = QLabel(self)

        # Region label
        self.regionLabel = QLabel( regionLabel, self )
        self.regionLabel.move( regionCoords[0], regionCoords[1] )
        self.regionLabel.setStyleSheet( u"background-color: rgb({}, {}, {});".format( regionColor[0], regionColor[1], regionColor[2] ) )
        regionFont = QFont()
        regionFont.setPointSize( 28 )
        self.regionLabel.setFont( regionFont )

        # File icon pixmap
        self.fileIcon = QLabel( self )
        pixmap = QPixmap( './images/blank-file-128.ico' )
        self.fileIcon.setPixmap( pixmap )
        self.fileIcon.setStyleSheet( u"background-color: rgb({}, {}, {});".format( regionColor[0], regionColor[1], regionColor[2] ) )
        self.fileIcon.hide()

        # File path label (hidden)
        self.filePathLabel = QLabel( self )
        self.filePathLabel.setText( "" )
        self.filePathLabel.hide()

        # File name label
        self.fileNameLabel = QLabel( self )
        self.fileNameLabel.setStyleSheet( u"background-color: rgb({}, {}, {});".format( regionColor[0], regionColor[1], regionColor[2] ) )
        # Move filename label to right of icon, down to lower section of region
        self.fileNameLabel.move( ( pixmap.width() + 32 ), ( regionSize[1] * 0.7 ) )
        self.fileNameLabel.hide()
        labelFont = QFont()
        labelFont.setPointSize( 16 )
        self.fileNameLabel.setFont( labelFont )

        # Set region object name
        region.setObjectName( "UploadFileRegion_{}".format( regionLabel ) )

        # Set region size (at least as tall as the file icon)
        if ( regionSize[1] < pixmap.height() ):
            region.setGeometry( QRect( regionCoords[0], regionCoords[1], regionSize[0], pixmap.height() ) )
        else:
            region.setGeometry( QRect( regionCoords[0], regionCoords[1], regionSize[0], regionSize[1] ) )

        # Set region color
        region.setStyleSheet( u"background-color: rgb({}, {}, {});".format(regionColor[0], regionColor[1], regionColor[2]) )

        # Reposition file icon relative to region height
        self.fileIcon.move( 0, ( region.height() - pixmap.height() - 24 ) )

        # Create remove button for an uploaded file, bind custom click event
        self.removeBtn = QPushButton( "Remove", self )
        self.removeBtn.clicked.connect( self.removeBtnClicked )
        self.removeBtn.move( ( region.width() - self.removeBtn.width() ), 16 )
        self.removeBtn.hide()

        # Allow dropping files in this region
        self.setAcceptDrops( True )

        # Init. flag that stores if region has an uploaded file.
        self.hasFile = False

        region.create()


    def create(self):
        #todo: clean up init by moving non-creation stuff here
        return
        

    # Allow the dragging of image/text files onto region.
    def dragEnterEvent(self, event):
        # Only accept dragEnterEvents if region does not have a file already
        if (self.hasFile == False):
            if event.mimeData().hasText():
                event.acceptProposedAction()


    # On image/text file drop event
    def dropEvent(self, event):
        pos = event.pos()

        filepath = event.mimeData().text()

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

        event.acceptProposedAction()


    # Remove button click event
    def removeBtnClicked(self):
        # Clear file name/path labels' text
        self.fileNameLabel.setText("")
        self.filePathLabel.setText("")

        # Hide file name label
        self.fileNameLabel.hide()

        # Hide file icon
        self.fileIcon.hide()

        # Set hasFile flag
        self.hasFile = False

        # Hide removeBtn
        self.removeBtn.hide()


    # Get the filename from the path
    def getFilenameFromPath(self, path):
        head, tail = ntpath.split(path)
        return tail or ntpath.basename(head)
    


class Ui_MainWindow(object):
    def setupUi(self, MainWindow):
        if MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(1000, 500)
        MainWindow.setMinimumSize(QSize(1000, 500))
        MainWindow.setStyleSheet(u"background-color: rgb(240,255,240);")
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
        self.horizontalLayout.setSpacing(0)
        self.horizontalLayout.setObjectName(u"horizontalLayout")
        self.horizontalLayout.setContentsMargins(0, 0, 0, 0)
        self.frame_toggle = QFrame(self.Top_Bar)
        self.frame_toggle.setObjectName(u"frame_toggle")
        self.frame_toggle.setMaximumSize(QSize(70, 40))
        self.frame_toggle.setStyleSheet(u"background-color: rgb(85, 170, 255);")
        self.frame_toggle.setFrameShape(QFrame.StyledPanel)
        self.frame_toggle.setFrameShadow(QFrame.Raised)
        self.verticalLayout_2 = QVBoxLayout(self.frame_toggle)
        self.verticalLayout_2.setSpacing(0)
        self.verticalLayout_2.setObjectName(u"verticalLayout_2")
        self.verticalLayout_2.setContentsMargins(0, 0, 0, 0)
        self.Btn_Toggle = QPushButton(self.frame_toggle)
        self.Btn_Toggle.setObjectName(u"Btn_Toggle")
        sizePolicy = QSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        sizePolicy.setHorizontalStretch(0)
        sizePolicy.setVerticalStretch(0)
        sizePolicy.setHeightForWidth(self.Btn_Toggle.sizePolicy().hasHeightForWidth())
        self.Btn_Toggle.setSizePolicy(sizePolicy)
        self.Btn_Toggle.setStyleSheet(u"color: rgb(255, 255, 255);\n"
"border: 0px solid;")

        self.verticalLayout_2.addWidget(self.Btn_Toggle)


        self.horizontalLayout.addWidget(self.frame_toggle)

        self.frame_top = QFrame(self.Top_Bar)
        self.frame_top.setObjectName(u"frame_top")
        self.frame_top.setFrameShape(QFrame.StyledPanel)
        self.frame_top.setFrameShadow(QFrame.Raised)

        self.horizontalLayout.addWidget(self.frame_top)

        #bold font setup start
        mybold = QtGui.QFont()
        mybold.setBold(True)
        #blod font setup end
        self.verticalLayout.addWidget(self.Top_Bar)

        self.Content = QFrame(self.centralwidget)
        self.Content.setObjectName(u"Content")
        self.Content.setFrameShape(QFrame.NoFrame)
        self.Content.setFrameShadow(QFrame.Raised)
        self.horizontalLayout_2 = QHBoxLayout(self.Content)
        self.horizontalLayout_2.setSpacing(0)
        self.horizontalLayout_2.setObjectName(u"horizontalLayout_2")
        self.horizontalLayout_2.setContentsMargins(0, 0, 0, 0)
        self.frame_left_menu = QFrame(self.Content)
        self.frame_left_menu.setObjectName(u"frame_left_menu")
        self.frame_left_menu.setMinimumSize(QSize(70, 0))
        self.frame_left_menu.setMaximumSize(QSize(70, 16777215))
        self.frame_left_menu.setStyleSheet(u"background-color: rgb(35, 35, 35);")
        self.frame_left_menu.setFrameShape(QFrame.StyledPanel)
        self.frame_left_menu.setFrameShadow(QFrame.Raised)
        self.verticalLayout_3 = QVBoxLayout(self.frame_left_menu)
        self.verticalLayout_3.setObjectName(u"verticalLayout_3")
        self.verticalLayout_3.setContentsMargins(0, 0, 0, 0)
        self.frame_top_menus = QFrame(self.frame_left_menu)
        self.frame_top_menus.setObjectName(u"frame_top_menus")
        self.frame_top_menus.setFrameShape(QFrame.NoFrame)
        self.frame_top_menus.setFrameShadow(QFrame.Raised)
        self.verticalLayout_4 = QVBoxLayout(self.frame_top_menus)
        self.verticalLayout_4.setSpacing(0)
        self.verticalLayout_4.setObjectName(u"verticalLayout_4")
        self.verticalLayout_4.setContentsMargins(0, 0, 0, 0)

        self.btn_page_1 = QPushButton(self.frame_top_menus)
        self.btn_page_1.setObjectName(u"btn_page_1")
        self.btn_page_1.setMinimumSize(QSize(0, 40))
        self.btn_page_1.setStyleSheet(u"QPushButton {\n"
"	color: rgb(255, 255, 255);\n"
"	background-color: rgb(35, 35, 35);\n"
"	border: 0px solid;\n"
"}\n"
"QPushButton:hover {\n"
"	background-color: rgb(85, 170, 255);\n"
"}")

        self.verticalLayout_4.addWidget(self.btn_page_1)

        self.btn_page_2 = QPushButton(self.frame_top_menus)
        self.btn_page_2.setObjectName(u"btn_page_2")
        self.btn_page_2.setMinimumSize(QSize(0, 40))
        self.btn_page_2.setStyleSheet(u"QPushButton {\n"
"	color: rgb(255, 255, 255);\n"
"	background-color: rgb(35, 35, 35);\n"
"	border: 0px solid;\n"
"}\n"
"QPushButton:hover {\n"
"	background-color: rgb(85, 170, 255);\n"
"}")

        self.verticalLayout_4.addWidget(self.btn_page_2)

        self.btn_page_3 = QPushButton(self.frame_top_menus)
        self.btn_page_3.setObjectName(u"btn_page_3")
        self.btn_page_3.setMinimumSize(QSize(0, 40))
        self.btn_page_3.setStyleSheet(u"QPushButton {\n"
"	color: rgb(255, 255, 255);\n"
"	background-color: rgb(35, 35, 35);\n"
"	border: 0px solid;\n"
"}\n"
"QPushButton:hover {\n"
"	background-color: rgb(85, 170, 255);\n"
"}")

        self.verticalLayout_4.addWidget(self.btn_page_3)

#adding page 4 

        self.btn_page_4 = QPushButton(self.frame_top_menus)
        self.btn_page_4.setObjectName(u"btn_page_4")
        self.btn_page_4.setMinimumSize(QSize(0, 40))
        self.btn_page_4.setStyleSheet(u"QPushButton {\n"
"	color: rgb(255, 255, 255);\n"
"	background-color: rgb(35, 35, 35);\n"
"	border: 0px solid;\n"
"}\n"
"QPushButton:hover {\n"
"	background-color: rgb(85, 170, 255);\n"
"}")

        self.verticalLayout_4.addWidget(self.btn_page_4)
#adding page end ****

#adding page 5

        self.btn_page_5 = QPushButton(self.frame_top_menus)
        self.btn_page_5.setObjectName(u"btn_page_5")
        self.btn_page_5.setMinimumSize(QSize(0, 40))
        self.btn_page_5.setStyleSheet(u"QPushButton {\n"
"	color: rgb(255, 255, 255);\n"
"	background-color: rgb(35, 35, 35);\n"
"	border: 0px solid;\n"
"}\n"
"QPushButton:hover {\n"
"	background-color: rgb(85, 170, 255);\n"
"}")

        self.verticalLayout_4.addWidget(self.btn_page_5)
#adding page end ****

        self.verticalLayout_3.addWidget(self.frame_top_menus, 0, Qt.AlignTop)


        self.horizontalLayout_2.addWidget(self.frame_left_menu)

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

        #adding page 4 element
        self.page_4 = QWidget()
        self.page_4.setObjectName(u"page_4")
        self.verticalLayout_9 = QVBoxLayout(self.page_4)
        self.verticalLayout_9.setObjectName(u"verticalLayout_9")
        self.label_4 = QLabel(self.page_4)
        self.label_4.setObjectName(u"label_4")
        self.label_4.setFont(font)
        self.label_4.setStyleSheet(u"color: #000;")
        self.label_4.setAlignment(Qt.AlignCenter)
        #upload file section
        #-----------------
        self.label_vc = QLabel(self.page_4)
        self.label_vc.setAlignment(Qt.AlignLeft)
        self.label_vc.setText("Vignetting Correction")
        self.label_vc.setFont(labelfont)
        self.label_vc.adjustSize()
        self.label_fc = QLabel(self.page_4)
        self.label_fc.setAlignment(Qt.AlignLeft)
        self.label_fc.setText("Fisheye Correction")
        self.label_fc.setFont(labelfont)
        self.label_fc.adjustSize()
        self.label_fc.move(0,100)
        self.label_cf = QLabel(self.page_4)
        self.label_cf.setAlignment(Qt.AlignLeft)
        self.label_cf.setText("Calibration Factor")
        self.label_cf.setFont(labelfont)
        self.label_cf.adjustSize()
        self.label_cf.move(0,200)
        self.label_nd = QLabel(self.page_4)
        self.label_nd.setAlignment(Qt.AlignLeft)
        self.label_nd.setText("Neutral Density Filter")
        self.label_nd.setFont(labelfont)
        self.label_nd.adjustSize()
        self.label_nd.move(0,300)
        #index: vc = vignetting correction, fc = fisheye correction, cf = calibration factor, nd = neutral density filter
        self.vc_button = QPushButton(self.page_4)
        self.vc_button.setText("upload files")
        self.vc_button.setObjectName(u"vignett_cal")
        #self.uploadfilebutton.clicked.connect(openFileNameDialog(self))
        self.vc_button.setGeometry(550,30,150,30)
        self.vc_button.setStyleSheet("color: black;"
                             "background-color: #C5C5C5;"
                             "border-style: solid;"
                             "border-width: 2px;"
                             "border-color: black;"
                             "border-radius: 3px")
        painter = QPainter()
        painter.begin(self.page_4)
        painter.drawLine(100, 100, 1000, 100)
        self.fc_button = QPushButton(self.page_4)
        self.fc_button.setText("upload files")
        self.fc_button.setObjectName(u"fisheye")
        #self.uploadfilebutton.clicked.connect(openFileNameDialog(self))
        self.fc_button.setGeometry(550,130,150,30)
        self.fc_button.setStyleSheet("color: black;"
                             "background-color: #C5C5C5;"
                             "border-style: solid;"
                             "border-width: 2px;"
                             "border-color: black;"
                             "border-radius: 3px")
        self.cf_button = QPushButton(self.page_4)
        self.cf_button.setText("upload files")
        self.cf_button.setObjectName(u"calibration_factor")
        #self.uploadfilebutton.clicked.connect(openFileNameDialog(self))
        self.cf_button.setGeometry(550,230,150,30)
        self.cf_button.setStyleSheet("color: black;"
                             "background-color: #C5C5C5;"
                             "border-style: solid;"
                             "border-width: 2px;"
                             "border-color: black;"
                             "border-radius: 3px")
        self.nd_button = QPushButton(self.page_4)
        self.nd_button.setText("upload files")
        self.nd_button.setObjectName(u"neutral_density")
        #self.uploadfilebutton.clicked.connect(openFileNameDialog(self))
        self.nd_button.setGeometry(550,330,150,30)
        self.nd_button.setStyleSheet("color: black;"
                             "background-color: #C5C5C5;"
                             "border-style: solid;"
                             "border-width: 2px;"
                             "border-color: black;"
                             "border-radius: 3px")
        #upload buttons ending

        # -------------------------------------------------------------------------------------------------
        # Upload file regions
        # Create new layout for self.page_4
        calibrationPage = QVBoxLayout()

        # Add test widget: UploadFileRegionObject class object
        vc_UploadRegion = UploadFileRegion( "Vignetting", [0, 0], [880, 200], [95, 120, 160] )

        # Add vignetting UploadRegion object to the QVBox
        calibrationPage.addWidget( vc_UploadRegion )

        # Add calibrationPage QVbox layout to verticalLayout_9's own QVBox
        self.verticalLayout_9.addLayout(calibrationPage)
        # -------------------------------------------------------------------------------------------------

        #------------------------
        #adding page 4 element end 

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
        self.verticalLayout_9.addWidget(self.label_4)
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
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"ALD app", None))
        self.Btn_Toggle.setText(QCoreApplication.translate("MainWindow", u"Expand", None))
        self.btn_page_1.setText(QCoreApplication.translate("MainWindow", u"Welcome", None))
        self.btn_page_2.setText(QCoreApplication.translate("MainWindow", u"Upload LDR images", None))
        self.btn_page_3.setText(QCoreApplication.translate("MainWindow", u"Camera Settings", None))
        self.btn_page_4.setText(QCoreApplication.translate("MainWindow", u"Upload Calibration", None))
        self.btn_page_5.setText(QCoreApplication.translate("MainWindow", u"GO!", None))
        self.label_1.setText(QCoreApplication.translate("MainWindow", u"PAGE 1", None))
        self.label_2.setText(QCoreApplication.translate("MainWindow", u"PAGE 2", None))
        self.label_3.setText(QCoreApplication.translate("MainWindow", u"PAGE 3", None))
        self.label_4.setText(QCoreApplication.translate("MainWindow", u"", None))
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
