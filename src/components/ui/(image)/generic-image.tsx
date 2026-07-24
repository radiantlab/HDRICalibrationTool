import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { TiffImage } from "./(tiff-image)/tiff-image";

export function GenericImage({ fsSrc }: { fsSrc: string }) {
  const kind: string = path.extname(fsSrc).toLowerCase();
  switch (kind) {
    case ".jpg":
    case ".jpeg":
      return (
        <img
          alt={path.basename(fsSrc)}
          className="size-full object-contain"
          src={convertFileSrc(fsSrc)}
        />
      );
    default:
      return <TiffImage src={fsSrc} />;
  }
}
