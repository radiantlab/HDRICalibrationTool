import { ReactNode, Suspense, use } from "react";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

export function SkeletonSuspended({
	sizePlaceholder: placeholder,
	children,
	className,
}: {
	sizePlaceholder: ReactNode;
	children: Promise<ReactNode> | ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("relative", className)}>
			<Suspense
				fallback={
					<>
						<Skeleton className="absolute w-full h-full inset-0" />
						<span className="invisible">{placeholder}</span>
					</>
				}
			>
				{children instanceof Promise ? (
					<SuspendedFragment promise={children} />
				) : (
					children
				)}
			</Suspense>
		</span>
	);
}

function SuspendedFragment({ promise }: { promise: Promise<ReactNode> }) {
	return use(promise);
}
