import type { AXES, OUTPUT_LOCATIONS } from "./constants";

export interface ManifestModel {
  id: number;
  label: string;
  handLengthMm: number;
  sex: "M" | "F" | string;
  pixelToMmScale: number;
}

export interface ManifestInputLocation {
  id: number;
  label: string;
  contactType: "in-axis" | "perpendicular" | string;
  description: string;
}

export interface ManifestChunk {
  model: number;
  location: number;
  path: string;
  dtype: "float32";
  shape: [number, typeof OUTPUT_LOCATIONS, typeof AXES];
  layout: string;
  bytes: number;
  md5: string;
}

export interface SkinSourceManifest {
  schemaVersion: number;
  generatedAt: string;
  source: {
    name: string;
    datasetDoi: string;
    publicationDoi: string;
    rawFile: string;
    rawFileBytes: number;
    rawFileMd5: string;
  };
  sampleRateHz: number;
  impulseResponseSamples: number;
  outputLocations: number;
  axes: ["x", "y", "z"];
  models: ManifestModel[];
  inputLocations: ManifestInputLocation[];
  chunks: ManifestChunk[];
  visualization: {
    path: string;
    inputMapImage: string;
    outputMapImage: string;
  };
  layoutNotes: string[];
  citation: string;
}

export interface ImpulseChunk {
  key: string;
  model: number;
  location: number;
  data: Float32Array;
}

export interface AssignedStimulus {
  id: string;
  location: number;
  label: string;
  signal: Float32Array;
  targetAmplitude: number;
}

export interface RenderedVibrations {
  data: Float32Array;
  samples: number;
  outputLocations: number;
  axes: number;
  sampleRateHz: number;
  stimulusSamples: number;
  impulseResponseSamples: number;
}

export interface ProjectedVibrations {
  data: Float32Array;
  samples: number;
  outputLocations: number;
  sampleRateHz: number;
  mode: string;
}

export interface Spectrum {
  frequenciesHz: Float32Array;
  magnitudes: Float32Array;
  fftLength: number;
  sampleRateHz: number;
}
