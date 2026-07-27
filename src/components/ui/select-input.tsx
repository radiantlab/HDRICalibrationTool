import type * as React from "react";

import { cn } from "@/lib/utils";

const SelectInput = ({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<"select"> & { ref?: React.Ref<HTMLSelectElement> }) => (
  <select
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      "aria-invalid:border-destructive aria-invalid:text-destructive",
      "group-data-[invalid=true]/field:border-destructive group-data-[invalid=true]/field:text-destructive",
      className
    )}
    ref={ref}
    {...props}
  >
    {children}
  </select>
);
SelectInput.displayName = "SelectInput";

export { SelectInput };
