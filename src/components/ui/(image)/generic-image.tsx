import { convertFileSrc } from "@tauri-apps/api/core";
import path from "path";
import { TiffImage } from "./(tiff-image)/tiff-image";
import { HdrImage } from "./(tiff-image)/hdr-image";

export function GenericImage({ fsSrc }: { fsSrc: string }) {
	switch (path.extname(fsSrc).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return (
				<img src={convertFileSrc(fsSrc)} className="size-full object-contain" />
			);
		case ".hdr":
			return <HdrImage src={fsSrc} />;
		default:
			return <TiffImage src={fsSrc} />;
	}
}