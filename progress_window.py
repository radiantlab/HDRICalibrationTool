import sys
import time
from PyQt5.QtCore import QThread, pyqtSignal, QObject, pyqtSlot
from PyQt5.QtWidgets import QApplication, QPushButton, QWidget, QHBoxLayout, QProgressBar, QVBoxLayout

from radiance_pipeline.radiance_data import RadianceData
from radiance_pipeline.radiance_pipeline import radiance_pipeline

from PyQt5.QtWidgets import QWidget

class ProgressWindow( QWidget ):
    def __init__( self ):
        QWidget.__init__( self )

        print("self: {}".format(self))
        print("self.parent(): {}".format( self.parent() ))
        print("self.parent().parent(): {}".format(self.parent().parent()))
        print("self.parent().parent().parent(): {}".format(self.parent().parent().parent()))

        self.progressBar = QProgressBar(self)
        self.progressBar.setGeometry(30, 40, 500, 75)

        self.progressValue = 0

        self.layout = QVBoxLayout()
        self.layout.addWidget(self.progressBar)
        self.setLayout(self.layout)
        self.setGeometry(300, 300, 550, 100)
        self.setWindowTitle('Progress Bar')

        self.btn = QPushButton( "temp progress increase", self )
        self.btn.clicked.connect( self.increaseProgress )
        self.btn.show()

        self.show()

        # Start the Radiance pipeline
        self.startRadiancePipeline()

        # self.obj = self.parent()
        # self.thread = QThread()
        # self.obj.intReady.connect( self.on_count_changed )
        # self.obj.moveToThread( self.thread )
        # self.obj.finished.connect( self.thread.quit )

        # self.thread.started.connect(self.obj.proc_counter)
        # self.thread.start()


    def on_count_changed(self, value):
        self.progressBar.setValue(value)

    
    def increaseProgress( self ):
        

        # Temp. increment value for progress bar
        incrementValue = 10

        # Calculate new progress bar value
        newProgressValue = self.progressValue + incrementValue

        # Update progress bar visually
        self.progressBar.setValue( newProgressValue )

    
    def startRadiancePipeline( self ):
        # print("self: {}".format(self))
        # print("self.parent(): {}".format( self.parent() ))
        # print("self.parent().parent(): {}".format(self.parent().parent()))
        # print("self.parent().parent().parent(): {}".format(self.parent().parent().parent()))

        # Radiance data object init.
        radianceDataObject = RadianceData(diameter = self.parent().diameter,
                                            crop_x_left = self.crop_x_left,
                                            crop_y_down = self.crop_y_down,
                                            view_angle_vertical = self.view_angle_vertical,
                                            view_angle_horizontal = self.view_angle_horizontal,
                                            target_x_resolution = self.target_x_resolution,
                                            target_y_resolution = self.target_y_resolution,
                                            paths_ldr = self.paths_ldr,
                                            path_temp = "/home/lpz/school/HDRICalibrationTool/temp",
                                            path_rsp_fn = self.path_rsp_fn,
                                            path_vignetting = self.path_vignetting,
                                            path_fisheye = self.path_fisheye,
                                            path_ndfilter = self.path_ndfilter,
                                            path_calfact = self.path_calfact)
        
        # Do some basic validation here
        # TODO
        ## if radianceDataObject.attribute == (invalid value) then display error
        
        print("\n#########\nCALLING PIPELINE COMMAND\n#########\n")
        radiance_pipeline( radianceDataObject )
    
        return
