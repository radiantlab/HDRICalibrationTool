"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface ImageRectSelection {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface ImageSelectionContextValue {
  clearSelection: () => void;
  selection: ImageRectSelection | null;
  setSelection: (selection: ImageRectSelection) => void;
}

const imageSelectionContext = createContext<
  ImageSelectionContextValue | undefined
>(undefined);

export function ImageSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selection, setSelectionState] = useState<ImageRectSelection | null>(
    null
  );

  const setSelection = useCallback((nextSelection: ImageRectSelection) => {
    setSelectionState(nextSelection);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState(null);
  }, []);

  const value = useMemo(
    () => ({
      clearSelection,
      selection,
      setSelection,
    }),
    [selection, setSelection, clearSelection]
  );

  return (
    <imageSelectionContext.Provider value={value}>
      {children}
    </imageSelectionContext.Provider>
  );
}

export function useImageSelection() {
  const context = useContext(imageSelectionContext);
  if (!context) {
    throw new Error(
      "useImageSelection must be used within an ImageSelectionProvider"
    );
  }

  return context;
}
