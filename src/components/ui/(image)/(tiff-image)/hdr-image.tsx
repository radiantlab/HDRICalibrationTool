"use client";

import { memo, Suspense, useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { Spinner } from "@/components/ui/spinner";
import { lazy } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { decodeHdr, HdrDecodeResponse } from "@/lib/hdr-decoder";

const TiffImageInner = lazy(() => import("./tiff-image-inner"));

export const HdrImage = memo(function HdrImage({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hdrPromise, setHdrPromise] = useState<Promise<HdrDecodeResponse>>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const controller = new AbortController();

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const maxWidth = Math.floor((container.clientWidth || 0) * dpr) || undefined;
    const maxHeight = Math.floor((container.clientHeight || 0) * dpr) || undefined;

    console.log("HDR decoder - maxWidth:", maxWidth, "maxHeight:", maxHeight);

    const newPromise = readFile(src)
      .then((fileData) => {
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return decodeHdr(fileData.buffer, { maxWidth, maxHeight });
      });

    setHdrPromise(newPromise);

    return () => {
      controller.abort();
    };
  }, [src, containerRef.current]);

  return (
    <div ref={containerRef} className="size-full">
      <ErrorBoundary errorPrefixMessage="Error loading HDR image">
        <Suspense fallback={<Spinner />}>
          {hdrPromise && <TiffImageInner tiffPromise={hdrPromise} />}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
});