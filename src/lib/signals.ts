import { SAMPLE_RATE_HZ } from "./constants";

export type SignalKind = "sinusoid" | "impulse" | "tap" | "noise" | "wav";
export type WindowKind = "none" | "hanning" | "tukey";

export interface SinusoidParams {
  durationMs: number;
  frequencyHz: number;
  phaseRad?: number;
  sampleRateHz?: number;
  window?: WindowKind;
}

export interface NoiseParams {
  durationMs: number;
  seed?: number;
  sampleRateHz?: number;
}

export interface ImpulseParams {
  durationMs: number;
  sampleRateHz?: number;
  sampleIndex?: number;
}

export function samplesFromMilliseconds(
  durationMs: number,
  sampleRateHz = SAMPLE_RATE_HZ,
): number {
  return Math.max(1, Math.floor((durationMs / 1000) * sampleRateHz));
}

export function makeSinusoid({
  durationMs,
  frequencyHz,
  phaseRad = 0,
  sampleRateHz = SAMPLE_RATE_HZ,
  window = "none",
}: SinusoidParams): Float32Array {
  const samples = samplesFromMilliseconds(durationMs, sampleRateHz);
  const signal = new Float32Array(samples);
  const taper = makeWindow(samples, window);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRateHz;
    signal[i] = Math.sin(2 * Math.PI * frequencyHz * t + phaseRad) * taper[i];
  }
  return signal;
}

export function makeImpulse({
  durationMs,
  sampleRateHz = SAMPLE_RATE_HZ,
  sampleIndex = 14,
}: ImpulseParams): Float32Array {
  const samples = samplesFromMilliseconds(durationMs, sampleRateHz);
  const signal = new Float32Array(samples);
  signal[Math.min(samples - 1, Math.max(0, sampleIndex))] = 1;
  return signal;
}

export function makeTap(
  durationMs: number,
  tapTimeMs = 0,
  sampleRateHz = SAMPLE_RATE_HZ,
): Float32Array {
  const samples = samplesFromMilliseconds(durationMs, sampleRateHz);
  const signal = new Float32Array(samples);
  const tap = hanningWindow(21);
  const center = Math.round((tapTimeMs / 1000) * sampleRateHz);
  const start = center - Math.floor(tap.length / 2);
  for (let i = 0; i < tap.length; i += 1) {
    const sample = start + i;
    if (sample >= 0 && sample < signal.length) {
      signal[sample] = tap[i];
    }
  }
  return signal;
}

export function makeWhiteNoise({
  durationMs,
  seed = 0,
  sampleRateHz = SAMPLE_RATE_HZ,
}: NoiseParams): Float32Array {
  const samples = samplesFromMilliseconds(durationMs, sampleRateHz);
  const rng = lcg(seed);
  const signal = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    signal[i] = gaussian(rng);
  }
  normalizePeak(signal);
  return signal;
}

export function makeWindow(samples: number, kind: WindowKind): Float32Array {
  if (kind === "hanning") return hanningWindow(samples);
  if (kind === "tukey") return tukeyWindow(samples, 0.25);
  const window = new Float32Array(samples);
  window.fill(1);
  return window;
}

export function hanningWindow(samples: number): Float32Array {
  const window = new Float32Array(samples);
  if (samples === 1) {
    window[0] = 1;
    return window;
  }
  for (let i = 0; i < samples; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples - 1));
  }
  return window;
}

export function tukeyWindow(samples: number, alpha = 0.25): Float32Array {
  const window = new Float32Array(samples);
  if (samples === 1 || alpha <= 0) {
    window.fill(1);
    return window;
  }
  if (alpha >= 1) return hanningWindow(samples);

  const edge = (alpha * (samples - 1)) / 2;
  for (let i = 0; i < samples; i += 1) {
    if (i < edge) {
      window[i] = 0.5 * (1 + Math.cos(Math.PI * ((2 * i) / (alpha * (samples - 1)) - 1)));
    } else if (i <= (samples - 1) * (1 - alpha / 2)) {
      window[i] = 1;
    } else {
      window[i] =
        0.5 *
        (1 +
          Math.cos(
            Math.PI * ((2 * i) / (alpha * (samples - 1)) - 2 / alpha + 1),
          ));
    }
  }
  return window;
}

export function normalizePeak(signal: Float32Array): Float32Array {
  let peak = 0;
  for (const value of signal) peak = Math.max(peak, Math.abs(value));
  if (peak === 0) return signal;
  for (let i = 0; i < signal.length; i += 1) signal[i] /= peak;
  return signal;
}

function lcg(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(Number.MIN_VALUE, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
