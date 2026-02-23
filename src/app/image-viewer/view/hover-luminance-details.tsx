"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type HoverLuminanceSample = {
	x: number;
	y: number;
	luminance: number;
};

type HoverLuminanceDetailsProps = {
	sample: HoverLuminanceSample | null;
	isVisible: boolean;
	isLuminanceReady: boolean;
};

const formatLuminance = (value: number) => {
	if (!Number.isFinite(value)) return "n/a";
	if (Math.abs(value) >= 1000) return value.toExponential(2);
	if (Math.abs(value) >= 10) return value.toFixed(1);
	return value.toFixed(3);
};

export function HoverLuminanceDetails({
	sample,
	isVisible,
	isLuminanceReady,
}: HoverLuminanceDetailsProps) {
	if (!isVisible) return null;

	return (
		<Card
			className={cn("w-full bg-background/90 shadow-md border-2", {
				"border-dashed": !sample,
			})}
		>
			<CardContent className="px-3 py-2 text-[0.62rem] font-mono space-y-2">
				<div className="text-[0.58rem] text-muted-foreground">Hover Luminance</div>
				<div className="space-y-1 border-t pt-2">
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Pixel</span>
						<span>
							{sample ? `${sample.x}, ${sample.y}` : "hover image"}
						</span>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Luminance</span>
						<span>
							{!isLuminanceReady
								? "computing..."
								: sample
									? `${formatLuminance(sample.luminance)} cd/m2`
									: "n/a"}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

