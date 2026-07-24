"use client";

import { createContext, useContext, useMemo, useState } from "react";

type SelectedImageContextValue = {
  selectedImage: string | undefined;
  setSelectedImage: (image: string) => void;
};

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
