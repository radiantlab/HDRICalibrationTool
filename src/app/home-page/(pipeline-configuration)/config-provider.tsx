import { FileGroup } from "@/components/ui/file-group-preview";
import { createContext, useContext } from "react";
import { UseFormReturn } from "react-hook-form";

export type pipelineConfig = {
	inputSets: FileGroup[];
	cameraResponseLocation: string[];
	lensMask: {
		diameter: number;
		x: number;
		y: number;
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
