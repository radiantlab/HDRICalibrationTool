"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface SelectedImageContextValue {
  selectedImage: string | undefined;
  /**
   * Accepts `undefined` so a caller can clear the selection. Removing the file
   * that is selected has to be able to say so: a path the form no longer
   * contains must not go on driving the mask preview, whose metadata promise
   * would then be resolved against a frame the user threw away -- and, for a
   * RAW frame whose queued conversion was dropped with it, never resolve at
   * all.
   */
  setSelectedImage: (image: string | undefined) => void;
}

const selectedImageContext = createContext<
  SelectedImageContextValue | undefined
>(undefined);

export function SelectedImageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedImage, setSelectedImage] = useState<string | undefined>(
    undefined
  );

  const value = useMemo(
    () => ({
      selectedImage,
      setSelectedImage,
    }),
    [selectedImage]
  );

  return (
    <selectedImageContext.Provider value={value}>
      {children}
    </selectedImageContext.Provider>
  );
}

export function useSelectedImage() {
  const context = useContext(selectedImageContext);
  if (!context) {
    throw new Error(
      "useSelectedImage must be used within a SelectedImageProvider"
    );
  }

  return context;
}
