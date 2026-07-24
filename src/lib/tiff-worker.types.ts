export interface TiffMetadataRequest {
  buffer: ArrayBuffer;
  memoryBytes?: number;
  op: "metadata";
}

export interface TiffDecodeRequest {
  buffer: ArrayBuffer;
  maxHeight?: number;
  maxWidth?: number;
  memoryBytes?: number;
  op: "decode";
}

export type TiffWorkerRequest = TiffMetadataRequest | TiffDecodeRequest;

export interface TiffMetadataResponse {
  height: number;
  op: "metadata";
  width: number;
}

export interface TiffDecodeResponse {
  buffer: ArrayBuffer;
  height: number;
  width: number;
}

export interface TiffWorkerErrorResponse {
  error: string;
}
