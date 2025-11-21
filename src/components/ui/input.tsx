import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
	HTMLInputElement,
	React.ComponentProps<"input"> & {
		icon?: React.ReactNode;
	}
>(({ className, type, icon, ...props }, ref) => {
	return (
		<div className="inline relative group">
			{icon && (
				<div
					className={cn(
						"grid place-items-center h-full w-6 text-muted-foreground absolute left-0 top-0 group-focus-within:text-foreground transition-colors",
						"*:size-4"
					)}
				>
					{icon}
				</div>
			)}
			<input
				type={type}
				className={cn(
					"flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-0 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
					{ "pl-6": icon },
					className
				)}
				ref={ref}
				{...props}
			/>
		</div>
	);
});
Input.displayName = "Input";

export { Input };
