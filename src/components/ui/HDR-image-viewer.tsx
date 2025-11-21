/**
 * HDR Image Viewer Component
 *
 * Displays images with zoom and pan overlay controls.
 * Uses GenericImage component which handles HDR/RAW/TIFF conversion via backend.
 */
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { basename } from "@tauri-apps/api/path";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FolderOpen,
  ImageIcon,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { GenericImage } from "@/components/ui/(image)/generic-image";

const PAN_STEP = 50;

export default function ImageViewer() {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState<number>(100);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);

  async function browseAndOpen() {
    setError(null);
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: [
              "hdr",
              "tif",
              "tiff",
              "jpg",
              "jpeg",
              "png",
              "cr2",
              "nef",
              "arw",
              "dng",
            ],
          },
        ],
      });

      if (file && typeof file === "string") {
        setImagePath(file);
        const name = await basename(file);
        setImageName(name);
        resetView();
      }
    } catch (err) {
      console.error("Error during file selection:", err);
      setError("Failed to select image");
    }
  }

  function resetView() {
    setZoom(100);
    setPanX(0);
    setPanY(0);
  }

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 400));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 25, 10));
  }, []);

  const handlePanUp = useCallback(() => {
    setPanY((prev) => prev + PAN_STEP);
  }, []);

  const handlePanDown = useCallback(() => {
    setPanY((prev) => prev - PAN_STEP);
  }, []);

  const handlePanLeft = useCallback(() => {
    setPanX((prev) => prev + PAN_STEP);
  }, []);

  const handlePanRight = useCallback(() => {
    setPanX((prev) => prev - PAN_STEP);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - panX,
          y: e.clientY - panY,
        });
      }
    },
    [panX, panY]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setPanX(e.clientX - dragStart.x);
        setPanY(e.clientY - dragStart.y);
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    setZoom((prev) => Math.min(Math.max(prev + delta, 10), 400));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          handlePanUp();
          break;
        case "ArrowDown":
          e.preventDefault();
          handlePanDown();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlePanLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          handlePanRight();
          break;
        case "+":
        case "=":
          e.preventDefault();
          handleZoomIn();
          break;
        case "-":
          e.preventDefault();
          handleZoomOut();
          break;
        case "0":
          e.preventDefault();
          resetView();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePanUp, handlePanDown, handlePanLeft, handlePanRight, handleZoomIn, handleZoomOut]);

  const overlayBtnClass =
    "h-10 w-10 bg-black/70 hover:bg-black/90 border-neutral-600 text-white";

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950">
      {/* Header */}
      <div className="h-14 border-b border-neutral-800 px-4 flex items-center justify-between bg-neutral-900">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-neutral-400" />
          <h1 className="text-lg font-semibold text-white">HDR Image Viewer</h1>
        </div>

        <div className="flex items-center gap-4">
          {imageName && (
            <span className="text-sm text-neutral-400">
              {imageName} | {zoom}%
            </span>
          )}
          <Button onClick={browseAndOpen} variant="outline" size="sm">
            <FolderOpen className="h-4 w-4 mr-2" />
            Browse
          </Button>
        </div>
      </div>

      {/* Image Viewport */}
      <div
        ref={viewportRef}
        className="flex-1 relative overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        {imagePath ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom / 100})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.15s ease-out",
            }}
          >
            <div className="w-[80vw] h-[80vh]">
              <GenericImage fsSrc={imagePath} />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500">
            <ImageIcon className="h-20 w-20 mb-4 opacity-30" />
            <p className="text-lg">No image loaded</p>
            <p className="text-sm mt-2">Click "Browse" to select an image</p>
            <p className="text-xs mt-4 text-neutral-600">
              Supports: HDR, TIFF, JPG, PNG, RAW (CR2, NEF, ARW, DNG)
            </p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        )}

        {/* Overlay Controls - only show when image is loaded */}
        {imagePath && (
          <>
            {/* Zoom controls - top right */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomIn}
                    disabled={zoom >= 400}
                    className={overlayBtnClass}
                  >
                    <ZoomIn className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Zoom In (+)</TooltipContent>
              </Tooltip>

              <div className="h-10 flex items-center justify-center text-sm text-white bg-black/70 rounded border border-neutral-600 px-2 min-w-[60px]">
                {zoom}%
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomOut}
                    disabled={zoom <= 10}
                    className={overlayBtnClass}
                  >
                    <ZoomOut className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Zoom Out (-)</TooltipContent>
              </Tooltip>
            </div>

            {/* Pan Up - top center */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePanUp}
                    className={overlayBtnClass}
                  >
                    <ChevronUp className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Pan Up (↑)</TooltipContent>
              </Tooltip>
            </div>

            {/* Pan Down - bottom center */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePanDown}
                    className={overlayBtnClass}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Pan Down (↓)</TooltipContent>
              </Tooltip>
            </div>

            {/* Pan Left - left center */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePanLeft}
                    className={overlayBtnClass}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Pan Left (←)</TooltipContent>
              </Tooltip>
            </div>

            {/* Pan Right - right center */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePanRight}
                    className={overlayBtnClass}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Pan Right (→)</TooltipContent>
              </Tooltip>
            </div>

            {/* Reset - bottom left */}
            <div className="absolute bottom-4 left-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={resetView}
                    className={overlayBtnClass}
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Reset View (0)</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {/* Footer with keyboard hints */}
      <div className="h-8 border-t border-neutral-800 px-4 flex items-center justify-center bg-neutral-900">
        <span className="text-xs text-neutral-500">
          Scroll to zoom • Drag to pan • Arrow keys to navigate • Press 0 to reset
        </span>
      </div>
    </div>
  );
}