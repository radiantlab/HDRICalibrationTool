import os
import sys
import logging
from pathlib import Path


# This function adds an error message to a log if it exists, otherwise creates the file first.
def recordLog( sessionTime, logLevel="NOTSET", message=None ):
    currentAbsPath = Path.cwd().resolve()

    # Error Logging
    if ( logLevel == "ERROR" ):
        log = logging.getLogger( "errorLogger" )

        # Make 'errors' dir if it doesn't exist already
        # Permissions: -rwxr-xr-x
        errorsDirPath = os.path.join( currentAbsPath, "errors" )
        Path( errorsDirPath ).mkdir( mode=0o755, parents=True, exist_ok=True )

        # Set error log filename for the session
        errorLogName = f"ErrorLog_{ sessionTime }.txt"
        errorLogPath = os.path.join( errorsDirPath, errorLogName )

        # Make logfile if it doesn't exist already
        # Permissions: -rw-r--r--
        Path( errorLogPath ).touch( mode=0o644, exist_ok=True )

        # Set config
        logging.basicConfig( filename=errorLogPath, level=logging.ERROR, force=True,
                            format='%(asctime)s %(levelname)s %(name)s %(message)s' )

        # Reroute stderr to session error log file
        sys.stderr = Path( errorLogPath ).open( mode='w' )

        # Send error message to log
        log.error( message )

        # Redirect stderr output to terminal for easier debugging after logging error msg
        sys.stderr = sys.__stdout__
    

    # Output Logging
    elif ( logLevel == "INFO" ):
        log = logging.getLogger( "outputLogger" )

        # Make 'logs' dir if it doesn't exist already
        # Permissions: -rwxr-xr-x
        logsDirPath = os.path.join( currentAbsPath, "logs" )
        Path( logsDirPath ).mkdir( mode=0o755, parents=True, exist_ok=True )

        # Set output log filename for the session
        logName = f"OutputLog_{ sessionTime }.txt"
        logPath = os.path.join( logsDirPath, logName )

        # Make logfile if it doesn't exist already
        # Permissions: -rw-r--r--
        Path( logPath ).touch( mode=0o644, exist_ok=True )

        # Set config
        logging.basicConfig( filename=logPath, level=logging.INFO, force=True,
                             format='%(asctime)s %(levelname)s %(name)s %(message)s' )
        
        # Reroute stdout to session log file
        sys.stdout = Path( logPath ).open( mode='w' )

        # Send error message to log
        log.info( message )

        # Redirect stdout output to terminal for easier debugging after logging error msg
        sys.stdout = sys.__stdout__
    