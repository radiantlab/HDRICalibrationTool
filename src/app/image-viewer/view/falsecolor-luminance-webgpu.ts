const DEFAULT_FALSECOLOR_MULTIPLIER = 179;
const RADIANCE_BRIGHTNESS_WEIGHTS = {
  blue: 0.064_811_243,
  green: 0.670_114_631,
  red: 0.265_074_126,
} as const;
const WORKGROUP_SIZE = 64;

interface ComputeInput {
  exposure?: number;
  height: number;
  multiplier?: number;
  preferWebGPU?: boolean;
  rgba: Float32Array;
  width: number;
}

export interface FalsecolorLuminanceMatrix {
  exposure: number;
  height: number;
  multiplier: number;
  values: Float32Array;
  width: number;
}

interface FalsecolorPixelRgbInput {
  blue: number;
  exposure?: number;
  green: number;
  multiplier?: number;
  red: number;
}

const resolveSafeExposure = (exposure: number) =>
  Number.isFinite(exposure) && exposure > 0 ? exposure : 1;

const resolveSafeMultiplier = (multiplier: number) =>
  Number.isFinite(multiplier) ? multiplier : DEFAULT_FALSECOLOR_MULTIPLIER;

const computeBrightFromRgb = (red: number, green: number, blue: number) =>
  RADIANCE_BRIGHTNESS_WEIGHTS.red * red +
  RADIANCE_BRIGHTNESS_WEIGHTS.green * green +
  RADIANCE_BRIGHTNESS_WEIGHTS.blue * blue;

const resolveFalsecolorScale = (multiplier: number, exposure: number) =>
  resolveSafeMultiplier(multiplier) / resolveSafeExposure(exposure);

export function computeFalsecolorPixelLuminanceCpu({
  red,
  green,
  blue,
  multiplier = DEFAULT_FALSECOLOR_MULTIPLIER,
  exposure = 1,
}: FalsecolorPixelRgbInput) {
  const scale = resolveFalsecolorScale(multiplier, exposure);
  return scale * computeBrightFromRgb(red, green, blue);
}

function computeCpuLuminance(
  rgba: Float32Array,
  pixelCount: number,
  scale: number
): Float32Array {
  const output = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const rgbaOffset = i * 4;
    const red = rgba[rgbaOffset] ?? 0;
    const green = rgba[rgbaOffset + 1] ?? 0;
    const blue = rgba[rgbaOffset + 2] ?? 0;
    output[i] = scale * computeBrightFromRgb(red, green, blue);
  }
  return output;
}

function getNavigatorGPU() {
  if (typeof navigator === "undefined") {
    return null;
  }
  const maybeGPU = (navigator as Navigator & { gpu?: unknown }).gpu;
  if (!maybeGPU) {
    return null;
  }
  if (
    typeof (maybeGPU as { requestAdapter?: unknown }).requestAdapter !==
    "function"
  ) {
    return null;
  }
  return maybeGPU as {
    requestAdapter: () => Promise<{
      requestDevice: () => Promise<unknown>;
    } | null>;
  };
}

async function computeWebGpuLuminance(
  rgba: Float32Array,
  pixelCount: number,
  scale: number
): Promise<Float32Array | null> {
  const gpu = getNavigatorGPU();
  if (!gpu) {
    return null;
  }

  const gpuBufferUsage = (
    globalThis as { GPUBufferUsage?: Record<string, number> }
  ).GPUBufferUsage;
  const gpuMapMode = (globalThis as { GPUMapMode?: Record<string, number> })
    .GPUMapMode;
  if (!(gpuBufferUsage && gpuMapMode)) {
    return null;
  }
  const usageStorage = gpuBufferUsage.STORAGE;
  const usageCopyDst = gpuBufferUsage.COPY_DST;
  const usageCopySrc = gpuBufferUsage.COPY_SRC;
  const usageUniform = gpuBufferUsage.UNIFORM;
  const usageMapRead = gpuBufferUsage.MAP_READ;
  if (
    typeof usageStorage !== "number" ||
    typeof usageCopyDst !== "number" ||
    typeof usageCopySrc !== "number" ||
    typeof usageUniform !== "number" ||
    typeof usageMapRead !== "number"
  ) {
    return null;
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    return null;
  }

  const device = (await adapter.requestDevice()) as {
    createShaderModule: (descriptor: { code: string }) => unknown;
    createComputePipeline: (descriptor: unknown) => unknown;
    createBuffer: (descriptor: {
      size: number;
      usage: number;
      mappedAtCreation?: boolean;
    }) => {
      destroy: () => void;
      mapAsync: (mode: number) => Promise<void>;
      getMappedRange: () => ArrayBuffer;
      unmap: () => void;
    };
    createBindGroup: (descriptor: unknown) => unknown;
    createCommandEncoder: () => {
      beginComputePass: () => {
        setPipeline: (pipeline: unknown) => void;
        setBindGroup: (index: number, bindGroup: unknown) => void;
        dispatchWorkgroups: (countX: number) => void;
        end: () => void;
      };
      copyBufferToBuffer: (
        source: unknown,
        sourceOffset: number,
        destination: unknown,
        destinationOffset: number,
        size: number
      ) => void;
      finish: () => unknown;
    };
    queue: {
      writeBuffer: (
        buffer: unknown,
        bufferOffset: number,
        data: BufferSource,
        dataOffset?: number,
        size?: number
      ) => void;
      submit: (commands: unknown[]) => void;
    };
  };

  const shaderCode = `
struct Params {
  pixelCount: f32,
  scale: f32,
  rWeight: f32,
  gWeight: f32,
  bWeight: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<storage, read> rgbaValues: array<f32>;
@group(0) @binding(1) var<storage, read_write> luminanceValues: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let pixelIndex = globalId.x;
  if (pixelIndex >= u32(params.pixelCount)) {
    return;
  }

  let rgbaBase = pixelIndex * 4u;
  let red = rgbaValues[rgbaBase];
  let green = rgbaValues[rgbaBase + 1u];
  let blue = rgbaValues[rgbaBase + 2u];

  let bright = params.rWeight * red + params.gWeight * green + params.bWeight * blue;
  luminanceValues[pixelIndex] = params.scale * bright;
}`;

  const inputByteLength = rgba.byteLength;
  const outputByteLength = pixelCount * Float32Array.BYTES_PER_ELEMENT;
  const params = new Float32Array([
    pixelCount,
    scale,
    RADIANCE_BRIGHTNESS_WEIGHTS.red,
    RADIANCE_BRIGHTNESS_WEIGHTS.green,
    RADIANCE_BRIGHTNESS_WEIGHTS.blue,
    0,
    0,
    0,
  ]);

  const shaderModule = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createComputePipeline({
    compute: {
      entryPoint: "main",
      module: shaderModule,
    },
    layout: "auto",
  });

  const inputBuffer = device.createBuffer({
    size: inputByteLength,
    usage: usageStorage | usageCopyDst,
  });
  const outputBuffer = device.createBuffer({
    size: outputByteLength,
    usage: usageStorage | usageCopySrc,
  });
  const paramsBuffer = device.createBuffer({
    size: params.byteLength,
    usage: usageUniform | usageCopyDst,
  });
  const readbackBuffer = device.createBuffer({
    size: outputByteLength,
    usage: usageCopyDst | usageMapRead,
  });

  try {
    const inputCopyBuffer = new ArrayBuffer(rgba.byteLength);
    new Float32Array(inputCopyBuffer).set(rgba);
    device.queue.writeBuffer(inputBuffer, 0, inputCopyBuffer);
    device.queue.writeBuffer(paramsBuffer, 0, params);

    const bindGroup = device.createBindGroup({
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
      layout: (
        pipeline as { getBindGroupLayout: (index: number) => unknown }
      ).getBindGroupLayout(0),
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(pixelCount / WORKGROUP_SIZE));
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(
      outputBuffer,
      0,
      readbackBuffer,
      0,
      outputByteLength
    );

    device.queue.submit([commandEncoder.finish()]);
    await readbackBuffer.mapAsync(gpuMapMode.READ ?? 1);
    const mappedRange = readbackBuffer.getMappedRange();
    const result = new Float32Array(mappedRange.slice(0));
    readbackBuffer.unmap();
    return result;
  } finally {
    inputBuffer.destroy();
    outputBuffer.destroy();
    paramsBuffer.destroy();
    readbackBuffer.destroy();
  }
}

export async function computeFalsecolorLuminance({
  rgba,
  width,
  height,
  multiplier = DEFAULT_FALSECOLOR_MULTIPLIER,
  exposure = 1,
  preferWebGPU = true,
}: ComputeInput): Promise<FalsecolorLuminanceMatrix> {
  if (width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be greater than zero.");
  }

  const pixelCount = width * height;
  if (rgba.length < pixelCount * 4) {
    throw new Error(
      `RGBA buffer is too small for ${width}x${height}. Expected at least ${
        pixelCount * 4
      } floats, received ${rgba.length}.`
    );
  }

  const safeExposure = resolveSafeExposure(exposure);
  const safeMultiplier = resolveSafeMultiplier(multiplier);
  const scale = resolveFalsecolorScale(safeMultiplier, safeExposure);

  let values: Float32Array | null = null;
  if (preferWebGPU) {
    try {
      values = await computeWebGpuLuminance(rgba, pixelCount, scale);
    } catch {
      values = null;
    }
  }

  if (!values) {
    values = computeCpuLuminance(rgba, pixelCount, scale);
  }

  return {
    exposure: safeExposure,
    height,
    multiplier: safeMultiplier,
    values,
    width,
  };
}
