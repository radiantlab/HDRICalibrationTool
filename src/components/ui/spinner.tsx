import { cn } from "@/lib/utils";
import { LoaderCircle } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
	return (
		<div className={cn("size-full grid place-items-center", className)}>
			<LoaderCircle className={cn("animate-spin", className)} />
		</div>
	);
}
