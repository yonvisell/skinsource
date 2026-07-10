import type {
  ImpulseChunk,
  ManifestChunk,
  SkinSourceManifest,
  VisualizationGeometry,
} from "./types";

const BASE_URL = import.meta.env.BASE_URL;

function assetUrl(path: string): string {
  return `${BASE_URL}${path}`.replace(/\/{2,}/g, "/");
}

export async function loadManifest(): Promise<SkinSourceManifest> {
  const response = await fetch(assetUrl("data/manifest.json"));
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  return (await response.json()) as SkinSourceManifest;
}

export async function loadVisualizationGeometry(
  manifest: SkinSourceManifest,
): Promise<VisualizationGeometry> {
  const response = await fetch(assetUrl(`data/${manifest.visualization.path}`));
  if (!response.ok) {
    throw new Error(`Failed to load visualization geometry: ${response.status}`);
  }
  return (await response.json()) as VisualizationGeometry;
}

export function findChunk(
  manifest: SkinSourceManifest,
  model: number,
  location: number,
): ManifestChunk {
  const chunk = manifest.chunks.find(
    (candidate) => candidate.model === model && candidate.location === location,
  );
  if (!chunk) {
    throw new Error(`Missing chunk for model ${model}, location ${location}`);
  }
  return chunk;
}

export async function loadImpulseChunk(
  manifest: SkinSourceManifest,
  model: number,
  location: number,
): Promise<ImpulseChunk> {
  const chunk = findChunk(manifest, model, location);
  const response = await fetch(assetUrl(`data/${chunk.path}`));
  if (!response.ok) {
    throw new Error(
      `Failed to load model ${model} location ${location}: ${response.status}`,
    );
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== chunk.bytes) {
    throw new Error(
      `Chunk byte mismatch for model ${model} location ${location}: ` +
        `${buffer.byteLength} vs ${chunk.bytes}`,
    );
  }
  return {
    key: `${model}:${location}:${chunk.md5}`,
    model,
    location,
    data: new Float32Array(buffer),
  };
}

export class ChunkStore {
  private readonly cache = new Map<string, Promise<ImpulseChunk>>();

  constructor(private readonly manifest: SkinSourceManifest) {}

  load(model: number, location: number): Promise<ImpulseChunk> {
    const key = `${model}:${location}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = loadImpulseChunk(this.manifest, model, location);
    this.cache.set(key, promise);
    return promise;
  }

  async preloadAll(
    onProgress?: (loaded: number, total: number) => void,
    concurrency = 6,
  ) {
    const total = this.manifest.chunks.length;
    let loaded = 0;
    const results: ImpulseChunk[] = [];
    let index = 0;

    const worker = async () => {
      while (index < this.manifest.chunks.length) {
        const chunk = this.manifest.chunks[index];
        index += 1;
        const result = await this.load(chunk.model, chunk.location);
        results.push(result);
        loaded += 1;
        onProgress?.(loaded, total);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, total) }, () => worker()),
    );
    return results;
  }
}
