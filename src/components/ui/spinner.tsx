import { cn } from "@/lib/utils";
import { LoaderCircle } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
	return (
		<div className="size-full grid place-items-center">
			<LoaderCircle className={cn("animate-spin", className)} />
		</div>
	);
}
