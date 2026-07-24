import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & {
    icon?: React.ReactNode;
  }
>(({ className, type, icon, ...props }, ref) => {
  return (
    <div className="group relative inline">
      {icon && (
        <div
          className={cn(
            "absolute top-0 left-0 grid h-full w-6 place-items-center text-muted-foreground transition-colors group-focus-within:text-foreground",
            "*:size-4"
          )}
        >
          {icon}
        </div>
      )}
      <input
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          // Highlight invalid state using aria on the input or data-invalid on the nearest Field group
          "aria-invalid:border-destructive aria-invalid:text-destructive aria-invalid:placeholder:text-destructive/70",
          "group-data-[invalid=true]/field:border-destructive group-data-[invalid=true]/field:text-destructive group-data-[invalid=true]/field:focus-visible:border-destructive group-data-[invalid=true]/field:placeholder:text-destructive/70",
          { "pl-6": icon },
          className
        )}
        ref={ref}
        type={type}
        {...props}
      />
    </div>
  );
});
Input.displayName = "Input";

export { Input };
