"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HdrMetadataDetailsProps {
  metadata: Record<string, string> | null;
}

const PRIORITY_KEYS = ["FORMAT", "COMPUTED_VERTICAL_ILLUMINANCE", "VIEW"];

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
            // Keys are stacked above their values rather than set beside
            // them: this card is 14rem wide and a key like
            // COMPUTED_VERTICAL_ILLUMINANCE fills that on its own, leaving a
            // side-by-side value nowhere to go. break-all because header keys
            // and paths are single unbroken tokens with no wrap opportunity.
            entries.map(([key, value]) => (
              <div key={key}>
                <div className="break-all text-[0.56rem] text-muted-foreground">
                  {key}
                </div>
                <div className="break-all">{value}</div>
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
