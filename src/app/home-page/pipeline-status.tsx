"use client";

import React from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePipelineStatus } from "../pipeline-status-context";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useRouter } from "next/navigation";
import { serializeViewerUrl } from "../image-viewer/page";

export function PipelineStatus({
	onFinishAcknowledgment,
}: {
	onFinishAcknowledgment: () => void;
}) {
	const { progress, statusText, lastEmittedOutput } = usePipelineStatus();
	const router = useRouter();

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
					Dismiss
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="icon" disabled={progress !== 100}>
							<EllipsisVerticalIcon className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem
							disabled={!lastEmittedOutput}
							onClick={() => revealItemInDir(lastEmittedOutput!.path)}
						>
							View in file explorer
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!lastEmittedOutput}
							onClick={() => {
								router.push(
									serializeViewerUrl(`/image-viewer/view`, {
										filePath: lastEmittedOutput!.path,
									}),
								);
							}}
						>
							View image
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
