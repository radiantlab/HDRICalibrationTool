"use client";

import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  RotateCcw,
  Thermometer,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
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

export type ViewType = "natural" | "luminanceHeatmap";

interface ViewControlCardProps {
  exposureEv: number;
  isHeatmapAvailable: boolean;
  onExposureEvChange: (value: number) => void;
  onSelectedViewTypeChange: (viewType: ViewType) => void;
  selectedViewType: ViewType;
}

const EXPOSURE_MIN = -6;
const EXPOSURE_MAX = 6;
const EXPOSURE_STEP = 0.1;
const EXPOSURE_DEFAULT = 0;

// `as const` gives this a fixed-length tuple type, so indexing
// `VIEW_TYPE_OPTIONS[0]` below is statically known to be defined (no
// non-null assertion needed) under `noUncheckedIndexedAccess`.
const VIEW_TYPE_OPTIONS = [
  {
    description: "Base HDR image with exposure adjustment.",
    icon: ImageIcon,
    label: "Natural View",
    value: "natural",
  },
  {
    description: "Falsecolor luminance overlay.",
    icon: Thermometer,
    label: "Luminance Heatmap",
    value: "luminanceHeatmap",
  },
] as const satisfies ReadonlyArray<{
  value: ViewType;
  label: string;
  description: string;
  icon: typeof ImageIcon;
}>;

const formatExposureLabel = (ev: number) => {
  if (ev === 0) {
    return "0 EV";
  }
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
      VIEW_TYPE_OPTIONS[0],
    [selectedViewType]
  );
  const SelectedViewIcon = selectedViewOption.icon;
  const isExposureDefault = exposureEv === EXPOSURE_DEFAULT;
  const onSelectViewType = useCallback(
    (viewType: ViewType, isDisabled: boolean) => {
      if (isDisabled) {
        return;
      }
      onSelectedViewTypeChange(viewType);
      setIsDropdownOpen(false);
    },
    [onSelectedViewTypeChange]
  );

  let viewControlContent: ReactNode = null;
  switch (selectedViewType) {
    case "natural":
      viewControlContent = (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Exposure</span>
            <button
              aria-label="Reset exposure"
              className={cn(
                "inline-flex items-center gap-1 text-[0.54rem] text-muted-foreground transition-opacity",
                isExposureDefault
                  ? "cursor-default opacity-30"
                  : "cursor-pointer opacity-100 hover:opacity-70"
              )}
              disabled={isExposureDefault}
              onClick={onResetExposure}
              type="button"
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
            aria-label="Exposure adjustment"
            className="py-1"
            max={EXPOSURE_MAX}
            min={EXPOSURE_MIN}
            onValueChange={(value) => {
              const [nextValue] = value;
              if (typeof nextValue === "number") {
                onExposureEvChange(nextValue);
              }
            }}
            step={EXPOSURE_STEP}
            value={[exposureEv]}
          />
          <div className="flex items-center justify-between text-[0.5rem] text-muted-foreground/60">
            <span>{EXPOSURE_MIN} EV</span>
            <span>{EXPOSURE_MAX} EV</span>
          </div>
        </div>
      );
      break;
    default:
      break;
  }

  return (
    <TooltipProvider>
      <Card className="max-h-full w-full overflow-hidden border-2 bg-background/90 shadow-md">
        <CardContent className="max-h-[calc(100vh-2rem)] space-y-2 overflow-y-auto px-3 py-2 font-mono text-[0.62rem]">
          {viewControlContent}
          {viewControlContent ? <Separator /> : null}
          <div className="space-y-1.5">
            <div className="text-[0.54rem] text-muted-foreground">
              View Type
            </div>
            <Popover onOpenChange={setIsDropdownOpen} open={isDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  aria-label="Select image view type"
                  className="h-9 w-full justify-between border-border/80 bg-background/70 px-2 font-mono text-[0.58rem] shadow-none"
                  variant="outline"
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
                className="w-(--radix-popover-trigger-width) p-1"
                side="top"
              >
                <div
                  aria-label="View type options"
                  className="grid gap-1"
                  role="listbox"
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
                            aria-disabled={isDisabled}
                            aria-selected={isSelected}
                            className={cn(
                              "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-[0.58rem] transition-colors",
                              "focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
                              isSelected
                                ? "bg-accent text-accent-foreground"
                                : "text-foreground hover:bg-accent/60",
                              isDisabled &&
                                "cursor-default text-muted-foreground/50 hover:bg-transparent"
                            )}
                            onClick={() =>
                              onSelectViewType(option.value, isDisabled)
                            }
                            role="option"
                            type="button"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Icon className="size-[0.7rem]" />
                              <span>{option.label}</span>
                            </span>
                            {isSelected && <Check className="size-3.5" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-52" side="right">
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
