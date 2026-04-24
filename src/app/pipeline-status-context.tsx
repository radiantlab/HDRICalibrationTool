"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import z from "zod";
import { toast } from "sonner";

const pipelineStatusSchema = z.object({
	kind: z.enum(["step", "progress", "warning", "error", "done"]),
	progress: z.number().optional().nullable(),
	step: z.string().optional().nullable(),
	message: z.string().optional().nullable(),
});

type PipelineStatusPayload = z.infer<typeof pipelineStatusSchema>;

type PipelineStatusContextValue = {
	progress: number;
	statusText: string;
	payload: PipelineStatusPayload | null;
};

const PipelineStatusContext = createContext<PipelineStatusContextValue | undefined>(
	undefined
);

export function PipelineStatusProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [progress, setProgress] = useState<number>(0);
	const [statusText, setStatusText] = useState<string>("");
	const [payload, setPayload] = useState<PipelineStatusPayload | null>(null);

	useEffect(() => {
		const unlistenProgressPromise = listen(
			"pipeline-progress",
			(event: { payload: unknown }) => {
				setProgress(z.number().parse(event.payload));
			}
		);
		const unlistenStatusPromise = listen(
			"pipeline-status",
			(event: { payload: unknown }) => {
				const nextPayload = pipelineStatusSchema.parse(event.payload);
				setPayload(nextPayload);
				if (typeof nextPayload.progress === "number") {
					setProgress(nextPayload.progress);
				}
				if (nextPayload.message) {
					setStatusText(nextPayload.message);
				} else if (nextPayload.step) {
					setStatusText(nextPayload.step.replace(/_/g, " "));
				}
				if (nextPayload.kind === "warning") {
					const warningMessage =
						nextPayload.message ??
						(nextPayload.step
							? `Pipeline warning: ${nextPayload.step.replace(/_/g, " ")}`
							: "Pipeline warning");
					toast.warning(warningMessage);
				}
			}
		);

		return () => {
			unlistenProgressPromise.then((unlisten) => unlisten());
			unlistenStatusPromise.then((unlisten) => unlisten());
		};
	}, []);

	const value = useMemo(
		() => ({ progress, statusText, payload }),
		[progress, statusText, payload]
	);

	return (
		<PipelineStatusContext.Provider value={value}>
			{children}
		</PipelineStatusContext.Provider>
	);
}

export function usePipelineStatus() {
	const context = useContext(PipelineStatusContext);
	if (!context) {
		throw new Error(
			"usePipelineStatus must be used within PipelineStatusProvider"
		);
	}
	return context;
}
