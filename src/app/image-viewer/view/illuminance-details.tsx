"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HdrMetadataDetailsProps = {
	metadata: Record<string, string> | null;
};

const PRIORITY_KEYS = ["FORMAT", "PHOTOPIC_ILLUMINANCE", "VIEW"];

export function HdrMetadataDetails({ metadata }: HdrMetadataDetailsProps) {
	const entries = Object.entries(metadata ?? {}).sort(
		([leftKey], [rightKey]) => {
			const leftPriority = PRIORITY_KEYS.indexOf(leftKey);
			const rightPriority = PRIORITY_KEYS.indexOf(rightKey);

			if (leftPriority !== -1 || rightPriority !== -1) {
				if (leftPriority === -1) return 1;
				if (rightPriority === -1) return -1;
				return leftPriority - rightPriority;
			}

			return leftKey.localeCompare(rightKey);
		}
	);

	return (
		<Card
			className={cn("w-full bg-background/90 shadow-md border-2", {
				"border-dashed": entries.length === 0,
			})}
		>
			<CardContent className="px-3 py-2 text-[0.62rem] font-mono space-y-2">
				<div className="text-[0.58rem] text-muted-foreground">HDR Metadata</div>
				<div className="space-y-1 border-t pt-2 max-h-48 overflow-y-auto pr-1">
					{entries.length > 0 ? (
						entries.map(([key, value]) => (
							<div key={key} className="flex items-start justify-between gap-2">
								<span className="text-muted-foreground shrink-0">{key}</span>
								<span className="text-right wrap-break-word">{value}</span>
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
