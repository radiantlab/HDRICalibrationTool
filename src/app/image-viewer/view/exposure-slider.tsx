"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCallback, useRef } from "react";
import { RotateCcw } from "lucide-react";

type ExposureSliderProps = {
	value: number;
	onChange: (value: number) => void;
};

const EXPOSURE_MIN = -6;
const EXPOSURE_MAX = 6;
const EXPOSURE_STEP = 0.1;
const EXPOSURE_DEFAULT = 0;

const formatExposureLabel = (ev: number) => {
	if (ev === 0) return "0 EV";
	const sign = ev > 0 ? "+" : "";
	return `${sign}${ev.toFixed(1)} EV`;
};

export function ExposureSlider({ value, onChange }: ExposureSliderProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	const onReset = useCallback(() => {
		onChange(EXPOSURE_DEFAULT);
	}, [onChange]);

	const onInputChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			onChange(Number.parseFloat(event.target.value));
		},
		[onChange]
	);

	const isDefault = value === EXPOSURE_DEFAULT;

	return (
		<Card className="w-full bg-background/90 shadow-md border-2">
			<CardContent className="px-3 py-2 text-[0.62rem] font-mono space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-[0.58rem] text-muted-foreground">
						Exposure
					</span>
					<button
						type="button"
						onClick={onReset}
						disabled={isDefault}
						className={cn(
							"inline-flex items-center gap-1 text-[0.54rem] text-muted-foreground transition-opacity",
							isDefault ? "opacity-30 cursor-default" : "opacity-100 hover:opacity-70 cursor-pointer"
						)}
						aria-label="Reset exposure"
					>
						<RotateCcw className="size-[0.55rem]" />
						<span>Reset</span>
					</button>
				</div>
				<div className="space-y-1.5 border-t pt-2">
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Value</span>
						<span>{formatExposureLabel(value)}</span>
					</div>
					<input
						ref={inputRef}
						type="range"
						min={EXPOSURE_MIN}
						max={EXPOSURE_MAX}
						step={EXPOSURE_STEP}
						value={value}
						onChange={onInputChange}
						className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-foreground"
						aria-label="Exposure adjustment"
					/>
					<div className="flex items-center justify-between text-[0.5rem] text-muted-foreground/60">
						<span>{EXPOSURE_MIN} EV</span>
						<span>{EXPOSURE_MAX} EV</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export { EXPOSURE_DEFAULT };