import { ErrorBoundary as ErrorBoundaryInternal } from "react-error-boundary";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
              <div className="grid size-full place-items-center border-2 border-destructive border-dashed font-mono text-destructive">
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
          <PopoverContent className="w-200">
            <pre>{String(error)}</pre>
          </PopoverContent>
        </Popover>
      )}
    >
      {children}
    </ErrorBoundaryInternal>
  );
}
