import { describe, expect, it } from "vitest";
import { convolveFull, oneSidedMagnitudeSpectrum } from "./fft";

describe("fft helpers", () => {
  it("computes full convolution for a simple signal", () => {
    const result = Array.from(convolveFull([1, 2, 3], [4, 5]));
    expect(result).toHaveLength(4);
    expect(result[0]).toBeCloseTo(4, 5);
    expect(result[1]).toBeCloseTo(13, 5);
    expect(result[2]).toBeCloseTo(22, 5);
    expect(result[3]).toBeCloseTo(15, 5);
  });

  it("computes a one-sided spectrum with the expected sinusoid bin", () => {
    const fs = 8;
    const signal = Float32Array.from(
      Array.from({ length: 8 }, (_, i) => Math.sin(2 * Math.PI * 2 * (i / fs))),
    );
    const spectrum = oneSidedMagnitudeSpectrum(signal, fs);
    expect(spectrum.fftLength).toBe(8);
    expect(spectrum.frequenciesHz[2]).toBeCloseTo(2, 5);
    expect(spectrum.magnitudes[2]).toBeCloseTo(1, 5);
  });
});
