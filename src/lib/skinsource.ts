import {
  AXES,
  CHANNELS,
  IMPULSE_RESPONSE_SAMPLES,
  OUTPUT_LOCATIONS,
  SAMPLE_RATE_HZ,
  timeMajorOffset,
} from "./constants";
import { inverseComplexToReal, multiplyComplex, realFftPadded } from "./fft";
import type {
  AssignedStimulus,
  ImpulseChunk,
  RenderedVibrations,
} from "./types";
import { nextPowerOfTwo } from "./constants";

type ComplexSpectrum = number[];

export class ImpulseFftCache {
  private readonly entries = new Map<string, ComplexSpectrum[][]>();

  constructor(private readonly maxEntries = 6) {}

  get(chunk: ImpulseChunk, fftLength: number): ComplexSpectrum[][] {
    const key = `${chunk.key}:${fftLength}`;
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }

    const spectra: ComplexSpectrum[][] = [];
    for (let axis = 0; axis < AXES; axis += 1) {
      const axisSpectra: ComplexSpectrum[] = [];
      for (let output = 0; output < OUTPUT_LOCATIONS; output += 1) {
        const channel = output + OUTPUT_LOCATIONS * axis;
        const offset = IMPULSE_RESPONSE_SAMPLES * channel;
        axisSpectra.push(
          realFftPadded(
            chunk.data.subarray(offset, offset + IMPULSE_RESPONSE_SAMPLES),
            fftLength,
          ),
        );
      }
      spectra.push(axisSpectra);
    }

    this.entries.set(key, spectra);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    return spectra;
  }

  clear() {
    this.entries.clear();
  }
}

export interface RenderRequest {
  chunksByLocation: Map<number, ImpulseChunk>;
  stimuli: AssignedStimulus[];
  sampleRateHz?: number;
  cache?: ImpulseFftCache;
}

export function renderVibrations({
  chunksByLocation,
  stimuli,
  sampleRateHz = SAMPLE_RATE_HZ,
  cache = new ImpulseFftCache(),
}: RenderRequest): RenderedVibrations {
  const active = stimuli.filter((stimulus) => stimulus.targetAmplitude !== 0);
  if (active.length === 0) {
    throw new Error("At least one active stimulus is required.");
  }

  const stimulusSamples = active[0].signal.length;
  for (const stimulus of active) {
    if (stimulus.signal.length !== stimulusSamples) {
      throw new Error("All active stimuli must have the same sample length.");
    }
  }

  const samples = stimulusSamples + IMPULSE_RESPONSE_SAMPLES - 1;
  const fftLength = nextPowerOfTwo(samples);
  const output = new Float32Array(samples * CHANNELS);

  for (const stimulus of active) {
    const chunk = chunksByLocation.get(stimulus.location);
    if (!chunk) {
      throw new Error(`Missing loaded data for input location ${stimulus.location}`);
    }
    const contribution = renderContribution(
      chunk,
      stimulus.signal,
      samples,
      fftLength,
      cache,
    );
    const scale = contribution.maxValue === 0 ? 1 : contribution.maxValue;
    const gain = stimulus.targetAmplitude / scale;
    for (let i = 0; i < output.length; i += 1) {
      output[i] += contribution.data[i] * gain;
    }
  }

  return {
    data: output,
    samples,
    outputLocations: OUTPUT_LOCATIONS,
    axes: AXES,
    sampleRateHz,
    stimulusSamples,
    impulseResponseSamples: IMPULSE_RESPONSE_SAMPLES,
  };
}

function renderContribution(
  chunk: ImpulseChunk,
  stimulus: Float32Array,
  samples: number,
  fftLength: number,
  cache: ImpulseFftCache,
): { data: Float32Array; maxValue: number } {
  const output = new Float32Array(samples * CHANNELS);
  let maxValue = 0;
  const stimulusSpectrum = realFftPadded(stimulus, fftLength);
  const impulseSpectra = cache.get(chunk, fftLength);

  for (let axis = 0; axis < AXES; axis += 1) {
    for (let location = 0; location < OUTPUT_LOCATIONS; location += 1) {
      const product = multiplyComplex(
        impulseSpectra[axis][location],
        stimulusSpectrum,
      );
      const time = inverseComplexToReal(product, fftLength);
      for (let sample = 0; sample < samples; sample += 1) {
        const value = time[sample];
        const offset = timeMajorOffset(sample, location, axis, samples);
        output[offset] = value;
        if (value > maxValue) maxValue = value;
      }
    }
  }

  return { data: output, maxValue };
}
