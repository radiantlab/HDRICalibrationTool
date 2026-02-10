import { ImageSet } from "@/components/ui/image-set-preview";
import { createContext, useContext } from "react";
import { UseFormReturn } from "react-hook-form";

export type pipelineConfig = {
	inputSets: ImageSet[];
	cameraResponseLocation: string | null;
	lensMask: {
		radius: number;
		x: number;
		y: number;
	};
	fisheyeView: {
		horizontalViewDegrees: number | null;
		verticalViewDegrees: number | null;
	};
	correctionFiles: {
		fisheye: string | null;
		vignetting: string | null;
		neutralDensity: string | null;
		calibrationFactor: string | null;
	};
	outputSettings: {
		targetRes: number | null;
		filterIrrelevantSrcImages: boolean;
	};
};

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
	if (!context)
		throw new Error(
			"usePipelineConfig must be used within a PipelineConfigProvider"
		);

	return context;
}
