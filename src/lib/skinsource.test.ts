import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeSinusoid } from "./signals";
import { ImpulseFftCache, renderVibrations } from "./skinsource";
import type { AssignedStimulus, ImpulseChunk } from "./types";

function readFloat32(path: string): Float32Array {
  const buffer = readFileSync(path);
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
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
});
