from PySide6.QtWidgets import QWidget, QProgressBar, QVBoxLayout, QHBoxLayout, QLabel, QPushButton
from PySide6.QtCore import QTimer

import submodules.radiance_pipeline.radiance_pipeline as rp
from submodules.radiance_pipeline.radiance_data import RadianceData

import threading


class ProgressWindow( QWidget ):
    def __init__ (self, MainWindow ):
        QWidget.__init__( self )

        # Create flags and set default values
        self.pipelineIsComplete = False

        # Style path
        self.progress_window_style_path = "./src/styles/progress_window_styles.css"

        # Create widgets
        self.progressBar = QProgressBar( self )
        self.progressBar.setObjectName( "progressBar" )
        self.progressBar.setGeometry(30, 40, 500, 75)

        self.statusLabel = QLabel( "Waiting for Radiance Pipeline to establish connection", self )
        self.statusLabel.setObjectName( "statusLabel" )
        self.statusLabel.setGeometry(30, 60, 500, 50)

        self.cancelButton = QPushButton( "Cancel", self )
        self.cancelButton.setObjectName( "cancelButton" )
        self.cancelButton.setToolTip( "Click to cancel the active pipeline. The currently-running step will finish first." )
        self.cancelButton.clicked.connect( self.cancelPipeline )

        self.finishButton = QPushButton( "Finish", self )
        self.finishButton.setObjectName( "finishButton" )
        self.finishButton.clicked.connect( self.closeWindow )

        # Setup layout
        self.v_layout = QVBoxLayout()
        self.v_layout.addWidget( self.progressBar )

        self.h_layout = QHBoxLayout()
        self.h_layout.addWidget( self.statusLabel, stretch=6 )
        self.h_layout.addWidget( self.cancelButton, stretch=2 )
        self.h_layout.addWidget( self.finishButton, stretch=2 )

        self.v_layout.addLayout( self.h_layout )

        self.setLayout( self.v_layout )

        # Setup window properties
        self.setGeometry( 300, 300, 550, 100 )
        self.setWindowTitle( 'HDRI Calibration Pipeline Progress' )

        self.show()

        self.setWidgetProperties()

        # Start the Radiance pipeline
        self.startRadiancePipeline( MainWindow )

        # Create a QTimer for updating the progress regularly
        self.progressTimer = QTimer( self )
        self.progressTimer.timeout.connect( self.updateProgress )
        self.progressTimer.start( 1000 )  # Update every 1 second (1000ms)


    # Cancel button click event: calls cance_pipeline() from radiance_pipeline.py to set a cancel flag.
    # Queues a cancel on the active pipeline, meaning the currently active step will complete first.
    def cancelPipeline( self ):
        self.cancelButton.setText( "Cancelling..." )

        rp.cancel_pipeline()

        self.statusLabel.setText( rp.radiance_pipeline_get_status_text() )

        return


    # Checks the progress of the Radiance pipeline. 
    def updateProgress( self ):
        currentProgress = rp.radiance_pipeline_get_percent()
        self.progressBar.setValue( currentProgress )
        self.statusLabel.setText( rp.radiance_pipeline_get_status_text() )

        if ( (currentProgress >= 100) or (rp.radiance_pipeline_get_finished() == True) ):
            # Stop timer
            self.progressTimer.stop()

            # Update styling flag
            self.pipelineIsComplete = True

            # update styling
            self.setWidgetProperties()

        return


    # Creates the radianceDataObject from the MainWindow variables, passes to the radiance_pipeline.py script, and starts that script in a thread.
    def startRadiancePipeline( self, MainWindow ):
        # Radiance data object initialization
        radianceDataObject = RadianceData( diameter=MainWindow.diameter,
                                           crop_x_left=MainWindow.crop_x_left,
                                           crop_y_down=MainWindow.crop_y_down,
                                           view_angle_vertical=MainWindow.view_angle_vertical,
                                           view_angle_horizontal=MainWindow.view_angle_horizontal,
                                           target_x_resolution=MainWindow.target_x_resolution,
                                           target_y_resolution=MainWindow.target_y_resolution,
                                           paths_ldr=MainWindow.paths_ldr,
                                           path_temp=MainWindow.path_temp,
                                           path_errors=MainWindow.path_errors,
                                           path_logs=MainWindow.path_logs,
                                           path_rsp_fn=MainWindow.path_rsp_fn,
                                           path_vignetting=MainWindow.path_vignetting,
                                           path_fisheye=MainWindow.path_fisheye,
                                           path_ndfilter=MainWindow.path_ndfilter,
                                           path_calfact=MainWindow.path_calfact)

        # Start the radiance_pipeline in a separate thread
        self.pipeline_thread = threading.Thread( target=rp.radiance_pipeline, args=[radianceDataObject] )
        self.pipeline_thread.start()

        return


    # Closes the ProgressWindow window. Click event for the finishButton.
    def closeWindow(self):
        self.close()


    # Sets the visibility, states, and styling of the region's widgets
    def setWidgetProperties( self ):
        # Set widget visibility
        self.setWidgetVisibility()

        # Set widget states
        self.setWidgetStates()

        # Set widget style
        self.setWidgetStyle()

        return
    

    # Sets the visibility of widgets
    def setWidgetVisibility( self ):
        # Pipline is not done yet
        if ( self.pipelineIsComplete == False ):
            self.finishButton.hide()

            self.cancelButton.show()
        
        else:
            self.finishButton.show()

            self.cancelButton.hide()


        return
    

    # Sets the states of widgets
    def setWidgetStates( self ):
        # Pipline is not done yet
        if ( self.pipelineIsComplete == False ):
            self.finishButton.setEnabled( False )
            self.cancelButton.setEnabled( True )

        else:
            self.finishButton.setEnabled( True )
            self.cancelButton.setEnabled( False )


        return
    

    # Sets the style of widgets
    def setWidgetStyle( self ):
        # Set property for stylesheet to apply correct style
        self.statusLabel.setProperty( "pipelineComplete", self.pipelineIsComplete )
        self.finishButton.setProperty( "pipelineComplete", self.pipelineIsComplete )
        self.cancelButton.setProperty( "pipelineComplete", self.pipelineIsComplete )
        self.progressBar.setProperty( "pipelineComplete", self.pipelineIsComplete )

        # Apply style
        with open( self.progress_window_style_path, "r" ) as stylesheet:
            self.finishButton.setStyleSheet( stylesheet.read() )
        with open( self.progress_window_style_path, "r" ) as stylesheet:
            self.cancelButton.setStyleSheet( stylesheet.read() )
        with open( self.progress_window_style_path, "r" ) as stylesheet:
            self.progressBar.setStyleSheet( stylesheet.read() )
        with open( self.progress_window_style_path, "r" ) as stylesheet:
            self.statusLabel.setStyleSheet( stylesheet.read() )
            
 
        return