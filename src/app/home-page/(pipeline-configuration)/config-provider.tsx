import { ImageSet } from "@/components/ui/image-set-preview";
import { createContext, useContext } from "react";
import { UseFormReturn } from "react-hook-form";

export type pipelineConfig = {
	inputSets: ImageSet[];
	cameraResponseLocation?: string;
	lensMask: {
		radius: number;
		x: number;
		y: number;
	};
	fisheyeView: {
		horizontalViewDegrees: number;
		verticalViewDegrees: number;
	};
	correctionFiles: {
		fisheye: string;
		vignetting: string;
		neutralDensity: string;
		calibrationFactor: string;
	};
	outputSettings: {
		targetRes: number;
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
