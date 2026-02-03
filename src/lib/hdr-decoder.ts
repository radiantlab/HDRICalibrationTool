// Radiance HDR (RGBE) format decoder



export interface HdrDecodeResponse {
  width: number;
  height: number;
  buffer: ArrayBuffer; // RGBA pixel data
}

export async function decodeHdr(
  buffer: ArrayBuffer,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
  }
): Promise<HdrDecodeResponse> {
  const data = new Uint8Array(buffer);
  
  // Parse header
  const { width, height, dataStart } = parseHeader(data);
  
  // Decode RGBE data to float RGB
  const floatData = decodeRGBE(data, dataStart, width, height);
  
  // Tone map to 8-bit RGBA
  const rgbaData = toneMap(floatData, width, height);
  
  // Optionally resize if maxWidth/maxHeight specified
  let finalWidth = width;
  let finalHeight = height;
  let finalBuffer = rgbaData.buffer;
  
  if (options?.maxWidth || options?.maxHeight) {
    const scale = Math.min(
      options.maxWidth ? options.maxWidth / width : 1,
      options.maxHeight ? options.maxHeight / height : 1,
      1 // Don't upscale
    );
    
    if (scale < 1) {
      finalWidth = Math.floor(width * scale);
      finalHeight = Math.floor(height * scale);
      finalBuffer = resizeImage(rgbaData, width, height, finalWidth, finalHeight);
    }
  }
  
  return {
    width: finalWidth,
    height: finalHeight,
    buffer: finalBuffer,
  };
}

function parseHeader(data: Uint8Array): { width: number; height: number; dataStart: number } {
  const decoder = new TextDecoder('ascii');
  
  // Find the end of header (double newline)
  let headerEnd = 0;
  for (let i = 0; i < Math.min(data.length, 2000); i++) {
    if (data[i] === 0x0A && data[i + 1] === 0x0A) {
      headerEnd = i + 2;
      break;
    }
    if (data[i] === 0x0A && data[i + 1] === 0x0D && data[i + 2] === 0x0A) {
      headerEnd = i + 3;
      break;
    }
  }
  
  if (headerEnd === 0) {
    // Try alternate format - single newline before resolution
    for (let i = 0; i < Math.min(data.length, 2000); i++) {
      if (data[i] === 0x0A) {
        const nextLine = decoder.decode(data.slice(i + 1, i + 50));
        if (nextLine.startsWith('-Y') || nextLine.startsWith('+Y')) {
          headerEnd = i + 1;
          break;
        }
      }
    }
  }
  
  // Find resolution line
  let resStart = headerEnd;
  for (let i = headerEnd; i < Math.min(data.length, headerEnd + 100); i++) {
    if (data[i] === 0x0A) {
      resStart = headerEnd;
      break;
    }
  }
  
  // Parse resolution string (e.g., "-Y 512 +X 768")
  let resEnd = resStart;
  for (let i = resStart; i < Math.min(data.length, resStart + 100); i++) {
    if (data[i] === 0x0A) {
      resEnd = i;
      break;
    }
  }
  
  const resLine = decoder.decode(data.slice(resStart, resEnd));
  const resMatch = resLine.match(/[+-]Y\s+(\d+)\s+[+-]X\s+(\d+)/);
  
  if (!resMatch) {
    throw new Error(`Invalid HDR resolution line: "${resLine}"`);
  }
  
  const height = parseInt(resMatch[1], 10);
  const width = parseInt(resMatch[2], 10);
  
  return { width, height, dataStart: resEnd + 1 };
}

function decodeRGBE(data: Uint8Array, start: number, width: number, height: number): Float32Array {
  const floatData = new Float32Array(width * height * 3);
  let pos = start;
  
  for (let y = 0; y < height; y++) {
    // Check for RLE encoding
    if (data[pos] === 2 && data[pos + 1] === 2 && data[pos + 2] < 128) {
      // New RLE encoding
      const scanlineWidth = (data[pos + 2] << 8) | data[pos + 3];
      if (scanlineWidth !== width) {
        throw new Error(`Scanline width mismatch: ${scanlineWidth} vs ${width}`);
      }
      pos += 4;
      
      const scanline = new Uint8Array(width * 4);
      
      // Read each channel separately
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < width) {
          const code = data[pos++];
          if (code > 128) {
            // Run
            const count = code - 128;
            const val = data[pos++];
            for (let i = 0; i < count; i++) {
              scanline[x * 4 + ch] = val;
              x++;
            }
          } else {
            // Literals
            for (let i = 0; i < code; i++) {
              scanline[x * 4 + ch] = data[pos++];
              x++;
            }
          }
        }
      }
      
      // Convert RGBE to float
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const r = scanline[x * 4];
        const g = scanline[x * 4 + 1];
        const b = scanline[x * 4 + 2];
        const e = scanline[x * 4 + 3];
        
        if (e === 0) {
          floatData[idx] = 0;
          floatData[idx + 1] = 0;
          floatData[idx + 2] = 0;
        } else {
          const scale = Math.pow(2, e - 128 - 8);
          floatData[idx] = r * scale;
          floatData[idx + 1] = g * scale;
          floatData[idx + 2] = b * scale;
        }
      }
    } else {
      // Uncompressed or old RLE - read 4 bytes per pixel
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const r = data[pos++];
        const g = data[pos++];
        const b = data[pos++];
        const e = data[pos++];
        
        if (e === 0) {
          floatData[idx] = 0;
          floatData[idx + 1] = 0;
          floatData[idx + 2] = 0;
        } else {
          const scale = Math.pow(2, e - 128 - 8);
          floatData[idx] = r * scale;
          floatData[idx + 1] = g * scale;
          floatData[idx + 2] = b * scale;
        }
      }
    }
  }
  
  return floatData;
}

function toneMap(floatData: Float32Array, width: number, height: number): Uint8ClampedArray {
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  
  // Find max luminance for exposure adjustment
  let maxLum = 0;
  for (let i = 0; i < floatData.length; i += 3) {
    const lum = 0.2126 * floatData[i] + 0.7152 * floatData[i + 1] + 0.0722 * floatData[i + 2];
    if (lum > maxLum) maxLum = lum;
  }
  
  // Simple Reinhard tone mapping
  const exposure = 1.0;
  const gamma = 2.2;
  
  for (let i = 0; i < width * height; i++) {
    const fi = i * 3;
    const ri = i * 4;
    
    let r = floatData[fi] * exposure;
    let g = floatData[fi + 1] * exposure;
    let b = floatData[fi + 2] * exposure;
    
    // Reinhard tone mapping
    r = r / (1 + r);
    g = g / (1 + g);
    b = b / (1 + b);
    
    // Gamma correction
    r = Math.pow(r, 1 / gamma);
    g = Math.pow(g, 1 / gamma);
    b = Math.pow(b, 1 / gamma);
    
    rgbaData[ri] = Math.round(r * 255);
    rgbaData[ri + 1] = Math.round(g * 255);
    rgbaData[ri + 2] = Math.round(b * 255);
    rgbaData[ri + 3] = 255; // Alpha
  }
  
  return rgbaData;
}

function resizeImage(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): ArrayBuffer {
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;
  
  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * dstWidth + x) * 4;
      
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  
  return dst.buffer;
}