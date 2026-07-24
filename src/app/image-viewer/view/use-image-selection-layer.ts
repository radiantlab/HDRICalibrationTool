import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ImageRectSelection,
  useImageSelection,
} from "./image-selection-context";

const DEFAULT_DRAG_THRESHOLD_PX = 3;

interface ImagePoint {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startClient: ImagePoint;
  startImage: ImagePoint;
}

export interface ImageSelectionOverlay {
  heightPercent: number;
  leftPercent: number;
  showTint: boolean;
  topPercent: number;
  widthPercent: number;
}

interface UseImageSelectionLayerParams {
  dragThresholdPx?: number;
  imageDimensions: [width: number, height: number] | null;
  surfaceRef: RefObject<Element | null>;
}

interface LayerPointerHandlers {
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const buildRectFromPoints = (
  startPoint: ImagePoint,
  endPoint: ImagePoint
): ImageRectSelection => {
  const x = Math.min(startPoint.x, endPoint.x);
  const y = Math.min(startPoint.y, endPoint.y);
  const width = Math.abs(endPoint.x - startPoint.x);
  const height = Math.abs(endPoint.y - startPoint.y);
  return { height, width, x, y };
};

export function useImageSelectionLayer({
  imageDimensions,
  surfaceRef,
  dragThresholdPx = DEFAULT_DRAG_THRESHOLD_PX,
}: UseImageSelectionLayerParams) {
  const { selection, setSelection, clearSelection } = useImageSelection();
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [draftSelection, setDraftSelection] =
    useState<ImageRectSelection | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsShiftPressed(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    const onWindowBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  const resolveImagePoint = useCallback(
    (clientX: number, clientY: number): ImagePoint | null => {
      if (!imageDimensions) {
        return null;
      }
      const [imageWidth, imageHeight] = imageDimensions;
      const surfaceElement = surfaceRef.current;
      if (!surfaceElement || imageWidth <= 0 || imageHeight <= 0) {
        return null;
      }

      const surfaceRect = surfaceElement.getBoundingClientRect();
      if (surfaceRect.width <= 0 || surfaceRect.height <= 0) {
        return null;
      }

      const normalizedX = clamp(
        (clientX - surfaceRect.left) / surfaceRect.width,
        0,
        1
      );
      const normalizedY = clamp(
        (clientY - surfaceRect.top) / surfaceRect.height,
        0,
        1
      );

      return {
        x: normalizedX * imageWidth,
        y: normalizedY * imageHeight,
      };
    },
    [imageDimensions, surfaceRef]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !event.shiftKey || !imageDimensions) {
        return;
      }
      const startImagePoint = resolveImagePoint(event.clientX, event.clientY);
      if (!startImagePoint) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      dragStateRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startImage: startImagePoint,
      };
      setIsSelecting(true);
      setDraftSelection({
        height: 0,
        width: 0,
        x: startImagePoint.x,
        y: startImagePoint.y,
      });
    },
    [imageDimensions, resolveImagePoint]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const currentImagePoint = resolveImagePoint(event.clientX, event.clientY);
      if (!currentImagePoint) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setDraftSelection(
        buildRectFromPoints(dragState.startImage, currentImagePoint)
      );
    },
    [resolveImagePoint]
  );

  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
    setIsSelecting(false);
    setDraftSelection(null);
  }, []);

  const selectWholeImage = useCallback(() => {
    if (!imageDimensions) {
      return;
    }
    const [imageWidth, imageHeight] = imageDimensions;
    if (imageWidth <= 0 || imageHeight <= 0) {
      return;
    }

    clearDragState();
    setSelection({
      height: imageHeight,
      width: imageWidth,
      x: 0,
      y: 0,
    });
  }, [clearDragState, imageDimensions, setSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSelectAllShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a";

      if (!isSelectAllShortcut) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      selectWholeImage();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectWholeImage]);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const endImagePoint =
        resolveImagePoint(event.clientX, event.clientY) ?? dragState.startImage;
      const nextSelection = buildRectFromPoints(
        dragState.startImage,
        endImagePoint
      );
      const movedDistance = Math.hypot(
        event.clientX - dragState.startClient.x,
        event.clientY - dragState.startClient.y
      );
      const didDrag = movedDistance >= dragThresholdPx;

      event.preventDefault();
      event.stopPropagation();

      if (didDrag && nextSelection.width > 0 && nextSelection.height > 0) {
        setSelection(nextSelection);
      } else {
        clearSelection();
      }

      clearDragState();
    },
    [
      clearDragState,
      clearSelection,
      dragThresholdPx,
      resolveImagePoint,
      setSelection,
    ]
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      event.preventDefault();
      event.stopPropagation();
      clearDragState();
    },
    [clearDragState]
  );

  const overlay = useMemo<ImageSelectionOverlay | null>(() => {
    if (!imageDimensions) {
      return null;
    }
    const [imageWidth, imageHeight] = imageDimensions;
    if (imageWidth <= 0 || imageHeight <= 0) {
      return null;
    }

    const activeSelection = draftSelection ?? selection;
    if (!activeSelection) {
      return null;
    }

    const leftPercent = clamp((activeSelection.x / imageWidth) * 100, 0, 100);
    const topPercent = clamp((activeSelection.y / imageHeight) * 100, 0, 100);
    const widthPercent = clamp(
      (activeSelection.width / imageWidth) * 100,
      0,
      100 - leftPercent
    );
    const heightPercent = clamp(
      (activeSelection.height / imageHeight) * 100,
      0,
      100 - topPercent
    );

    return {
      heightPercent,
      leftPercent,
      showTint: draftSelection !== null,
      topPercent,
      widthPercent,
    };
  }, [draftSelection, imageDimensions, selection]);

  const layerPointerHandlers = useMemo<LayerPointerHandlers>(
    () => ({
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    }),
    [onPointerCancel, onPointerDown, onPointerMove, onPointerUp]
  );

  return {
    isSelecting,
    isSelectionInputEnabled: isShiftPressed || isSelecting,
    isShiftPressed,
    layerPointerHandlers,
    overlay,
  };
}
