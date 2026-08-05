"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface HoverLuminanceSample {
  luminance: number;
  x: number;
  y: number;
}

interface HoverLuminanceDetailsProps {
  isLuminanceReady: boolean;
  isVisible: boolean;
  sample: HoverLuminanceSample | null;
}

const formatLuminance = (value: number) => {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1000) {
    return value.toExponential(2);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(3);
};

function formatLuminanceLabel(
  isLuminanceReady: boolean,
  sample: HoverLuminanceSample | null
) {
  if (!isLuminanceReady) {
    return "computing...";
  }
  if (!sample) {
    return "n/a";
  }
  return `${formatLuminance(sample.luminance)} cd/m2`;
}

export function HoverLuminanceDetails({
  sample,
  isVisible,
  isLuminanceReady,
}: HoverLuminanceDetailsProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <Card
      className={cn("w-full border-2 bg-background/90 shadow-md", {
        "border-dashed": !sample,
      })}
    >
      <CardContent className="space-y-2 px-3 py-2 font-mono text-[0.62rem]">
        <div className="text-[0.58rem] text-muted-foreground">
          Hover Luminance
        </div>
        <div className="space-y-1 border-t pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Pixel</span>
            <span>{sample ? `${sample.x}, ${sample.y}` : "hover image"}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Luminance</span>
            <span>{formatLuminanceLabel(isLuminanceReady, sample)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
