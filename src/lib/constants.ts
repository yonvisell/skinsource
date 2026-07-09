export const SAMPLE_RATE_HZ = 1300;
export const IMPULSE_RESPONSE_SAMPLES = 522;
export const OUTPUT_LOCATIONS = 72;
export const AXES = 3;
export const CHANNELS = OUTPUT_LOCATIONS * AXES;

export type AxisName = "x" | "y" | "z";
export type ProjectionMode = "x" | "y" | "z" | "mag" | "rms" | "soc";

export function axisIndex(axis: AxisName): number {
  if (axis === "x") return 0;
  if (axis === "y") return 1;
  return 2;
}

export function channelIndex(outputIndex: number, axis: number): number {
  return outputIndex + OUTPUT_LOCATIONS * axis;
}

export function timeMajorOffset(
  sampleIndex: number,
  outputIndex: number,
  axis: number,
  samples: number,
): number {
  return sampleIndex + samples * channelIndex(outputIndex, axis);
}

export function nextPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Invalid FFT length target: ${value}`);
  }
  let power = 1;
  while (power < value) power *= 2;
  return power;
}
