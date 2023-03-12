import sys
import time
from PyQt5 import QtCore
from PyQt5.QtCore import QThread, pyqtSignal, QObject, pyqtSlot, Qt
from PyQt5.QtWidgets import QApplication, QPushButton, QWidget, QHBoxLayout, QProgressBar, QVBoxLayout
from PyQt5.QtWidgets import QWidget

import radiance_pipeline.radiance_pipeline as rp
from radiance_pipeline.radiance_data import RadianceData

import threading
from threading import Timer
import time
import asyncio
import atexit

class Repeat_Timer(Timer):
# https://stackoverflow.com/questions/12435211
# /threading-timer-repeat-function-every-n-seconds
    def run(self):
        while not self.finished.wait(self.interval):
            self.function(*self.args, **self.kwargs)

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
        self.setWindowTitle('HDRI Calibration Pipeline Progress')
        
        self.show()

        # Start the Radiance pipeline
        self.startRadiancePipeline( MainWindow )

    def on_count_changed(self, value):
        self.progressBar.setValue(value)

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
        t_rp = threading.Thread(target=rp.radiance_pipeline, args=[radianceDataObject])
        t_rp.start()
        
        def update(self):
            self.progressValue = rp.radiance_pipeline_get_percent()
            self.progressBar.setValue(rp.radiance_pipeline_get_percent())
            print(rp.radiance_pipeline_get_percent())

            
        progress_bar_update_timer = Repeat_Timer(1, update, [self])
        progress_bar_update_timer.daemon = True
        progress_bar_update_timer.start() 
        
        # todo: threading does not cause any serious problems, but is
        # still a little funny. Could set up a way to make it kill
        # when t_rp exits, but for now it is killed when the program
        # exits, and does not negatively impact anything else.
        return
