/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Progress } from "@/components/ui/progress";
import z from "zod";
import { Button } from "@/components/ui/button";

export function PipelineStatus({
	onFinishAcknowledgment,
}: {
	onFinishAcknowledgment: () => void;
}) {
	const [progress, setProgress] = useState<number>(0);
	// TODO: implement status texts from the backend
	const [statusText, setStatusText] = useState<string>("");

	useEffect(() => {
		const unlistenPromise = listen(
			"pipeline-progress",
			(event: { payload: unknown }) => {
				setProgress(z.number().parse(event.payload));
			}
		);

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, []);

	return (
		<div className="flex items-center gap-2">
			{statusText && (
				<div className="mb-2 text-sm text-muted-foreground">{statusText}</div>
			)}
			<div className="text-xs text-muted-foreground">{progress}%</div>
			<Progress value={progress} />
			<Button onClick={onFinishAcknowledgment} disabled={progress !== 100}>
				OK
			</Button>
		</div>
	);
}
