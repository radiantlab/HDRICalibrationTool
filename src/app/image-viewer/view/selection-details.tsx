"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { max as getMaxValue, scaleBand, scaleLinear } from "d3";
import { useMemo } from "react";
import {
	SquareArrowOutDownRight,
	SquareArrowOutUpLeft,
	SquareDashed,
} from "lucide-react";
import { useImageSelection } from "./image-selection-context";
import type {
	LuminanceHistogramBin,
	LuminanceSummary,
} from "./luminance-aggregates";

type SelectionDetailsProps = {
	luminanceSummary: LuminanceSummary;
};

const formatLuminance = (value: number) => {
	if (!Number.isFinite(value)) return "n/a";
	if (Math.abs(value) >= 1000) return value.toExponential(2);
	if (Math.abs(value) >= 10) return value.toFixed(1);
	return value.toFixed(3);
};

const CHART_WIDTH = 176;
const CHART_HEIGHT = 56;
const CHART_PADDING = {
	top: 4,
	right: 0,
	bottom: 0,
	left: 0,
};

function formatLuminanceText(value: number | null) {
	if (value === null) return "n/a";
	return `${formatLuminance(value)} cd/m2`;
}

function formatLegendValue(value: number | null) {
	if (value === null) return "n/a";
	return formatLuminance(value);
}

function formatOutlierText(outlierCount: number, sampleCount: number) {
	if (sampleCount === 0) return "n/a";
	return `${outlierCount} removed (${(
		(outlierCount / sampleCount) *
		100
	).toFixed(1)}%)`;
}

function SelectionHistogramChart({
	histogram,
	histogramMinimum,
	histogramMaximum,
}: {
	histogram: LuminanceHistogramBin[];
	histogramMinimum: number | null;
	histogramMaximum: number | null;
}) {
	const bars = useMemo(() => {
		if (histogram.length === 0) return [];

		const contentHeight =
			CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
		const contentWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
		const xScale = scaleBand<number>()
			.domain(histogram.map((_, index) => index))
			.range([CHART_PADDING.left, CHART_PADDING.left + contentWidth])
			.paddingInner(0.12)
			.paddingOuter(0.04);
		const yScale = scaleLinear()
			.domain([0, getMaxValue(histogram, (bin) => bin.count) ?? 0])
			.range([CHART_PADDING.top + contentHeight, CHART_PADDING.top])
			.nice();

		return histogram.map((bin, index) => {
			const x = xScale(index) ?? 0;
			const width = xScale.bandwidth();
			const y = yScale(bin.count);
			const height = CHART_PADDING.top + contentHeight - y;
			return {
				bin,
				key: `${bin.start}-${bin.end}-${index}`,
				x,
				y,
				width,
				height,
				hoverHeight: contentHeight,
				hoverY: CHART_PADDING.top,
			};
		});
	}, [histogram]);

	if (histogram.length === 0) {
		return (
			<div className="h-14 rounded-sm border border-dashed border-border/80 bg-muted/20 grid place-items-center text-[0.58rem] text-muted-foreground">
				n/a
			</div>
		);
	}

	return (
		<div className="rounded-sm border border-border/70 bg-muted/15 px-1.5 py-1.5 space-y-1">
			<svg
				viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
				className="block h-14 w-full overflow-visible"
				aria-label="Luminance distribution"
				role="img"
			>
				{bars.map((bar) => (
					<Tooltip key={bar.key}>
						<TooltipTrigger asChild>
							<g>
								<rect
									x={bar.x}
									y={bar.hoverY}
									width={bar.width}
									height={bar.hoverHeight}
									fill="transparent"
								/>
								<rect
									x={bar.x}
									y={bar.y}
									width={bar.width}
									height={Math.max(bar.height, 1.5)}
									rx={1}
									className="transition-opacity hover:opacity-80"
									style={{ fill: "hsl(var(--chart-1))" }}
								/>
							</g>
						</TooltipTrigger>
						<TooltipContent side="top" className="font-mono">
							<div>{bar.bin.count} samples</div>
							<div className="text-[0.7rem] opacity-80">
								{formatLegendValue(bar.bin.start)} to{" "}
								{formatLegendValue(bar.bin.end)} cd/m2
							</div>
						</TooltipContent>
					</Tooltip>
				))}
			</svg>
			<div className="flex items-center justify-between gap-2 text-[0.54rem] text-muted-foreground">
				<span>{formatLegendValue(histogramMinimum)}</span>
				<span className="opacity-80">cd/m2 range</span>
				<span>{formatLegendValue(histogramMaximum)}</span>
			</div>
		</div>
	);
}

export function SelectionDetails({ luminanceSummary }: SelectionDetailsProps) {
	const { selection } = useImageSelection();

	const selectionDescription = useMemo(() => {
		if (!selection)
			return (
				<>
					<SquareDashed className="size-4" /> shift+click to select
				</>
			);

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
		return formatLuminanceText(luminanceSummary.average);
	}, [luminanceSummary.average]);

	const medianText = useMemo(() => {
		return formatLuminanceText(luminanceSummary.median);
	}, [luminanceSummary.median]);

	const minimumText = useMemo(() => {
		return formatLuminanceText(luminanceSummary.minimum);
	}, [luminanceSummary.minimum]);

	const maximumText = useMemo(() => {
		return formatLuminanceText(luminanceSummary.maximum);
	}, [luminanceSummary.maximum]);

	const outlierText = useMemo(() => {
		return formatOutlierText(
			luminanceSummary.outlierCount,
			luminanceSummary.sampleCount,
		);
	}, [luminanceSummary.outlierCount, luminanceSummary.sampleCount]);

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
						},
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
						<span className="text-muted-foreground">Min</span>
						<span>{minimumText}</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Max</span>
						<span>{maximumText}</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Samples</span>
						<span>{luminanceSummary.sampleCount}</span>
					</div>
					<div className="space-y-1 pt-1">
						<div className="text-[0.58rem] text-muted-foreground">
							Distribution
						</div>
						<SelectionHistogramChart
							histogram={luminanceSummary.histogram}
							histogramMinimum={luminanceSummary.histogramMinimum}
							histogramMaximum={luminanceSummary.histogramMaximum}
						/>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Outliers</span>
						<span>{outlierText}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
