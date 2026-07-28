"use client";

import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React from "react";
import { cn } from "@/lib/utils";

type DragDropEvent =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

interface E2EDropDetail {
  paths: string[];
  targetId: string;
}

const E2E_DROP_EVENT = "__hdricalibrationtool_e2e_drop__";

export interface DropzoneChildrenProps {
  isDragActive: boolean;
}

type TauriDropzoneProps = {
  onDrop?: (paths: string[]) => void;
  children?: (opts: DropzoneChildrenProps) => React.ReactNode;
} & Omit<React.ComponentProps<"button">, "onDrop" | "children">;

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

    const unlistenPromise = getCurrentWebviewWindow().onDragDropEvent(
      (event) => {
        const payload: DragDropEvent = event.payload;
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
        const isInside =
          payload.position.x >= currentRect.left &&
          payload.position.x <= currentRect.right &&
          payload.position.y >= currentRect.top &&
          payload.position.y <= currentRect.bottom;
        if (!isInside) {
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
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
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
