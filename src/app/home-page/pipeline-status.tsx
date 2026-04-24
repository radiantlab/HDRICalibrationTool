"use client";

import React from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePipelineStatus } from "../pipeline-status-context";

export function PipelineStatus({
	onFinishAcknowledgment,
}: {
	onFinishAcknowledgment: () => void;
}) {
	const { progress, statusText } = usePipelineStatus();

	return (
		<div className="flex flex-col gap-2">
			{statusText && (
				<div className="flex items-center justify-left gap-2 text-sm text-muted-foreground">
					{progress !== 100 && <Spinner className="size-4" />}
					{statusText}
				</div>
			)}
			<div className="flex items-center gap-2">
				<div className="text-xs text-muted-foreground">{progress}%</div>
				<Progress value={progress} />
				<Button onClick={onFinishAcknowledgment} disabled={progress !== 100}>
					OK
				</Button>
			</div>
		</div>
	);
}
