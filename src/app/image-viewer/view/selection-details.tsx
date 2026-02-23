"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import { useImageSelection } from "./image-selection-context";
import {
	SquareArrowOutDownRight,
	SquareArrowOutUpLeft,
	SquareDashed,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SelectionDetails() {
	const { selection } = useImageSelection();

	const selectionDescription = useMemo(() => {
		if (!selection) return <SquareDashed className="size-4" />;

		const tlx = Math.round(selection.x);
		const tly = Math.round(selection.y);
		const brx = Math.round(selection.x + selection.width);
		const bry = Math.round(selection.y + selection.height);
		return (
			<>
				<div className="flex items-center gap-[0.15rem]">
					<SquareArrowOutUpLeft className="size-[0.6rem]" />
					<span>
						{tlx}, {tly}
					</span>
				</div>
				<div className="flex items-center gap-[0.15rem]">
					<SquareArrowOutDownRight className="size-[0.6rem]" />
					<span>
						{brx}, {bry}
					</span>
				</div>
			</>
		);
	}, [selection]);

	return (
		<Card
			className={cn("w-full bg-background/90 shadow-md border-2", {
				"border-dashed": !selection,
			})}
		>
			<CardContent className="py-4 px-0 text-xs font-mono relative">
				<div className="text-muted-foreground absolute inset-2 text-[0.5rem] font-mono">
					{selectionDescription}
				</div>
				<CardHeader className="px-4">
					<CardTitle
						className={cn("text-lg font-bold text-center", {
							"text-muted-foreground text-sm": !selection,
						})}
					>
						{selection ? "Selection Details" : "Hold shift and drag to select"}
					</CardTitle>
				</CardHeader>
			</CardContent>
		</Card>
	);
}
