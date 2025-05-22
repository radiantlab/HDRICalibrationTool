import { create } from 'zustand';

export const DEFAULT_COMMANDS = {
  dcraw: '-T -o 1 -W -j -q 3 -g 2 0 -t 0 -b 1.1 -Z [temp_output_file] [input_image]',
  hdrgen: '[input_image] [-o output_path] [-r response_function] -a -e -f -g -F',
  raxyze: '-r [-o] [input_file] [output_file]',
  pcompos: '-x [diameter] -y [diameter] [input_file] -xleft -ydown',
  pfilt: '-1 -x [xdim] -y [ydim] [input_file]',
  pcomb_projection_adj: '-f [fisheye_correction_calculation] [input_file]',
  pcomb_vignetting_corr: '-f [vignetting_correction_calculation] [input_file]',
  pcomb_neutral_dens: '-f [neutral_density_calculation] [input_file]',
  pcomb_photometric_adj: '-h -f [photometric_adjustment_calculation] [input_file]',
  getinfo: '-a VIEW= -vta -vv [vertical_angle] -vh [horizontal_angle]',
}

export type CommandKeys = keyof typeof DEFAULT_COMMANDS;
export type UserCommands = Record<CommandKeys, string>;

interface CommandStore {
  commands: UserCommands;
  setCommand: (key: CommandKeys, value: string) => void;
}

export const useCommandsStore = create<CommandStore>((set) => ({
  commands: Object.fromEntries(
    Object.keys(DEFAULT_COMMANDS).map((key) => [key, ""])
  ) as Record<CommandKeys, string>,
  setCommand: (key, value) => set((state) => ({
    commands: {
      ...state.commands,
      [key]: value,
    }
  })),
}));