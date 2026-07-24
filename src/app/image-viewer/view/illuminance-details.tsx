"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HdrMetadataDetailsProps {
  metadata: Record<string, string> | null;
}

const PRIORITY_KEYS = ["FORMAT", "PHOTOPIC_ILLUMINANCE", "VIEW"];

export function HdrMetadataDetails({ metadata }: HdrMetadataDetailsProps) {
  const entries = Object.entries(metadata ?? {}).sort(
    ([leftKey], [rightKey]) => {
      const leftPriority = PRIORITY_KEYS.indexOf(leftKey);
      const rightPriority = PRIORITY_KEYS.indexOf(rightKey);

      if (leftPriority !== -1 || rightPriority !== -1) {
        if (leftPriority === -1) {
          return 1;
        }
        if (rightPriority === -1) {
          return -1;
        }
        return leftPriority - rightPriority;
      }

      return leftKey.localeCompare(rightKey);
    }
  );

  return (
    <Card
      className={cn("w-full border-2 bg-background/90 shadow-md", {
        "border-dashed": entries.length === 0,
      })}
    >
      <CardContent className="space-y-2 px-3 py-2 font-mono text-[0.62rem]">
        <div className="text-[0.58rem] text-muted-foreground">HDR Metadata</div>
        <div className="max-h-48 space-y-1 overflow-y-auto border-t pt-2 pr-1">
          {entries.length > 0 ? (
            entries.map(([key, value]) => (
              <div className="flex items-start justify-between gap-2" key={key}>
                <span className="shrink-0 text-muted-foreground">{key}</span>
                <span className="wrap-break-word text-right">{value}</span>
              </div>
            ))
          ) : (
            <div className="text-[0.58rem] text-amber-600 dark:text-amber-400">
              No HDR metadata was found in the header.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
