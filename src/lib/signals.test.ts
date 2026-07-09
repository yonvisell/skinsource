import { describe, expect, it } from "vitest";
import { hanningWindow, makeImpulse, makeSinusoid, samplesFromMilliseconds } from "./signals";

describe("signal builders", () => {
  it("uses floor-based millisecond sample conversion like the GUI", () => {
    expect(samplesFromMilliseconds(100, 1300)).toBe(130);
  });

  it("creates the GUI-style impulse default at sample 15 in MATLAB terms", () => {
    const impulse = makeImpulse({ durationMs: 100, sampleRateHz: 1300 });
    expect(impulse[14]).toBe(1);
  });

  it("creates a hanning window with zero endpoints", () => {
    const window = hanningWindow(21);
    expect(window[0]).toBeCloseTo(0, 6);
    expect(window[10]).toBeCloseTo(1, 6);
    expect(window[20]).toBeCloseTo(0, 6);
  });

  it("creates a bounded sinusoid", () => {
    const signal = makeSinusoid({
      durationMs: 100,
      frequencyHz: 100,
      sampleRateHz: 1300,
      window: "none",
    });
    expect(signal.length).toBe(130);
    expect(Math.max(...signal)).toBeLessThanOrEqual(1);
    expect(Math.min(...signal)).toBeGreaterThanOrEqual(-1);
  });
});
