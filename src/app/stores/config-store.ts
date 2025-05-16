import { create } from 'zustand';

interface ConfigState {
  viewSettings: {
    diameter: string;
    xleft: string;
    ydown: string;
    vv: string;
    vh: string;
    targetRes: string;
  };
  progressButton: boolean;
  processError: boolean;
  showProgress: boolean;
  devicePaths: any[];
  responsePaths: string;
  fe_correctionPaths: string;
  v_correctionPaths: string;
  nd_correctionPaths: string;
  cf_correctionPaths: string;
  setConfig: (config: Partial<ConfigState>) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  viewSettings: {
    diameter: '',
    xleft: '',
    ydown: '',
    vv: '',
    vh: '',
    targetRes: '1000',
  },
  progressButton: false,
  processError: false,
  showProgress: false,
  devicePaths: [],
  responsePaths: '',
  fe_correctionPaths: '',
  v_correctionPaths: '',
  nd_correctionPaths: '',
  cf_correctionPaths: '',
  setConfig: (config) => set((state) => ({ ...state, ...config })),
}));