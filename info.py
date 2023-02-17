#info.py




def main():

    demo = RadianceData(paths_ldr,
    path_temp,
    path_rsp_fn,
    path_vignetting,
    path_fisheye,
    path_ndfilter,
    path_calfact,
    diameter,
    xleft,
    ydown,
    view_angle_vertical,
    view_angle_horizontal,
    targetx,
    targety)

    paths_ldr = ["Inputs/LDRImages/*.JPG"]
    path_temp = "Intermediate/"
    path_rsp_fn = "Inputs/Parameters/Response_function.rsp"
    path_vignetting = "Inputs/Parameters/vignetting_f5d6.cal"
    path_fisheye = "Inputs/Parameters/fisheye_corr.cal"
    path_ndfilter = "Inputs/Parameters/NDfilter_no_transform.cal"
    path_calfact = "Inputs/Parameters/CF_f5d6.cal"

    diameter = 3612
    xleft = 1019
    ydown = 74
    view_angle_vertical = 186
    view_angle_horizontal = 186
    targetx = 1000
    targety = 1000

class RadianceData:
  def __init__(self, 
        diameter,
        xleft,
        ydown,
        view_angle_vertical,
        view_angle_horizontal,
        targetx,
        targety,
        paths_ldr,
        path_temp,
        path_rsp_fn,
        path_vignetting,
        path_fisheye,
        path_ndfilter,
        path_calfact):
        self.diameter         = diameter
        self.xleft            = xleft
        self.ydown            = ydown
        self.view_angle_vertical            = view_angle_vertical
        self.view_angle_horizontal               = view_angle_horizontal
        self.targetx          = targetx
        self.targety          = targety
        self.paths_ldr        = paths_ldr
        self.path_temp        = path_temp
        self.path_rsp_fn      = path_rsp_fn
        self.path_vignetting  = path_vignetting
        self.path_fisheye     = path_fisheye
        self.path_ndfilter    = path_ndfilter
        self.path_calfact     = path_calfact
        return
