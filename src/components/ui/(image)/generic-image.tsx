import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { TiffImage } from "./(tiff-image)/tiff-image";

export function GenericImage({ fsSrc }: { fsSrc: string }) {
  switch (path.extname(fsSrc).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return (
        <img className="size-full object-contain" src={convertFileSrc(fsSrc)} />
      );
    default:
      return <TiffImage src={fsSrc} />;
  }
}
