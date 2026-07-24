import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("grid size-full place-items-center", className)}>
      <LoaderCircle className={cn("animate-spin", className)} />
    </div>
  );
}
