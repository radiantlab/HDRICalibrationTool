import {
	ContextMenu,
	ContextMenuItem,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ErrorBoundary as ErrorBoundaryInternal } from "react-error-boundary";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

export function ErrorBoundary({
	children,
	errorPrefixMessage,
}: {
	children: React.ReactNode;
	errorPrefixMessage?: string;
}) {
	return (
		<ErrorBoundaryInternal
			fallbackRender={({ error, resetErrorBoundary }) => (
				<Popover>
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<div className="size-full grid place-items-center font-mono text-destructive border-2 border-destructive border-dashed">
								{errorPrefixMessage} {error.message}
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent className="w-36">
							<ContextMenuItem onClick={resetErrorBoundary}>
								Retry
							</ContextMenuItem>
							<PopoverTrigger asChild>
								<ContextMenuItem>View error</ContextMenuItem>
							</PopoverTrigger>
						</ContextMenuContent>
					</ContextMenu>
					<PopoverContent className="w-[50rem]">
						<pre>{String(error)}</pre>
					</PopoverContent>
				</Popover>
			)}
		>
			{children}
		</ErrorBoundaryInternal>
	);
}
