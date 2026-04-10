"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	Check,
	ChevronDown,
	Image as ImageIcon,
	RotateCcw,
	Thermometer,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

export type ViewType = "natural" | "luminanceHeatmap";

type ViewControlCardProps = {
	selectedViewType: ViewType;
	onSelectedViewTypeChange: (viewType: ViewType) => void;
	exposureEv: number;
	onExposureEvChange: (value: number) => void;
	isHeatmapAvailable: boolean;
};

const EXPOSURE_MIN = -6;
const EXPOSURE_MAX = 6;
const EXPOSURE_STEP = 0.1;
const EXPOSURE_DEFAULT = 0;

const VIEW_TYPE_OPTIONS: Array<{
	value: ViewType;
	label: string;
	description: string;
	icon: typeof ImageIcon;
}> = [
	{
		value: "natural",
		label: "Natural View",
		description: "Base HDR image with exposure adjustment.",
		icon: ImageIcon,
	},
	{
		value: "luminanceHeatmap",
		label: "Luminance Heatmap",
		description: "Falsecolor luminance overlay.",
		icon: Thermometer,
	},
];

const formatExposureLabel = (ev: number) => {
	if (ev === 0) return "0 EV";
	const sign = ev > 0 ? "+" : "";
	return `${sign}${ev.toFixed(1)} EV`;
};

export function ViewControlCard({
	selectedViewType,
	onSelectedViewTypeChange,
	exposureEv,
	onExposureEvChange,
	isHeatmapAvailable,
}: ViewControlCardProps) {
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const onResetExposure = useCallback(() => {
		onExposureEvChange(EXPOSURE_DEFAULT);
	}, [onExposureEvChange]);
	const selectedViewOption = useMemo(
		() =>
			VIEW_TYPE_OPTIONS.find((option) => option.value === selectedViewType) ??
			VIEW_TYPE_OPTIONS[0]!,
		[selectedViewType],
	);
	const SelectedViewIcon = selectedViewOption.icon;
	const isExposureDefault = exposureEv === EXPOSURE_DEFAULT;
	const onSelectViewType = useCallback(
		(viewType: ViewType, isDisabled: boolean) => {
			if (isDisabled) return;
			onSelectedViewTypeChange(viewType);
			setIsDropdownOpen(false);
		},
		[onSelectedViewTypeChange],
	);

	let viewControlContent = null;
	switch (selectedViewType) {
		case "natural":
			viewControlContent = (
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Exposure</span>
						<button
							type="button"
							onClick={onResetExposure}
							disabled={isExposureDefault}
							className={cn(
								"inline-flex items-center gap-1 text-[0.54rem] text-muted-foreground transition-opacity",
								isExposureDefault
									? "cursor-default opacity-30"
									: "cursor-pointer opacity-100 hover:opacity-70",
							)}
							aria-label="Reset exposure"
						>
							<RotateCcw className="size-[0.55rem]" />
							<span>Reset</span>
						</button>
					</div>
					<div className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">Value</span>
						<span>{formatExposureLabel(exposureEv)}</span>
					</div>
					<Slider
						min={EXPOSURE_MIN}
						max={EXPOSURE_MAX}
						step={EXPOSURE_STEP}
						value={[exposureEv]}
						onValueChange={(value) => {
							const nextValue = value[0];
							if (typeof nextValue === "number") {
								onExposureEvChange(nextValue);
							}
						}}
						className="py-1"
						aria-label="Exposure adjustment"
					/>
					<div className="flex items-center justify-between text-[0.5rem] text-muted-foreground/60">
						<span>{EXPOSURE_MIN} EV</span>
						<span>{EXPOSURE_MAX} EV</span>
					</div>
				</div>
			);
			break;
	}

	return (
		<TooltipProvider>
			<Card className="w-full max-h-full overflow-hidden bg-background/90 shadow-md border-2">
				<CardContent className="max-h-[calc(100vh-2rem)] overflow-y-auto px-3 py-2 text-[0.62rem] font-mono space-y-2">
					{viewControlContent}
					{viewControlContent && <Separator />}
					<div className="space-y-1.5">
						<div className="text-[0.54rem] text-muted-foreground">
							View Type
						</div>
						<Popover open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className="h-9 w-full justify-between border-border/80 bg-background/70 px-2 text-[0.58rem] font-mono shadow-none"
									aria-label="Select image view type"
								>
									<span className="inline-flex items-center gap-1.5">
										<SelectedViewIcon className="size-[0.7rem]" />
										<span>{selectedViewOption.label}</span>
									</span>
									<ChevronDown className="size-3.5 text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								align="start"
								side="top"
								className="w-(--radix-popover-trigger-width) p-1"
							>
								<div
									className="grid gap-1"
									role="listbox"
									aria-label="View type options"
								>
									{VIEW_TYPE_OPTIONS.map((option) => {
										const isSelected = option.value === selectedViewType;
										const isDisabled =
											option.value === "luminanceHeatmap" &&
											!isHeatmapAvailable;
										const Icon = option.icon;

										return (
											<Tooltip key={option.value}>
												<TooltipTrigger asChild>
													<button
														type="button"
														role="option"
														aria-selected={isSelected}
														aria-disabled={isDisabled}
														onClick={() =>
															onSelectViewType(option.value, isDisabled)
														}
														className={cn(
															"flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-[0.58rem] transition-colors",
															"focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
															isSelected
																? "bg-accent text-accent-foreground"
																: "text-foreground hover:bg-accent/60",
															isDisabled &&
																"cursor-default text-muted-foreground/50 hover:bg-transparent",
														)}
													>
														<span className="inline-flex items-center gap-1.5">
															<Icon className="size-[0.7rem]" />
															<span>{option.label}</span>
														</span>
														{isSelected && <Check className="size-3.5" />}
													</button>
												</TooltipTrigger>
												<TooltipContent side="right" className="max-w-52">
													{option.description}
												</TooltipContent>
											</Tooltip>
										);
									})}
								</div>
							</PopoverContent>
						</Popover>
					</div>
				</CardContent>
			</Card>
		</TooltipProvider>
	);
}

export { EXPOSURE_DEFAULT };
