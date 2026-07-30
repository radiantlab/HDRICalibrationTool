"use client";

import React from "react";
import { isTauri } from "@/lib/host/env";
import { cn } from "@/lib/utils";
import { registerSessionFile } from "@/lib/vfs";

type DragDropEvent =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

interface E2EDropDetail {
  paths: string[];
  targetId: string;
}

const E2E_DROP_EVENT = "__lumilab_e2e_drop__";

/** Whether a drag position falls within a dropzone's box. */
function contains(rect: DOMRect, position: { x: number; y: number }): boolean {
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  );
}

export interface DropzoneChildrenProps {
  isDragActive: boolean;
}

type TauriDropzoneProps = {
  onDrop?: (paths: string[]) => void;
  children?: (opts: DropzoneChildrenProps) => React.ReactNode;
} & Omit<React.ComponentProps<"button">, "onDrop" | "children">;

/**
 * DOM drag-and-drop, for the browser build.
 *
 * Files are registered under session paths so the rest of the app keeps
 * receiving `string[]`, exactly as it does from the Tauri drop event.
 */
function registerBrowserDragDrop(
  element: HTMLElement | null,
  handlers: {
    onDragActive: (active: boolean) => void;
    onDrop: (paths: string[]) => void;
  }
): (() => void) | undefined {
  if (!element) {
    return;
  }

  // Depth-counted: dragenter and dragleave fire for every descendant, so a
  // single boolean flickers off as the pointer crosses a child.
  let depth = 0;

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    depth += 1;
    handlers.onDragActive(true);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };
  const onDragLeave = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      handlers.onDragActive(false);
    }
  };
  const onDropEvent = (event: DragEvent) => {
    event.preventDefault();
    depth = 0;
    handlers.onDragActive(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }
    Promise.all(
      files.map(async (file) =>
        registerSessionFile(file.name, new Uint8Array(await file.arrayBuffer()))
      )
    ).then(handlers.onDrop);
  };

  element.addEventListener("dragenter", onDragEnter);
  element.addEventListener("dragover", onDragOver);
  element.addEventListener("dragleave", onDragLeave);
  element.addEventListener("drop", onDropEvent);

  return () => {
    element.removeEventListener("dragenter", onDragEnter);
    element.removeEventListener("dragover", onDragOver);
    element.removeEventListener("dragleave", onDragLeave);
    element.removeEventListener("drop", onDropEvent);
  };
}

export function TauriDropzone({
  disabled,
  onDrop,
  children,
  className,
  ref,
  ...props
}: TauriDropzoneProps) {
  const [isDragActive, setIsDragActive] = React.useState(false);
  const rootRef = React.useRef<HTMLButtonElement>(null);
  const handleDrop = React.useCallback(
    (paths: string[]) => {
      setIsDragActive(false);
      onDrop?.(paths);
    },
    [onDrop]
  );

  React.useEffect(() => {
    if (disabled) {
      return;
    }

    // Two entirely different drag-drop models, so this branches rather than
    // adapting. Tauri reports drops at the *window* level with OS paths and
    // window-relative coordinates, which is why the hit test below exists at
    // all. A browser fires DOM events on the element itself and hands over
    // File objects, so there is nothing to hit-test and no path to read.
    if (!isTauri()) {
      return registerBrowserDragDrop(rootRef.current, {
        onDragActive: setIsDragActive,
        onDrop: handleDrop,
      });
    }

    let cancelled = false;
    let dispose: (() => void) | undefined;

    const onDragDrop = (event: { payload: DragDropEvent }) => {
      const { payload } = event;
      if (payload.type === "leave") {
        setIsDragActive(false);
        return;
      }

      // this is slightly off, since the event position is relative to the whole window,
      // while the rect is relative to the viewport... but as far as I know tauri exposes no api to correct this
      // TODO: fix this if possible
      const currentRect = rootRef.current?.getBoundingClientRect();
      if (!currentRect) {
        return;
      }
      if (!contains(currentRect, payload.position)) {
        setIsDragActive(false);
        return;
      }

      if (payload.type === "enter" || payload.type === "over") {
        setIsDragActive(true);
        return;
      }
      if (payload.type === "drop") {
        handleDrop(payload.paths);
      }
    };

    // Awaited in sequence rather than chained. The listener resolves after the
    // effect may already have been cleaned up, which is what `cancelled` is
    // for: unsubscribing immediately is the only way to avoid a listener that
    // outlives the component.
    (async () => {
      const { getCurrentWebviewWindow } = await import(
        "@tauri-apps/api/webviewWindow"
      );
      const unlisten =
        await getCurrentWebviewWindow().onDragDropEvent(onDragDrop);
      if (cancelled) {
        unlisten();
      } else {
        dispose = unlisten;
      }
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [disabled, handleDrop]);

  React.useEffect(() => {
    if (!props.id) {
      return;
    }

    // Allow E2E tests to trigger the same drop path without OS-level drag automation.
    const onE2EDrop = (event: Event) => {
      const { detail } = event as CustomEvent<E2EDropDetail>;
      if (!detail || detail.targetId !== props.id) {
        return;
      }
      handleDrop(detail.paths ?? []);
    };

    window.addEventListener(E2E_DROP_EVENT, onE2EDrop as EventListener);
    return () => {
      window.removeEventListener(E2E_DROP_EVENT, onE2EDrop as EventListener);
    };
  }, [handleDrop, props.id]);

  return (
    <button
      type="button"
      {...props}
      className={cn("relative", className)}
      // `disabled` is destructured above, so the spread cannot carry it. Without
      // this the drag path honours it while click-to-select stays live.
      disabled={disabled}
      ref={(val) => {
        rootRef.current = val;
        switch (typeof ref) {
          case "function":
            ref(val);
            break;
          default:
            if (ref) {
              ref.current = val;
            }
            break;
        }
      }}
    >
      {children?.({ isDragActive })}
    </button>
  );
}
