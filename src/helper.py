"""
Helper functions for UI
"""

def param2field(param) -> str:
    """
    Takes a param of any type and returns a string that will work in a
    UI field.
    """
    if type(param) == int:
        if param == 0:
            return ""
        return str(param)

    if type(param) == float:
        if param == 0.:
            return ""
        return str(param)

    return str(param)

