import {
  AXES,
  OUTPUT_LOCATIONS,
  type ProjectionMode,
  timeMajorOffset,
} from "./constants";
import type { ProjectedVibrations, RenderedVibrations } from "./types";

export function projectVibrations(
  vibrations: RenderedVibrations,
  mode: ProjectionMode,
): ProjectedVibrations {
  const { samples } = vibrations;
  const projected = new Float32Array(samples * OUTPUT_LOCATIONS);

  for (let output = 0; output < OUTPUT_LOCATIONS; output += 1) {
    const rmsAxis = mode === "rms" ? rmsAxisWeights(vibrations, output) : null;
    for (let sample = 0; sample < samples; sample += 1) {
      const x = valueAt(vibrations, sample, output, 0);
      const y = valueAt(vibrations, sample, output, 1);
      const z = valueAt(vibrations, sample, output, 2);
      let value: number;
      if (mode === "x") value = x;
      else if (mode === "y") value = y;
      else if (mode === "z") value = z;
      else if (mode === "mag") value = Math.hypot(x, y, z);
      else {
        value = x * rmsAxis![0] + y * rmsAxis![1] + z * rmsAxis![2];
      }
      projected[sample + samples * output] = value;
    }
  }

  return {
    data: projected,
    samples,
    outputLocations: OUTPUT_LOCATIONS,
    sampleRateHz: vibrations.sampleRateHz,
    mode,
  };
}

export function rmsByOutput(projected: ProjectedVibrations): Float32Array {
  const rms = new Float32Array(projected.outputLocations);
  for (let output = 0; output < projected.outputLocations; output += 1) {
    let energy = 0;
    for (let sample = 0; sample < projected.samples; sample += 1) {
      const value = projected.data[sample + projected.samples * output];
      energy += value * value;
    }
    rms[output] = Math.sqrt(energy / projected.samples);
  }
  return rms;
}

export function traceAtOutput(
  projected: ProjectedVibrations,
  outputIndex: number,
): Float32Array {
  const trace = new Float32Array(projected.samples);
  const offset = projected.samples * outputIndex;
  trace.set(projected.data.subarray(offset, offset + projected.samples));
  return trace;
}

export function decibelsRelativeToMax(values: Float32Array): Float32Array {
  let max = 0;
  for (const value of values) max = Math.max(max, Math.abs(value));
  const out = new Float32Array(values.length);
  if (max === 0) {
    out.fill(-Infinity);
    return out;
  }
  for (let i = 0; i < values.length; i += 1) {
    const normalized = Math.max(Number.MIN_VALUE, Math.abs(values[i]) / max);
    out[i] = 20 * Math.log10(normalized);
  }
  return out;
}

function rmsAxisWeights(
  vibrations: RenderedVibrations,
  outputIndex: number,
): [number, number, number] {
  const energies = [0, 0, 0];
  for (let axis = 0; axis < AXES; axis += 1) {
    for (let sample = 0; sample < vibrations.samples; sample += 1) {
      const value = valueAt(vibrations, sample, outputIndex, axis);
      energies[axis] += value * value;
    }
    energies[axis] = Math.sqrt(energies[axis] / vibrations.samples);
  }
  const norm = Math.hypot(energies[0], energies[1], energies[2]);
  if (norm === 0) return [0, 0, 0];
  return [energies[0] / norm, energies[1] / norm, energies[2] / norm];
}

function valueAt(
  vibrations: RenderedVibrations,
  sample: number,
  output: number,
  axis: number,
): number {
  return vibrations.data[timeMajorOffset(sample, output, axis, vibrations.samples)];
}
