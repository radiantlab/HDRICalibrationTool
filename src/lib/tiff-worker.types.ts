export type TiffMetadataRequest = {
	op: "metadata";
	buffer: ArrayBuffer;
	memoryBytes?: number;
};

export type TiffDecodeRequest = {
	op: "decode";
	buffer: ArrayBuffer;
	memoryBytes?: number;
	maxWidth?: number;
	maxHeight?: number;
};

export type TiffWorkerRequest = TiffMetadataRequest | TiffDecodeRequest;

export type TiffMetadataResponse = {
	op: "metadata";
	width: number;
	height: number;
};

export type TiffDecodeResponse = {
	width: number;
	height: number;
	buffer: ArrayBuffer;
};

export type TiffWorkerErrorResponse = { error: string };
