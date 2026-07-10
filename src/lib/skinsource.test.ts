import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { oneSidedMagnitudeSpectrum } from "./fft";
import {
  interpolateSurface,
  type SurfaceInterpolationAsset,
  type SurfaceInterpolationManifest,
} from "./interpolation";
import {
  decibelsRelativeToMax,
  projectVibrations,
  rmsByOutput,
  traceAtOutput,
} from "./projection";
import { makeSinusoid, makeTap } from "./signals";
import { ImpulseFftCache, renderVibrations } from "./skinsource";
import type { AssignedStimulus, ImpulseChunk, ProjectedVibrations } from "./types";

function readFloat32(path: string): Float32Array {
  const buffer = readFileSync(path);
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}

function readUint32(path: string): Uint32Array {
  const buffer = readFileSync(path);
  return new Uint32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Uint32Array.BYTES_PER_ELEMENT,
  );
}

function readUint8(path: string): Uint8Array {
  const buffer = readFileSync(path);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function chunk(model: number, location: number): ImpulseChunk {
  return {
    key: `test:model${model}:location${location}`,
    model,
    location,
    data: readFloat32(
      join(
        process.cwd(),
        `public/data/impulse-responses/model-${model}-location-${String(location).padStart(2, "0")}.f32`,
      ),
    ),
  };
}

function compareSeries(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  tolerance = { max: 2e-4, rms: 2e-6 },
  label = "series",
) {
  expect(actual.length).toBe(expected.length);
  let maxAbsError = 0;
  let rmsError = 0;
  for (let i = 0; i < expected.length; i += 1) {
    const error = Math.abs(actual[i] - expected[i]);
    maxAbsError = Math.max(maxAbsError, error);
    rmsError += error * error;
  }
  rmsError = Math.sqrt(rmsError / expected.length);
  if (maxAbsError >= tolerance.max || rmsError >= tolerance.rms) {
    throw new Error(
      `${label} exceeded tolerance: max=${maxAbsError}, rms=${rmsError}, ` +
        `limits=${tolerance.max}/${tolerance.rms}`,
    );
  }
}

interface ValidationCase {
  id: string;
  kind: "traces" | "spectra" | "interpolation";
  fixture: string;
  frequencyFixture?: string;
  signalFixture?: string;
  model: number;
  locations?: number | number[];
  signal?: "sinusoid" | "tap" | "fixture";
  frequencyHz?: number;
  tapTimeMs?: number;
  durationMs?: number;
  targetAmplitude?: number | number[];
  displayedQuantity: "x" | "y" | "z" | "mag" | "rms";
  selectedOutputs?: number[];
  shape?: [number, number];
  fftLength?: number;
  width?: number;
  height?: number;
}

const fixtureRoot = join(process.cwd(), "tests/fixtures/matlab");
const validationManifest = readJson<{ cases: ValidationCase[] }>(
  join(fixtureRoot, "validation_cases.json"),
);

function renderValidationCase(testCase: ValidationCase) {
  const locations = Array.isArray(testCase.locations)
    ? testCase.locations
    : [testCase.locations ?? 1];
  const amplitudes: number[] = Array.isArray(testCase.targetAmplitude)
    ? testCase.targetAmplitude
    : locations.map(() => Number(testCase.targetAmplitude ?? 1));
  const signal = signalForCase(testCase);
  const stimuli: AssignedStimulus[] = locations.map((location, index) => ({
    id: `${testCase.id}:${location}`,
    location,
    label: testCase.id,
    signal,
    targetAmplitude: amplitudes[index],
  }));
  return renderVibrations({
    chunksByLocation: new Map(locations.map((location) => [location, chunk(testCase.model, location)])),
    stimuli,
    cache: new ImpulseFftCache(8),
  });
}

function projectedValidationCase(testCase: ValidationCase): ProjectedVibrations {
  return projectVibrations(renderValidationCase(testCase), testCase.displayedQuantity);
}

function signalForCase(testCase: ValidationCase): Float32Array {
  if (testCase.signal === "fixture" && testCase.signalFixture) {
    return readFloat32(join(fixtureRoot, testCase.signalFixture));
  }
  if (testCase.signal === "tap") {
    return makeTap(testCase.durationMs ?? 100, testCase.tapTimeMs ?? 12, 1300);
  }
  return makeSinusoid({
    durationMs: testCase.durationMs ?? 100,
    frequencyHz: testCase.frequencyHz ?? 100,
    sampleRateHz: 1300,
    window: "none",
  });
}

describe("SkinSource compute parity", () => {
  it("matches a MATLAB conv2 reference for a sinusoid render", () => {
    const root = process.cwd();
    const impulseData = readFloat32(
      join(root, "public/data/impulse-responses/model-1-location-07.f32"),
    );
    const expected = readFloat32(
      join(
        root,
        "tests/fixtures/matlab/model1_location7_sine100_100ms_response.f32",
      ),
    );

    const chunk: ImpulseChunk = {
      key: "test:model1:location7",
      model: 1,
      location: 7,
      data: impulseData,
    };
    const stimulus: AssignedStimulus = {
      id: "sine",
      location: 7,
      label: "100 Hz sine",
      signal: makeSinusoid({
        durationMs: 100,
        frequencyHz: 100,
        sampleRateHz: 1300,
        window: "none",
      }),
      targetAmplitude: 1,
    };

    const actual = renderVibrations({
      chunksByLocation: new Map([[7, chunk]]),
      stimuli: [stimulus],
      cache: new ImpulseFftCache(1),
    });

    expect(actual.data.length).toBe(expected.length);
    let maxAbsError = 0;
    let rmsError = 0;
    for (let i = 0; i < expected.length; i += 1) {
      const error = Math.abs(actual.data[i] - expected[i]);
      maxAbsError = Math.max(maxAbsError, error);
      rmsError += error * error;
    }
    rmsError = Math.sqrt(rmsError / expected.length);

    expect(maxAbsError).toBeLessThan(1e-4);
    expect(rmsError).toBeLessThan(1e-6);
  });

  it("matches MATLAB selected traces across representative displayed quantities", () => {
    const traceCases = validationManifest.cases.filter((testCase) => testCase.kind === "traces");
    expect(traceCases.length).toBeGreaterThanOrEqual(5);
    for (const testCase of traceCases) {
      const projected = projectedValidationCase(testCase);
      const expected = readFloat32(join(fixtureRoot, testCase.fixture));
      const [samples, outputs] = testCase.shape!;
      expect(projected.samples).toBe(samples);
      expect(testCase.selectedOutputs).toHaveLength(outputs);
      for (let outputIndex = 0; outputIndex < outputs; outputIndex += 1) {
        const output = testCase.selectedOutputs![outputIndex];
        const actualTrace = traceAtOutput(projected, output - 1);
        const expectedTrace = new Float32Array(samples);
        for (let sample = 0; sample < samples; sample += 1) {
          expectedTrace[sample] = expected[sample + samples * outputIndex];
        }
        compareSeries(actualTrace, expectedTrace, undefined, `${testCase.id} output ${output}`);
      }
    }
  });

  it("matches MATLAB one-sided spectra for a deterministic noise input", () => {
    const testCase = validationManifest.cases.find(
      (candidate) => candidate.id === "noise_m2_l5_x_spectra",
    )!;
    const projected = projectedValidationCase(testCase);
    const expectedSpectra = readFloat32(join(fixtureRoot, testCase.fixture));
    const expectedFrequencies = readFloat32(join(fixtureRoot, testCase.frequencyFixture!));
    const [bins, outputs] = testCase.shape!;
    for (let outputIndex = 0; outputIndex < outputs; outputIndex += 1) {
      const output = testCase.selectedOutputs![outputIndex];
      const spectrum = oneSidedMagnitudeSpectrum(
        traceAtOutput(projected, output - 1),
        projected.sampleRateHz,
      );
      expect(spectrum.fftLength).toBe(testCase.fftLength);
      compareSeries(
        spectrum.frequenciesHz,
        expectedFrequencies,
        { max: 1e-5, rms: 1e-7 },
        `${testCase.id} frequencies`,
      );
      const expectedMagnitudes = new Float32Array(bins);
      for (let bin = 0; bin < bins; bin += 1) {
        expectedMagnitudes[bin] = expectedSpectra[bin + bins * outputIndex];
      }
      compareSeries(
        spectrum.magnitudes,
        expectedMagnitudes,
        { max: 1e-5, rms: 1e-7 },
        `${testCase.id} output ${output} magnitudes`,
      );
    }
  });

  it("matches direct MATLAB surface interpolation with sparse browser assets", () => {
    const testCase = validationManifest.cases.find(
      (candidate) => candidate.id === "sine_m1_l7_mag_interpolated_surface",
    )!;
    const sourceCase = validationManifest.cases.find(
      (candidate) => candidate.id === "sine_m1_l7_mag",
    )!;
    const projected = projectedValidationCase(sourceCase);
    const values = decibelsRelativeToMax(rmsByOutput(projected));
    const interpolationManifest = readJson<SurfaceInterpolationManifest>(
      join(process.cwd(), "public/data/interpolation/manifest.json"),
    );
    const entry = interpolationManifest.models.find((candidate) => candidate.model === testCase.model)!;
    const asset: SurfaceInterpolationAsset = {
      ...entry,
      rowPtr: readUint32(join(process.cwd(), "public/data", entry.rowPtrPath)),
      indices: readUint8(join(process.cwd(), "public/data", entry.indicesPath)),
      weights: readFloat32(join(process.cwd(), "public/data", entry.weightsPath)),
    };
    const actual = interpolateSurface(asset, values);
    const expected = readFloat32(join(fixtureRoot, testCase.fixture));
    const height = testCase.height!;
    const width = testCase.width!;
    expect(actual.length).toBe(width * height);
    let checked = 0;
    let maxAbsError = 0;
    let rmsError = 0;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const expectedValue = expected[row + height * col];
        if (!Number.isFinite(expectedValue)) continue;
        const actualValue = actual[row * width + col];
        const error = Math.abs(actualValue - expectedValue);
        maxAbsError = Math.max(maxAbsError, error);
        rmsError += error * error;
        checked += 1;
      }
    }
    rmsError = Math.sqrt(rmsError / checked);
    expect(checked).toBeGreaterThan(30000);
    expect(maxAbsError).toBeLessThan(5e-4);
    expect(rmsError).toBeLessThan(1e-5);
  });
});
