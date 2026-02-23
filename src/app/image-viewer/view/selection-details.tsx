"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
	SquareArrowOutDownRight,
	SquareArrowOutUpLeft,
	SquareDashed,
} from "lucide-react";
import { useImageSelection } from "./image-selection-context";
import type { LuminanceAggregates } from "./luminance-aggregates";

type SelectionDetailsProps = {
	luminanceAggregates: LuminanceAggregates;
	isLuminanceLoading: boolean;
};

const formatLuminance = (value: number) => {
	if (!Number.isFinite(value)) return "n/a";
	if (Math.abs(value) >= 1000) return value.toExponential(2);
	if (Math.abs(value) >= 10) return value.toFixed(1);
	return value.toFixed(3);
};

export function SelectionDetails({
	luminanceAggregates,
	isLuminanceLoading,
}: SelectionDetailsProps) {
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

	const averageText = useMemo(() => {
		if (isLuminanceLoading) return "computing...";
		if (luminanceAggregates.average === null) return "n/a";
		return `${formatLuminance(luminanceAggregates.average)} cd/m2`;
	}, [isLuminanceLoading, luminanceAggregates.average]);

	const medianText = useMemo(() => {
		if (isLuminanceLoading) return "computing...";
		if (luminanceAggregates.median === null) return "n/a";
		return `${formatLuminance(luminanceAggregates.median)} cd/m2`;
	}, [isLuminanceLoading, luminanceAggregates.median]);

	return (
		<Card
			className={cn("w-full bg-background/90 shadow-md border-2", {
				"border-dashed": !selection,
			})}
		>
			<CardContent className="px-3 py-2 text-[0.62rem] font-mono space-y-2">
				<div
					className={cn(
						"text-[0.58rem] text-muted-foreground flex gap-3 items-center",
						{
							"opacity-70": !selection,
						}
					)}
				>
					{selectionDescription}
				</div>
				<div className="space-y-1 border-t pt-2">
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Avg</span>
						<span>{averageText}</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Median</span>
						<span>{medianText}</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Samples</span>
						<span>{luminanceAggregates.sampleCount}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
