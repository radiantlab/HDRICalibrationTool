import { createContext, useContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ImageSet } from "@/components/ui/image-set-preview";

export type FisheyeProjection = "vta" | "vth" | "vtv";

export interface pipelineConfig {
  cameraResponseLocation: string | null;
  correctionFiles: {
    fisheye: string | null;
    vignetting: string | null;
    neutralDensity: string | null;
    calibrationFactor: string | null;
  };
  fisheyeView: {
    horizontalViewDegrees: number | null;
    projection: FisheyeProjection;
    verticalViewDegrees: number | null;
  };
  inputSets: ImageSet[];
  lensMask: {
    radius: number;
    x: number;
    y: number;
  };
  outputSettings: {
    targetRes: number | null;
    filterIrrelevantSrcImages: boolean;
  };
}

const pipelineConfigContext = createContext<
  UseFormReturn<pipelineConfig> | undefined
>(undefined);

export function PipelineConfigProvider({
  children,
  form,
}: {
  children: React.ReactNode;
  form: UseFormReturn<pipelineConfig>;
}) {
  return (
    <pipelineConfigContext.Provider value={form}>
      {children}
    </pipelineConfigContext.Provider>
  );
}

export function usePipelineConfig() {
  const context = useContext(pipelineConfigContext);
  if (!context) {
    throw new Error(
      "usePipelineConfig must be used within a PipelineConfigProvider"
    );
  }

  return context;
}
