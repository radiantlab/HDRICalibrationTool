import { create } from 'zustand';

interface Settings {
  radiancePath: string;
  hdrgenPath: string;
  dcrawEmuPath: string;
  outputPath: string;
}

interface SettingsStore {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: {
    radiancePath: '',
    hdrgenPath: '',
    dcrawEmuPath: '',
    outputPath: '',
  },
  setSettings: (settings) => set({ settings }),
}));