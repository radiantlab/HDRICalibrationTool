/**
 * HDR Image Viewer
 *
 * Interactive image viewer with zoom, pan, drag, and keyboard controls.
 * Uses Tom's GenericImage component under the hood so all image formats
 * (JPG, CR2, HDR, TIFF, etc.) are supported through the existing
 * conversion pipelines.
 */
"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { basename } from "@tauri-apps/api/path";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
  }, [
    handlePanUp,
    handlePanDown,
    handlePanLeft,
    handlePanRight,
    handleZoomIn,
    handleZoomOut,
  ]);

  const overlayBtnClass =
    "h-10 w-10 bg-black/70 hover:bg-black/90 border-neutral-600 text-white";

  return (
    <TooltipProvider>
      <div className="h-full w-full flex flex-col bg-neutral-950">
        {/* Header */}
        <div className="h-14 border-b border-neutral-800 px-4 flex items-center justify-between bg-neutral-900 shrink-0">
          <div className="flex items-center gap-3">
            <ImageIcon className="h-5 w-5 text-neutral-400" />
            <h1 className="text-lg font-semibold text-white">
              HDR Image Viewer
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {imageName && (
              <span className="text-sm text-neutral-400">
                {imageName} &middot; {zoom}%
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
              {/* Use Tom's GenericImage for format-agnostic rendering */}
              <div className="w-[80vw] h-[80vh]">
                <GenericImage fsSrc={imagePath} />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 gap-4">
              <ImageIcon className="h-16 w-16 opacity-30" />
              <p className="text-lg">No image loaded</p>
              <p className="text-sm text-neutral-600">
                Click <strong>Browse</strong> or press{" "}
                <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-xs">
                  O
                </kbd>{" "}
                to open an image
              </p>
              <Button
                onClick={browseAndOpen}
                variant="outline"
                size="lg"
                className="mt-2"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Browse for Image
              </Button>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/80 text-red-200 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Overlay Controls — only show when image is loaded */}
          {imagePath && (
            <>
              {/* Zoom controls — bottom-right */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={overlayBtnClass}
                      onClick={handleZoomIn}
                    >
                      <ZoomIn className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Zoom In (+)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={overlayBtnClass}
                      onClick={handleZoomOut}
                    >
                      <ZoomOut className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Zoom Out (-)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={overlayBtnClass}
                      onClick={resetView}
                    >
                      <RotateCcw className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Reset View (0)</TooltipContent>
                </Tooltip>
              </div>

              {/* Pan controls — bottom-left */}
              <div className="absolute bottom-4 left-4">
                <div className="grid grid-cols-3 gap-0.5 w-[7.5rem]">
                  {/* Row 1: up */}
                  <div />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={overlayBtnClass}
                        onClick={handlePanUp}
                      >
                        <ChevronUp className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Pan Up (↑)</TooltipContent>
                  </Tooltip>
                  <div />

                  {/* Row 2: left, center placeholder, right */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={overlayBtnClass}
                        onClick={handlePanLeft}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Pan Left (←)</TooltipContent>
                  </Tooltip>
                  <div />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={overlayBtnClass}
                        onClick={handlePanRight}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Pan Right (→)</TooltipContent>
                  </Tooltip>

                  {/* Row 3: down */}
                  <div />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className={overlayBtnClass}
                        onClick={handlePanDown}
                      >
                        <ChevronDown className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Pan Down (↓)</TooltipContent>
                  </Tooltip>
                  <div />
                </div>
              </div>

              {/* Status bar */}
              <div className="absolute bottom-0 left-0 right-0 h-7 bg-neutral-900/80 border-t border-neutral-800 px-4 flex items-center justify-between text-xs text-neutral-500">
                <span>Zoom: {zoom}%</span>
                <span>Scroll to zoom · Drag to pan · Arrow keys to navigate</span>
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}