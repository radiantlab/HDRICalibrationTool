"""
Helper functions for UI
"""

def param2field(param: any) -> str:
    """
    Takes a param of any type and returns a string that will work in a
    UI field.
    """
    if param is None:
        return ""
    return str(param)

def cast(x: any, t: type):
    """
    Takes some value x and returns x casted to type t
    """
    if type(t) is not type:
        raise TypeError

    if x is None:
        return None
    
    if x == "" and (t is int):
        return None

    return t(x)

