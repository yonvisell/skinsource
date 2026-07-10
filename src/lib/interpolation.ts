import { assetUrl } from "./data";

export interface SurfaceInterpolationBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SurfaceInterpolationModelManifest {
  model: number;
  interpolationType: "natural" | string;
  width: number;
  height: number;
  bounds: SurfaceInterpolationBounds;
  rowPtrPath: string;
  indicesPath: string;
  weightsPath: string;
  rowPtrLength: number;
  nnz: number;
  threshold: number;
}

export interface SurfaceInterpolationManifest {
  schemaVersion: number;
  source: string;
  models: SurfaceInterpolationModelManifest[];
}

export interface SurfaceInterpolationAsset extends SurfaceInterpolationModelManifest {
  rowPtr: Uint32Array;
  indices: Uint8Array;
  weights: Float32Array;
}

export class SurfaceInterpolationStore {
  private readonly cache = new Map<number, Promise<SurfaceInterpolationAsset>>();

  constructor(private readonly manifest: SurfaceInterpolationManifest) {}

  load(model: number): Promise<SurfaceInterpolationAsset> {
    const cached = this.cache.get(model);
    if (cached) return cached;
    const entry = this.manifest.models.find((candidate) => candidate.model === model);
    if (!entry) throw new Error(`Missing interpolation asset for model ${model}`);
    const promise = loadSurfaceInterpolationAsset(entry);
    this.cache.set(model, promise);
    return promise;
  }
}

export function interpolateSurface(
  asset: SurfaceInterpolationAsset,
  values: Float32Array,
): Float32Array {
  const pixelCount = asset.width * asset.height;
  const out = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const start = asset.rowPtr[pixel];
    const end = asset.rowPtr[pixel + 1];
    if (start === end) {
      out[pixel] = Number.NaN;
      continue;
    }
    let value = 0;
    for (let ptr = start; ptr < end; ptr += 1) {
      value += asset.weights[ptr] * (values[asset.indices[ptr]] ?? 0);
    }
    out[pixel] = value;
  }
  return out;
}

async function loadSurfaceInterpolationAsset(
  entry: SurfaceInterpolationModelManifest,
): Promise<SurfaceInterpolationAsset> {
  const [rowPtrBuffer, indicesBuffer, weightsBuffer] = await Promise.all([
    fetchArrayBuffer(entry.rowPtrPath),
    fetchArrayBuffer(entry.indicesPath),
    fetchArrayBuffer(entry.weightsPath),
  ]);
  const rowPtr = new Uint32Array(rowPtrBuffer);
  const indices = new Uint8Array(indicesBuffer);
  const weights = new Float32Array(weightsBuffer);
  if (rowPtr.length !== entry.rowPtrLength) {
    throw new Error(
      `Interpolation row pointer length mismatch for model ${entry.model}: ` +
        `${rowPtr.length} vs ${entry.rowPtrLength}`,
    );
  }
  if (indices.length !== entry.nnz || weights.length !== entry.nnz) {
    throw new Error(
      `Interpolation nonzero length mismatch for model ${entry.model}: ` +
        `${indices.length}/${weights.length} vs ${entry.nnz}`,
    );
  }
  return {
    ...entry,
    rowPtr,
    indices,
    weights,
  };
}

async function fetchArrayBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(assetUrl(`data/${path}`));
  if (!response.ok) {
    throw new Error(`Failed to load interpolation asset ${path}: ${response.status}`);
  }
  return response.arrayBuffer();
}
