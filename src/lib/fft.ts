import FFT from "fft.js";
import { nextPowerOfTwo } from "./constants";
import type { Spectrum } from "./types";

type ComplexArray = number[];

export function realFftPadded(
  signal: ArrayLike<number>,
  fftLength: number,
): ComplexArray {
  const fft = new FFT(fftLength);
  const input = new Array<number>(fftLength).fill(0);
  for (let i = 0; i < signal.length; i += 1) input[i] = signal[i] ?? 0;
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, input);
  fft.completeSpectrum(spectrum);
  return spectrum;
}

export function inverseComplexToReal(
  spectrum: ComplexArray,
  fftLength: number,
): Float64Array {
  const fft = new FFT(fftLength);
  const out = fft.createComplexArray();
  fft.inverseTransform(out, spectrum);
  const real = new Float64Array(fftLength);
  for (let i = 0; i < fftLength; i += 1) {
    real[i] = out[2 * i];
  }
  return real;
}

export function multiplyComplex(a: ComplexArray, b: ComplexArray): ComplexArray {
  if (a.length !== b.length) {
    throw new Error(`Complex array mismatch: ${a.length} vs ${b.length}`);
  }
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i += 2) {
    const ar = a[i];
    const ai = a[i + 1];
    const br = b[i];
    const bi = b[i + 1];
    out[i] = ar * br - ai * bi;
    out[i + 1] = ar * bi + ai * br;
  }
  return out;
}

export function convolveFull(
  signal: ArrayLike<number>,
  kernel: ArrayLike<number>,
): Float32Array {
  const fullLength = signal.length + kernel.length - 1;
  const fftLength = nextPowerOfTwo(fullLength);
  const signalSpectrum = realFftPadded(signal, fftLength);
  const kernelSpectrum = realFftPadded(kernel, fftLength);
  const full = inverseComplexToReal(
    multiplyComplex(signalSpectrum, kernelSpectrum),
    fftLength,
  );
  return Float32Array.from(full.subarray(0, fullLength));
}

export function oneSidedMagnitudeSpectrum(
  signal: ArrayLike<number>,
  sampleRateHz: number,
): Spectrum {
  const fftLength = nextPowerOfTwo(signal.length);
  const spectrum = realFftPadded(signal, fftLength);
  const bins = fftLength / 2 + 1;
  const magnitudes = new Float32Array(bins);
  const frequenciesHz = new Float32Array(bins);

  for (let bin = 0; bin < bins; bin += 1) {
    const re = spectrum[2 * bin];
    const im = spectrum[2 * bin + 1];
    let mag = Math.hypot(re, im) / fftLength;
    if (bin > 0 && bin < bins - 1) mag *= 2;
    magnitudes[bin] = mag;
    frequenciesHz[bin] = (bin * sampleRateHz) / fftLength;
  }

  return {
    frequenciesHz,
    magnitudes,
    fftLength,
    sampleRateHz,
  };
}
