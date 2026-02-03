"use client";

import React, { Ref } from "react";
import { cn } from "@/lib/utils";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type DragDropEvent =
	| { type: "enter"; paths: string[]; position: { x: number; y: number } }
	| { type: "over"; position: { x: number; y: number } }
	| { type: "drop"; paths: string[]; position: { x: number; y: number } }
	| { type: "leave" };

export type DropzoneChildrenProps = {
	isDragActive: boolean;
};

type TauriDropzoneProps = {
	multiple?: boolean;
	onDrop?: (paths: string[]) => void;
	children?: (opts: DropzoneChildrenProps) => React.ReactNode;
} & Omit<React.ComponentProps<"button">, "onDrop" | "children">;

export function TauriDropzone({
	multiple,
	disabled,
	onDrop,
	children,
	className,
	ref,
	...props
}: TauriDropzoneProps) {
	const [isDragActive, setIsDragActive] = React.useState(false);
	const rootRef = React.useRef<HTMLButtonElement>(null);

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

					onDrop?.(paths);
				}
			}
		);

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [disabled, multiple, onDrop]);

	return (
		<button
			{...props}
			ref={(val) => {
				rootRef.current = val;
				switch (typeof ref) {
					case "function":
						ref(val);
						break;
					default:
						if (ref) ref.current = val;
						break;
				}
			}}
			className={cn("relative", className)}
		>
			{children?.({ isDragActive })}
		</button>
	);
}
