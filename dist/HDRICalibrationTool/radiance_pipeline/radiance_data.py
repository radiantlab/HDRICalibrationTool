class RadianceData:
  def __init__(self, 
          diameter,
          crop_x_left,
          crop_y_down,
          view_angle_vertical,
          view_angle_horizontal,
          target_x_resolution,
          target_y_resolution,
          paths_ldr,
          path_temp,
          path_rsp_fn,
          path_vignetting,
          path_fisheye,
          path_ndfilter,
          path_calfact,
          path_errors,
          path_logs):
            self.diameter         = diameter
            self.crop_x_left            = crop_x_left
            self.crop_y_down            = crop_y_down
            self.view_angle_vertical               = view_angle_vertical
            self.view_angle_horizontal               = view_angle_horizontal
            self.target_x_resolution          = target_x_resolution
            self.target_y_resolution          = target_y_resolution
            self.paths_ldr        = paths_ldr
            self.path_temp        = path_temp
            self.path_rsp_fn      = path_rsp_fn
            self.path_vignetting  = path_vignetting
            self.path_fisheye     = path_fisheye
            self.path_ndfilter    = path_ndfilter
            self.path_calfact     = path_calfact
            self.path_errors         = path_errors
            self.path_logs         = path_logs
            return

