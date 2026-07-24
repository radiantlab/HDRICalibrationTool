"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type ImageRectSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageSelectionContextValue = {
  selection: ImageRectSelection | null;
  setSelection: (selection: ImageRectSelection) => void;
  clearSelection: () => void;
};

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

  const setSelection = (nextSelection: ImageRectSelection) => {
    setSelectionState(nextSelection);
  };

  const clearSelection = () => {
    setSelectionState(null);
  };

  const value = useMemo(
    () => ({
      clearSelection,
      selection,
      setSelection,
    }),
    [selection]
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
