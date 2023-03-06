import sys
import time
from PyQt5 import QtCore
from PyQt5.QtCore import QThread, pyqtSignal, QObject, pyqtSlot, Qt
from PyQt5.QtWidgets import QApplication, QPushButton, QWidget, QHBoxLayout, QProgressBar, QVBoxLayout

from radiance_pipeline.radiance_data import RadianceData
from radiance_pipeline.radiance_pipeline import radiance_pipeline

from PyQt5.QtWidgets import QWidget


class ProgressWindow( QWidget ):
    def __init__( self, MainWindow ):
        QWidget.__init__( self )

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
        self.startRadiancePipeline( MainWindow )

        # self.obj = self.parent()
        # self.thread = QThread()
        # self.obj.intReady.connect( self.on_count_changed )
        # self.obj.moveToThread( self.thread )
        # self.obj.finished.connect( self.thread.quit )

        # self.thread.started.connect(self.obj.proc_counter)
        # self.thread.start()


    def on_count_changed(self, value):
        self.progressBar.setValue(value)

        return

    
    # This function increases the progress bar by a fixed amount.
    # TODO: Update so it pulls from radiance_pipeline script
    def increaseProgress( self ):
        # Temp. increment value for progress bar
        incrementValue = 10

        # Calculate new progress bar value
        newProgressValue = self.progressValue + incrementValue

        # Update property that stores progress value
        self.progressValue = newProgressValue

        # Update progress bar visually
        self.progressBar.setValue( newProgressValue )

        return

    
    def startRadiancePipeline( self, MainWindow ):
        # Radiance data object init.
        radianceDataObject = RadianceData(diameter = MainWindow.diameter,
                                            crop_x_left = MainWindow.crop_x_left,
                                            crop_y_down = MainWindow.crop_y_down,
                                            view_angle_vertical = MainWindow.view_angle_vertical,
                                            view_angle_horizontal = MainWindow.view_angle_horizontal,
                                            target_x_resolution = MainWindow.target_x_resolution,
                                            target_y_resolution = MainWindow.target_y_resolution,
                                            paths_ldr = MainWindow.paths_ldr,
                                            path_temp = MainWindow.path_temp,
                                            path_errors= MainWindow.path_errors,
                                            path_logs= MainWindow.path_logs,
                                            path_rsp_fn = MainWindow.path_rsp_fn,
                                            path_vignetting = MainWindow.path_vignetting,
                                            path_fisheye = MainWindow.path_fisheye,
                                            path_ndfilter = MainWindow.path_ndfilter,
                                            path_calfact = MainWindow.path_calfact)
        
        print( "MainWindow.path_temp: {}".format( MainWindow.path_temp ) )
        
        # Do some basic validation here
        # TODO
        ## if radianceDataObject.attribute == (invalid value) then display error
        
        print("\n#########\nCALLING PIPELINE COMMAND\n#########\n")
        radiance_pipeline( radianceDataObject )
    
        return
