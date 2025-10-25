"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import path from "path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type DragDropEvent =
	| { type: "enter"; paths: string[]; position: { x: number; y: number } }
	| { type: "over"; position: { x: number; y: number } }
	| { type: "drop"; paths: string[]; position: { x: number; y: number } }
	| { type: "leave" };

export type FileRejection = {
	file: { path: string };
	errors: { message: string }[];
};

export type DropzoneChildrenProps = {
	isDragActive: boolean;
};

type TauriDropzoneProps = {
	accept?: (path: string) => boolean;
	multiple?: boolean;
	disabled?: boolean;
	onDrop?: (paths: string[]) => void;
	onError?: (error: Error) => void;
	onDropRejected?: (rejected: FileRejection[]) => void;
	children?: (opts: DropzoneChildrenProps) => React.ReactNode;
	className?: string;
};

export function TauriDropzone({
	accept,
	multiple,
	disabled,
	onDrop,
	onError,
	onDropRejected,
	children,
	className,
}: TauriDropzoneProps) {
	const [isDragActive, setIsDragActive] = React.useState(false);
	const rootRef = React.useRef<HTMLDivElement | null>(null);

	const setupRef = useRef<boolean>(false);
	React.useEffect(() => {
		if (disabled) return;

		const unlistenPromise = getCurrentWebviewWindow().onDragDropEvent(
			(event) => {
				const payload: DragDropEvent = event.payload;
				if (payload.type === "leave") {
					setIsDragActive(false);
					return;
				}

				// this is slightly off, since the event position is relative to the whole window,
				// while the rect is relative to the viewport... but as far as I know tauri exposes no api to correct this
				// TODO: fix this if possible
				const currentRect = rootRef.current?.getBoundingClientRect();
				if (!currentRect) return;
				const isInside =
					payload.position.x >= currentRect.left &&
					payload.position.x <= currentRect.right &&
					payload.position.y >= currentRect.top &&
					payload.position.y <= currentRect.bottom;
				if (!isInside) {
					setIsDragActive(false);
					return;
				}

				if (payload.type === "enter" || payload.type === "over") {
					setIsDragActive(true);
					return;
				}
				if (payload.type === "drop") {
					setIsDragActive(false);
					const paths = payload.paths || [];

					// filter by accept
					const rejected: FileRejection[] = [];
					const accepted: string[] = [];
					for (const p of paths) {
						if (!accept || !accept(p)) {
							rejected.push({
								file: { path: p },
								errors: [{ message: `${p} not accepted` }],
							});
							continue;
						}
						accepted.push(p);
					}

					const finalAccepted = multiple ? accepted : accepted.slice(0, 1);
					if (finalAccepted.length && onDrop) onDrop(finalAccepted);
					if (rejected.length && onDropRejected) onDropRejected(rejected);
				}
			}
		);

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [disabled, multiple, accept, onDrop, onError, onDropRejected]);

	return (
		<div ref={rootRef} className={cn("relative", className)}>
			{children?.({ isDragActive })}
		</div>
	);
}

export default TauriDropzone;
