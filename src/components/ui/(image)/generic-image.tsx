"use client";

import path from "path";
import { useEffect, useState } from "react";
import { imageSrc } from "@/lib/host/image-src";
import { TiffImage } from "./(tiff-image)/tiff-image";

export function GenericImage({ fsSrc }: { fsSrc: string }) {
  const kind: string = path.extname(fsSrc).toLowerCase();
  if (kind === ".jpg" || kind === ".jpeg") {
    return <JpegImage fsSrc={fsSrc} />;
  }
  return <TiffImage src={fsSrc} />;
}

/**
 * A JPEG the browser decodes itself.
 *
 * Resolving the source is asynchronous now: Tauri maps a real path onto its
 * asset protocol, while a browser has only bytes and needs an object URL made
 * from them. `convertFileSrc` used to be called inline, which no longer works
 * because there may be no path a browser can fetch.
 */
function JpegImage({ fsSrc }: { fsSrc: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    imageSrc(fsSrc)
      .then((resolved) => {
        if (!cancelled) {
          setSrc(resolved);
        }
      })
      .catch(() => {
        // A thumbnail that cannot resolve renders as nothing rather than
        // tearing down the set it belongs to.
      });
    return () => {
      cancelled = true;
    };
  }, [fsSrc]);

  if (!src) {
    return <div className="size-full" />;
  }
  return (
    <img
      alt={path.basename(fsSrc)}
      className="size-full select-none object-contain"
      draggable={false}
      src={src}
    />
  );
}
