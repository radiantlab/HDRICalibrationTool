"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCallback } from "react";
import { Eye, EyeOff, Thermometer } from "lucide-react";
import type { HeatmapScaleRange } from "./heatmap-texture";

type HeatmapOverlayToggleProps = {
	isEnabled: boolean;
	onToggle: (enabled: boolean) => void;
	scaleRange: HeatmapScaleRange | null;
	isAvailable: boolean;
};

const formatScaleValue = (value: number) => {
	if (!Number.isFinite(value)) return "n/a";
	if (Math.abs(value) >= 1000) return value.toExponential(2);
	if (Math.abs(value) >= 10) return value.toFixed(1);
	return value.toFixed(3);
};

export function HeatmapOverlayToggle({
	isEnabled,
	onToggle,
	scaleRange,
	isAvailable,
}: HeatmapOverlayToggleProps) {
	const onToggleClick = useCallback(() => {
		onToggle(!isEnabled);
	}, [isEnabled, onToggle]);

	return (
		<Card className="w-full bg-background/90 shadow-md border-2">
			<CardContent className="px-3 py-2 text-[0.62rem] font-mono space-y-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1 text-[0.58rem] text-muted-foreground">
						<Thermometer className="size-[0.65rem]" />
						<span>Heatmap</span>
					</div>
					<button
						type="button"
						onClick={onToggleClick}
						disabled={!isAvailable}
						className={cn(
							"inline-flex items-center gap-1 text-[0.54rem] transition-opacity",
							!isAvailable
								? "opacity-30 cursor-default text-muted-foreground"
								: isEnabled
									? "text-foreground hover:opacity-70 cursor-pointer"
									: "text-muted-foreground hover:opacity-70 cursor-pointer"
						)}
						aria-label={isEnabled ? "Hide heatmap overlay" : "Show heatmap overlay"}
					>
						{isEnabled ? (
							<>
								<Eye className="size-[0.6rem]" />
								<span>On</span>
							</>
						) : (
							<>
								<EyeOff className="size-[0.6rem]" />
								<span>Off</span>
							</>
						)}
					</button>
				</div>
				{isEnabled && scaleRange && (
					<div className="space-y-1.5 border-t pt-2">
						<div className="flex items-center justify-between gap-2">
							<span className="text-muted-foreground">Scale Min</span>
							<span>{formatScaleValue(scaleRange.minimum)} cd/m2</span>
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-muted-foreground">Scale Max</span>
							<span>{formatScaleValue(scaleRange.maximum)} cd/m2</span>
						</div>
						<div className="h-2.5 w-full rounded-sm overflow-hidden mt-1">
							<div
								className="h-full w-full"
								style={{
									background:
										"linear-gradient(to right, #000033, #0000cc, #0099ff, #00e666, #66ff00, #cce600, #ff9900, #ff3300, #cc0000)",
								}}
							/>
						</div>
						<div className="flex items-center justify-between text-[0.5rem] text-muted-foreground/60">
							<span>Low</span>
							<span>cd/m2</span>
							<span>High</span>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}