import { type ReactNode, Suspense, use } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

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
            <Skeleton className="absolute inset-0 h-full w-full" />
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
