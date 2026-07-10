import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  Database,
  Download,
  FileText,
  Film,
  Eye,
  EyeOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import "./styles.css";
import { SAMPLE_RATE_HZ, type ProjectionMode } from "./lib/constants";
import {
  ChunkStore,
  assetUrl,
  loadManifest,
  loadMatlabColormap,
  loadSurfaceInterpolationManifest,
  loadVisualizationGeometry,
} from "./lib/data";
import {
  DEFAULT_DB_MAX,
  DEFAULT_DB_MIN,
  colorForDb,
  colorMapGradient,
  rgbForDb,
  type MatlabColormap,
} from "./lib/colormap";
import { oneSidedMagnitudeSpectrum } from "./lib/fft";
import {
  SurfaceInterpolationStore,
  interpolateSurface,
  type SurfaceInterpolationAsset,
} from "./lib/interpolation";
import {
  decibelsRelativeToMax,
  projectVibrations,
  rmsByOutput,
  traceAtOutput,
} from "./lib/projection";
import {
  makeImpulse,
  makeSinusoid,
  makeTap,
  makeWhiteNoise,
  normalizePeak,
  type SignalKind,
} from "./lib/signals";
import { ImpulseFftCache, renderVibrations } from "./lib/skinsource";
import type {
  AssignedStimulus,
  ProjectedVibrations,
  SkinSourceManifest,
  Spectrum,
  VisualizationGeometry,
} from "./lib/types";

type SurfaceMode = "sensors" | "interpolated";

interface AppData {
  manifest: SkinSourceManifest;
  geometry: VisualizationGeometry;
  colorMap: MatlabColormap;
  interpolationStore: SurfaceInterpolationStore;
  store: ChunkStore;
}

const DISPLAYED_QUANTITIES: Array<{
  value: ProjectionMode;
  label: string;
  shortLabel: string;
  hint: string;
}> = [
  {
    value: "mag",
    label: "Vector magnitude",
    shortLabel: "Vector magnitude",
    hint: "q(t) = sqrt(ux(t)^2 + uy(t)^2 + uz(t)^2) at each output location",
  },
  {
    value: "z",
    label: "Normal acceleration (z)",
    shortLabel: "Normal acceleration",
    hint: "q(t) = uz(t), the skin-normal accelerometer axis from the SkinSource data",
  },
  {
    value: "x",
    label: "Local x acceleration",
    shortLabel: "Local x acceleration",
    hint: "q(t) = ux(t), the raw local accelerometer x axis",
  },
  {
    value: "y",
    label: "Local y acceleration",
    shortLabel: "Local y acceleration",
    hint: "q(t) = uy(t), the raw local accelerometer y axis",
  },
  {
    value: "rms",
    label: "RMS-energy axis",
    shortLabel: "RMS-energy axis",
    hint: "q(t) = u(t) dot erms, the per-output axis carrying the largest RMS energy",
  },
];

const INPUT_LOCATION_IMAGE_URL = assetUrl("assets/stimulation-locations.png");
const SENSOR_INSET_IMAGE_URL = assetUrl("assets/hand-sensors-inset.jpg");
const APP_README_URL = assetUrl("README.md");

const INPUT_IMAGE_WIDTH = 635;
const INPUT_IMAGE_HEIGHT = 1000;
const INPUT_IMAGE_POINTS: Record<number, { x: number; y: number }> = {
  1: { x: 613.5, y: 335.5 },
  2: { x: 403.0, y: 60.4 },
  3: { x: 251.9, y: 39.4 },
  4: { x: 137.4, y: 76.2 },
  5: { x: 21.3, y: 180.5 },
  6: { x: 548.2, y: 337.3 },
  7: { x: 400.5, y: 91.7 },
  8: { x: 256.3, y: 72.5 },
  9: { x: 144.4, y: 107.1 },
  10: { x: 33.1, y: 209.6 },
  11: { x: 495.9, y: 389.8 },
  12: { x: 372.7, y: 242.9 },
  13: { x: 257.1, y: 234.5 },
  14: { x: 174.4, y: 264.7 },
  15: { x: 82.3, y: 322.3 },
  16: { x: 228.5, y: 329.6 },
  17: { x: 372.9, y: 410.5 },
  18: { x: 251.9, y: 451.3 },
  19: { x: 115.0, y: 474.7 },
  20: { x: 261.0, y: 590.3 },
};

function App() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preload, setPreload] = useState({ loaded: 0, total: 80 });
  const [model, setModel] = useState(1);
  const [inputLocation, setInputLocation] = useState(7);
  const [selectedOutputs, setSelectedOutputs] = useState<number[]>([20]);
  const [signalKind, setSignalKind] = useState<SignalKind>("sinusoid");
  const [durationMs, setDurationMs] = useState(250);
  const [frequencyHz, setFrequencyHz] = useState(100);
  const [seed, setSeed] = useState(0);
  const [targetAmplitude, setTargetAmplitude] = useState(1);
  const [wavSignal, setWavSignal] = useState<Float32Array | null>(null);
  const [wavFileName, setWavFileName] = useState<string | null>(null);
  const [wavStatus, setWavStatus] = useState("No WAV loaded");
  const [projection, setProjection] = useState<ProjectionMode>("mag");
  const [stimuli, setStimuli] = useState<AssignedStimulus[]>([]);
  const [projected, setProjected] = useState<ProjectedVibrations | null>(null);
  const [rmsDb, setRmsDb] = useState<Float32Array | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("sensors");
  const [showInterpolatedSensors, setShowInterpolatedSensors] = useState(true);
  const [colorMinDb, setColorMinDb] = useState(DEFAULT_DB_MIN);
  const [colorMaxDb, setColorMaxDb] = useState(DEFAULT_DB_MAX);
  const [interpolationAsset, setInterpolationAsset] =
    useState<SurfaceInterpolationAsset | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [status, setStatus] = useState("Loading dataset manifest...");
  const cacheRef = useRef(new ImpulseFftCache(6));
  const renderTokenRef = useRef(0);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        const manifest = await loadManifest();
        const [geometry, colorMap, interpolationManifest] = await Promise.all([
          loadVisualizationGeometry(manifest),
          loadMatlabColormap(manifest),
          loadSurfaceInterpolationManifest(manifest),
        ]);
        const store = new ChunkStore(manifest);
        const interpolationStore = new SurfaceInterpolationStore(interpolationManifest);
        if (!alive) return;
        setAppData({ manifest, geometry, colorMap, interpolationStore, store });
        setStatus("Manifest loaded. Preloading impulse-response chunks...");
        store
          .preloadAll((loaded, total) => {
            if (!alive) return;
            setPreload({ loaded, total });
            setStatus(`Preloaded ${loaded}/${total} impulse-response chunks`);
          })
          .then(() => {
            if (alive) setStatus("SkinSource data ready");
          })
          .catch((error: unknown) => {
            if (alive) setStatus(error instanceof Error ? error.message : String(error));
          });
      } catch (error) {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setInterpolationAsset(null);
    if (!appData) {
      return () => {
        alive = false;
      };
    }
    appData.interpolationStore
      .load(model)
      .then((asset) => {
        if (alive) setInterpolationAsset(asset);
      })
      .catch((error: unknown) => {
        if (alive) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [appData, model]);

  const selectedOutput = selectedOutputs[selectedOutputs.length - 1] ?? 20;
  const selectedTraces = useMemo(() => {
    if (!projected) return null;
    return selectedOutputs.map((output) => ({
      output,
      trace: traceAtOutput(projected, output - 1),
    }));
  }, [projected, selectedOutputs]);

  const trace = selectedTraces?.find((entry) => entry.output === selectedOutput)?.trace ?? null;

  const selectedSpectra = useMemo(() => {
    if (!selectedTraces || !projected) return null;
    return selectedTraces.map(({ output, trace: selectedTrace }) => ({
      output,
      spectrum: oneSidedMagnitudeSpectrum(selectedTrace, projected.sampleRateHz),
    }));
  }, [selectedTraces, projected]);

  const spectrum =
    selectedSpectra?.find((entry) => entry.output === selectedOutput)?.spectrum ?? null;

  function selectOutput(location: number, additive: boolean) {
    setSelectedOutputs((current) => {
      if (!additive) return [location];
      if (current.includes(location)) {
        const next = current.filter((item) => item !== location);
        return next.length === 0 ? [location] : next;
      }
      return [...current, location];
    });
  }

  function buildSignal(): Float32Array | null {
    if (signalKind === "wav") {
      return wavSignal;
    }
    return buildGeneratedSignal(signalKind, {
      durationMs,
      frequencyHz,
      seed,
    });
  }

  function makePendingStimulus(): AssignedStimulus | null {
    const signal = buildSignal();
    if (!signal) {
      setStatus("Choose a WAV file before adding a WAV input");
      return null;
    }
    const label =
      signalKind === "sinusoid"
        ? `${frequencyHz} Hz sine`
        : signalKind === "noise"
          ? `white noise seed ${seed}`
          : signalKind === "wav"
            ? wavFileName ?? "WAV"
            : signalKind;
    return {
      id: `${inputLocation}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      location: inputLocation,
      label,
      signal,
      targetAmplitude,
    };
  }

  function addStimulus(mode: "add" | "replace") {
    const stimulus = makePendingStimulus();
    if (!stimulus) return;
    setStimuli((current) =>
      mode === "replace"
        ? [...current.filter((item) => item.location !== inputLocation), stimulus]
        : [...current, stimulus],
    );
    setStatus(
      `${mode === "replace" ? "Replaced" : "Added"} ${stimulus.label} at input ${inputLocation}`,
    );
  }

  async function handleWavFile(file: File | null) {
    if (!file) return;
    setWavStatus(`Loading ${file.name}...`);
    try {
      const decoded = await decodeWavFile(file);
      setWavSignal(decoded.signal);
      setWavFileName(file.name);
      setDurationMs(Math.round((1000 * decoded.signal.length) / SAMPLE_RATE_HZ));
      setWavStatus(
        `${file.name}: ${decoded.signal.length} samples at ${SAMPLE_RATE_HZ} Hz` +
          (decoded.originalSampleRate === SAMPLE_RATE_HZ
            ? ""
            : `, resampled from ${decoded.originalSampleRate} Hz`),
      );
      setStatus(`Loaded WAV ${file.name}`);
    } catch (error) {
      setWavSignal(null);
      setWavFileName(null);
      setWavStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function buildGeneratedSignal(
    kind: Exclude<SignalKind, "wav">,
    options: {
      durationMs: number;
      frequencyHz: number;
      seed: number;
      tapTimeMs?: number;
    },
  ): Float32Array {
    if (kind === "sinusoid") {
      return makeSinusoid({
        durationMs: options.durationMs,
        frequencyHz: options.frequencyHz,
        window: "none",
      });
    }
    if (kind === "noise") {
      return makeWhiteNoise({ durationMs: options.durationMs, seed: options.seed });
    }
    if (kind === "tap") {
      return makeTap(options.durationMs, options.tapTimeMs ?? 12);
    }
    return makeImpulse({ durationMs: options.durationMs });
  }

  useEffect(() => {
    if (!appData) return;
    const token = renderTokenRef.current + 1;
    renderTokenRef.current = token;

    if (stimuli.length === 0) {
      setProjected(null);
      setRmsDb(null);
      setIsRendering(false);
      return;
    }

    async function renderCurrentStimuli() {
      if (!appData) return;
      setIsRendering(true);
      setStatus("Rendering SkinSource response...");
      try {
        const chunks = new Map();
        for (const stimulus of stimuli) {
          chunks.set(stimulus.location, await appData.store.load(model, stimulus.location));
        }
        const response = renderVibrations({
          chunksByLocation: chunks,
          stimuli,
          cache: cacheRef.current,
        });
        if (renderTokenRef.current !== token) return;
        const nextProjected = projectVibrations(response, projection);
        setProjected(nextProjected);
        setRmsDb(decibelsRelativeToMax(rmsByOutput(nextProjected)));
        setStatus(
          `Rendered ${stimuli.length} input${stimuli.length === 1 ? "" : "s"}: ` +
            `${response.samples} samples, ${displayedQuantityShortLabel(projection)}`,
        );
      } catch (error) {
        if (renderTokenRef.current === token) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (renderTokenRef.current === token) setIsRendering(false);
      }
    }

    void renderCurrentStimuli();
  }, [appData, model, projection, stimuli]);

  const ready = Boolean(appData);
  const modelScale =
    appData?.manifest.models.find((entry) => entry.id === model)?.pixelToMmScale ?? 1;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Activity aria-hidden="true" size={22} />
          <div>
            <h1>SkinSource</h1>
            <p>Data-driven toolbox for predicting dynamic tactile signals in the hand and arm</p>
          </div>
        </div>
        <nav className="top-links" aria-label="Project links">
          <a href={APP_README_URL} target="_blank" rel="noreferrer" title="Open the app README">
            <FileText size={14} aria-hidden="true" />
            README
          </a>
          <a
            href="https://doi.org/10.1109/HAPTICS59260.2024.10520852"
            target="_blank"
            rel="noreferrer"
            title="Open the SkinSource paper DOI"
          >
            Paper
          </a>
          <a
            href="https://github.com/neelitummala/skinsource"
            target="_blank"
            rel="noreferrer"
            title="Open the original SkinSource repository"
          >
            SkinSource on GitHub
          </a>
        </nav>
        <div className="top-status">
          <span className="status-pill">
            <Database size={14} aria-hidden="true" />
            {preload.loaded}/{preload.total}
          </span>
          <span className="status-text">{loadError ?? status}</span>
        </div>
      </header>

      <section className={controlsCollapsed ? "workbench controls-collapsed" : "workbench"}>
        <aside className={controlsCollapsed ? "control-rail collapsed" : "control-rail"}>
          <section className="control-panel">
            <button
              className="control-rail-toggle"
              type="button"
              onClick={() => setControlsCollapsed((current) => !current)}
              title={controlsCollapsed ? "Show controls" : "Hide controls"}
              aria-expanded={!controlsCollapsed}
            >
              {controlsCollapsed ? (
                <PanelLeftOpen size={18} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={18} aria-hidden="true" />
              )}
              {controlsCollapsed ? (
                <span className="sr-only">Show controls</span>
              ) : (
                <span>Controls</span>
              )}
            </button>
            {controlsCollapsed ? null : (
              <div className="control-panel-body">
                <div className="control-group">
            <label title="Choose the SkinSource limb recording and impulse-response set.">
              Upper-limb recording
              <select
                value={model}
                onChange={(event) => setModel(Number(event.target.value))}
                title="Choose the SkinSource limb recording and impulse-response set."
              >
                {appData?.manifest.models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    Limb {entry.id} · {entry.sex === "M" ? "male" : "female"}
                  </option>
                ))}
              </select>
            </label>
            <label title="Choose the scalar quantity displayed on maps and plots.">
              Displayed quantity
              <select
                value={projection}
                onChange={(event) => setProjection(event.target.value as ProjectionMode)}
                title="Choose the scalar quantity displayed on maps and plots."
              >
                {DISPLAYED_QUANTITIES.map((quantity) => (
                  <option key={quantity.value} value={quantity.value} title={quantity.hint}>
                    {quantity.label}
                  </option>
                ))}
              </select>
            </label>
            <label title="Choose the hand contact site for the next input signal.">
              Input contact location
              <select
                value={inputLocation}
                onChange={(event) => setInputLocation(Number(event.target.value))}
                title="Choose the hand contact site for the next input signal."
              >
                {appData?.manifest.inputLocations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id} · {entry.contactType}
                  </option>
                ))}
              </select>
            </label>
            <label title="Choose the stimulus waveform for the next assignment.">
              Stimulus signal
              <select
                value={signalKind}
                onChange={(event) => setSignalKind(event.target.value as SignalKind)}
                title="Choose the stimulus waveform for the next assignment."
              >
                <option value="sinusoid">Sinusoid</option>
                <option value="impulse">Impulse</option>
                <option value="tap">Tap</option>
                <option value="noise">White noise</option>
                <option value="wav">WAV file</option>
              </select>
            </label>
            {signalKind === "wav" ? (
              <label title="Import a local mono or multichannel WAV file; it is mixed to mono and resampled to 1300 Hz.">
                WAV file
                <input
                  type="file"
                  accept=".wav,audio/wav,audio/wave,audio/x-wav"
                  onChange={(event) => void handleWavFile(event.currentTarget.files?.[0] ?? null)}
                  title="Import a local mono or multichannel WAV file; it is mixed to mono and resampled to 1300 Hz."
                />
                <span className="field-note">{wavStatus}</span>
              </label>
            ) : null}
            {signalKind === "sinusoid" ? (
              <RangeField
                label="Carrier frequency"
                value={frequencyHz}
                unit="Hz"
                min={25}
                max={600}
                step={1}
                onChange={setFrequencyHz}
                title="Sinusoidal carrier frequency in hertz."
              />
            ) : null}
            {signalKind === "noise" ? (
              <label title="Repeatable seed for white-noise generation.">
                Seed
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                  title="Repeatable seed for white-noise generation."
                />
              </label>
            ) : null}
            {signalKind !== "wav" ? (
              <RangeField
                label="Stimulus duration"
                value={durationMs}
                unit="ms"
                min={30}
                max={4000}
                step={10}
                onChange={setDurationMs}
                title="Stimulus duration; the response also includes the impulse-response tail."
              />
            ) : (
              <label title="Duration is set from the decoded WAV signal.">
                WAV duration
                <input type="text" value={`${durationMs} ms`} readOnly />
              </label>
            )}
            <RangeField
              label="Input amplitude gain"
              value={targetAmplitude}
              unit="m/s²"
              min={0}
              max={5}
              step={0.1}
              onChange={setTargetAmplitude}
              title="Scale the input acceleration before SkinSource superposition."
            />
            <div className="control-divider" />
            <RangeField
              label="Surface scale floor"
              value={colorMinDb}
              unit="dB"
              min={-80}
              max={-5}
              step={1}
              onChange={(value) => setColorMinDb(Math.min(value, colorMaxDb - 1))}
              title="Lower normalized RMS acceleration value mapped to the bottom of the colorbar."
            />
            <RangeField
              label="Surface scale ceiling"
              value={colorMaxDb}
              unit="dB"
              min={-30}
              max={0}
              step={1}
              onChange={(value) => setColorMaxDb(Math.max(value, colorMinDb + 1))}
              title="Upper normalized RMS acceleration value mapped to the top of the colorbar."
            />
            <div className="input-action-row">
              <button
                className="action-button"
                type="button"
                onClick={() => addStimulus("add")}
                disabled={!ready}
                title="Add this stimulus to the simulation input list."
              >
                <Plus size={13} aria-hidden="true" />
                Add input
              </button>
              <button
                className="action-button subtle"
                type="button"
                onClick={() => addStimulus("replace")}
                disabled={!ready}
                title="Replace existing stimuli at this input location with the current stimulus."
              >
                <RefreshCw size={13} aria-hidden="true" />
                Replace
              </button>
            </div>
                </div>

                <div className="control-group">
                  <div className="control-group-title">
                    <h2>Simulation inputs</h2>
                    {isRendering ? (
                      <span className="rendering-pill">
                        <Loader2 className="spin" size={12} aria-hidden="true" />
                        Rendering
                      </span>
                    ) : null}
                  </div>
            <div className="stimulus-list">
              {stimuli.length === 0 ? (
                <p className="empty-note">No inputs added</p>
              ) : (
                stimuli
                  .slice()
                  .sort((a, b) => a.location - b.location)
                  .map((stimulus) => (
                    <div className="stimulus-row" key={stimulus.id}>
                      <span>Loc {stimulus.location}</span>
                      <strong>{stimulus.label}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setStimuli((current) =>
                            current.filter((item) => item.id !== stimulus.id),
                          )
                        }
                        aria-label={`Remove location ${stimulus.location}`}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  ))
              )}
            </div>
                </div>

                <div className="control-group">
                  <h2>Downloads</h2>
            <ExportView
              appData={appData}
              projected={projected}
              rmsDb={rmsDb}
              spectrum={spectrum}
              selectedOutput={selectedOutput}
              selectedOutputs={selectedOutputs}
              model={model}
              colorMap={appData?.colorMap ?? null}
              interpolationAsset={interpolationAsset}
              modelScale={modelScale}
              projection={projection}
              surfaceMode={surfaceMode}
              stimuli={stimuli}
              colorMinDb={colorMinDb}
              colorMaxDb={colorMaxDb}
              onStatus={setStatus}
            />
                </div>
              </div>
            )}
          </section>
        </aside>

        <section className="analysis-pane">
          <div className="map-strip">
            <InputMap
              selected={inputLocation}
              activeLocations={stimuli.map((item) => item.location)}
              onSelect={setInputLocation}
            />
            <OutputMap
              geometry={appData?.geometry ?? null}
              colorMap={appData?.colorMap ?? null}
              interpolationAsset={interpolationAsset}
              modelScale={modelScale}
              colorMinDb={colorMinDb}
              colorMaxDb={colorMaxDb}
              surfaceMode={surfaceMode}
              showInterpolatedSensors={showInterpolatedSensors}
              onShowInterpolatedSensorsChange={setShowInterpolatedSensors}
              onSurfaceModeChange={setSurfaceMode}
              values={rmsDb}
              selected={selectedOutputs}
              onSelect={selectOutput}
            />
          </div>

          <section className="plot-panel">
            <header className="panel-title-row">
              <h2>
                <span>Time domain</span>
                <span>
                  {displayedQuantityShortLabel(projection)} · q(t), acceleration in m/s²
                </span>
              </h2>
            </header>
            <TraceView
              projected={projected}
              traces={selectedTraces}
              selectedOutputs={selectedOutputs}
            />
          </section>

          <section className="plot-panel">
            <header className="panel-title-row">
              <h2>
                <span>Frequency domain</span>
                <span>
                  One-sided |FFT(q)|; magnitude is in acceleration units before normalization
                </span>
              </h2>
            </header>
            <SpectrumView spectra={selectedSpectra} selectedOutputs={selectedOutputs} />
          </section>

        </section>
      </section>
      <footer className="app-footer">
        <span>
          N. Tummala et al., “SkinSource: A Dataset of Whole-Arm Skin Vibrations for Tactile Rendering”, IEEE Haptics Symposium 2024 ·{" "}
          <a
            href="https://doi.org/10.1109/HAPTICS59260.2024.10520852"
            target="_blank"
            rel="noreferrer"
          >
            DOI
          </a>
        </span>
        <span>
          <a href="https://github.com/neelitummala/skinsource" target="_blank" rel="noreferrer">
            SkinSource on GitHub
          </a>
        </span>
      </footer>
    </main>
  );
}

function RangeField({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
  title,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  title: string;
}) {
  return (
    <label className="range-field" title={title}>
      <span className="range-label">
        {label}
        <strong>
          {formatControlValue(value, step)} {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        title={title}
      />
    </label>
  );
}

function InputMap({
  selected,
  activeLocations,
  onSelect,
}: {
  selected: number;
  activeLocations: number[];
  onSelect: (location: number) => void;
}) {
  return (
    <section className="map-panel compact-map input-map">
      <header>
        <h2>Input Locations</h2>
        <span>click to select</span>
      </header>
      <div className="input-image-stage">
        <img src={INPUT_LOCATION_IMAGE_URL} alt="Numbered SkinSource input locations" />
        {Object.entries(INPUT_IMAGE_POINTS).map(([key, point]) => {
          const id = Number(key);
          const active = activeLocations.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={
                id === selected
                  ? "input-marker selected"
                  : active
                    ? "input-marker active"
                    : "input-marker"
              }
              style={{
                left: `${(100 * point.x) / INPUT_IMAGE_WIDTH}%`,
                top: `${(100 * point.y) / INPUT_IMAGE_HEIGHT}%`,
              }}
              onClick={() => onSelect(id)}
              title={`Input location ${id}: click to use for the next stimulus`}
              aria-label={`Input location ${id}`}
            />
          );
        })}
      </div>
    </section>
  );
}

function OutputMap({
  geometry,
  colorMap,
  interpolationAsset,
  modelScale,
  colorMinDb,
  colorMaxDb,
  surfaceMode,
  showInterpolatedSensors,
  onShowInterpolatedSensorsChange,
  onSurfaceModeChange,
  values,
  selected,
  onSelect,
}: {
  geometry: VisualizationGeometry | null;
  colorMap: MatlabColormap | null;
  interpolationAsset: SurfaceInterpolationAsset | null;
  modelScale: number;
  colorMinDb: number;
  colorMaxDb: number;
  surfaceMode: SurfaceMode;
  showInterpolatedSensors: boolean;
  onShowInterpolatedSensorsChange: (show: boolean) => void;
  onSurfaceModeChange: (mode: SurfaceMode) => void;
  values: Float32Array | null;
  selected: number[];
  onSelect: (location: number, additive: boolean) => void;
}) {
  const vertices = (geometry?.surfaceVertices ?? []).map(([x, y]) => [
    x * modelScale,
    y * modelScale,
  ] as [number, number]);
  const outputs = (geometry?.outputLocations ?? []).map(([x, y]) => [
    x == null ? null : x * modelScale,
    y == null ? null : y * modelScale,
  ] as [number | null, number | null]);
  const validOutputs = outputs
    .map((point, index) => ({ point, id: index + 1 }))
    .filter(({ point }) => point[0] !== null && point[1] !== null);
  const bounds = getBounds(vertices.length > 0 ? vertices : validOutputs.map(({ point }) => point as [number, number]));
  const interpolatedImageUrl = useMemo(() => {
    if (surfaceMode !== "interpolated" || !interpolationAsset || !values || !colorMap) {
      return null;
    }
    return interpolatedSurfaceImageUrl(
      interpolationAsset,
      values,
      colorMap,
      colorMinDb,
      colorMaxDb,
    );
  }, [surfaceMode, interpolationAsset, values, colorMap, colorMinDb, colorMaxDb]);
  const selectionLabel =
    selected.length <= 4
      ? selected.join(", ")
      : `${selected.slice(0, 4).join(", ")} +${selected.length - 4}`;
  const showOutputMarkers = surfaceMode === "sensors" || showInterpolatedSensors;
  return (
    <section className="map-panel output-map">
      <header className="surface-header">
        <div>
          <h2>Surface Response</h2>
          <span>
            click to select · outputs {selectionLabel}
          </span>
        </div>
        <div className="surface-tools">
          <div className="segmented-control" aria-label="Surface rendering mode">
            <button
              type="button"
              className={surfaceMode === "sensors" ? "active" : ""}
              onClick={() => onSurfaceModeChange("sensors")}
              title="Show measured dorsal output locations as colored sensors."
            >
              Sensors
            </button>
            <button
              type="button"
              className={surfaceMode === "interpolated" ? "active" : ""}
              onClick={() => onSurfaceModeChange("interpolated")}
              disabled={!interpolationAsset}
              title="Fill the dorsal surface using the MATLAB natural-neighbor interpolation operator."
            >
              Interpolated
            </button>
          </div>
          {surfaceMode === "interpolated" ? (
            <label className="inline-check" title="Show or hide output sensor locations on the interpolated surface.">
              <input
                type="checkbox"
                checked={showInterpolatedSensors}
                onChange={(event) => onShowInterpolatedSensorsChange(event.currentTarget.checked)}
              />
              {showInterpolatedSensors ? (
                <Eye size={12} aria-hidden="true" />
              ) : (
                <EyeOff size={12} aria-hidden="true" />
              )}
              Sensors
            </label>
          ) : null}
        </div>
      </header>
      {bounds && colorMap ? (
        <div
          className="surface-stage"
          title="Click an output point to select it. Shift, Option, or Command-click to add or remove outputs."
        >
          <svg viewBox={`${bounds.minX - 20} ${bounds.minY - 20} ${bounds.width + 40} ${bounds.height + 40}`}>
            {interpolatedImageUrl && interpolationAsset ? (
              <image
                href={interpolatedImageUrl}
                x={interpolationAsset.bounds.minX}
                y={interpolationAsset.bounds.minY}
                width={interpolationAsset.width}
                height={interpolationAsset.height}
                preserveAspectRatio="none"
                className="interpolated-surface-image"
              />
            ) : null}
            {vertices.length > 0 ? (
              <polyline
                points={vertices.map(([x, y]) => `${x},${y}`).join(" ")}
                className="surface-outline"
              />
            ) : null}
            {validOutputs.map(({ point, id }) => {
              const [x, y] = point as [number, number];
              const value = values?.[id - 1] ?? -42;
              const selectedIndex = selected.indexOf(id);
              const isSelected = selectedIndex >= 0;
              const labelAngle = -Math.PI / 4 + selectedIndex * 0.9;
              const labelDx = 10 + 8 * Math.cos(labelAngle);
              const labelDy = 4 + 8 * Math.sin(labelAngle);
              return (
                <g
                  key={id}
                  onClick={(event) =>
                    onSelect(id, event.shiftKey || event.altKey || event.metaKey)
                  }
                  className="map-point-button"
                  aria-label={`Output location ${id}`}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={
                      surfaceMode === "interpolated"
                        ? isSelected
                          ? 5.6
                          : 4.2
                        : isSelected
                          ? 6.8
                          : 4.9
                    }
                    fill={
                      !showOutputMarkers
                        ? "transparent"
                        : surfaceMode === "interpolated"
                        ? "transparent"
                        : colorForDb(value, colorMap, colorMinDb, colorMaxDb)
                    }
                    className={[
                      "output-point",
                      !showOutputMarkers ? "hidden-marker" : "",
                      surfaceMode === "interpolated" ? "outline-only" : "",
                      isSelected ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  {showOutputMarkers && isSelected ? (
                    <text className="output-label" x={x + labelDx} y={y + labelDy}>
                      {id}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <img
            className="sensor-inset"
            src={SENSOR_INSET_IMAGE_URL}
            alt="SkinSource dorsal hand sensor inset"
          />
          <ColorBar colorMap={colorMap} minDb={colorMinDb} maxDb={colorMaxDb} />
        </div>
      ) : (
        <div className="map-loading">Loading</div>
      )}
    </section>
  );
}

function ColorBar({
  colorMap,
  minDb,
  maxDb,
}: {
  colorMap: MatlabColormap;
  minDb: number;
  maxDb: number;
}) {
  return (
    <div className="colorbar" aria-label="Surface color scale">
      <div className="colorbar-title">Normalized RMS acceleration</div>
      <div className="colorbar-body">
        <div className="colorbar-ramp" style={{ background: colorMapGradient(colorMap) }} />
        <div className="colorbar-labels">
          <span>{maxDb} dB</span>
          <span>{minDb} dB</span>
        </div>
      </div>
    </div>
  );
}

function interpolatedSurfaceImageUrl(
  asset: SurfaceInterpolationAsset,
  values: Float32Array,
  colorMap: MatlabColormap,
  minDb: number,
  maxDb: number,
): string {
  const interpolated = interpolateSurface(asset, values);
  const canvas = document.createElement("canvas");
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(asset.width, asset.height);
  for (let pixel = 0; pixel < interpolated.length; pixel += 1) {
    const value = interpolated[pixel];
    const offset = pixel * 4;
    if (!Number.isFinite(value)) {
      image.data[offset + 3] = 0;
      continue;
    }
    const [r, g, b] = rgbForDb(value, colorMap, minDb, maxDb);
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = 230;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function TraceView({
  projected,
  traces,
  selectedOutputs,
}: {
  projected: ProjectedVibrations | null;
  traces: Array<{ output: number; trace: Float32Array }> | null;
  selectedOutputs: number[];
}) {
  if (!projected || !traces || traces.length === 0) {
    return <EmptyView title="No time-domain response yet" detail="Add an input to inspect q(t)." />;
  }
  const timeMs = makeTimeMs(projected.samples, projected.sampleRateHz);
  const yRange = symmetricRange(traces.flatMap(({ trace }) => Array.from(trace)));
  return (
    <section className="analysis-stack">
      <div className="plot-scroll">
        <div className="small-multiple-stack">
        {traces.map(({ output, trace }) => (
          <Chart
            key={output}
            title={`Output ${output}`}
            seriesLabel="q(t)"
            xUnit="ms"
            yUnit="m/s²"
            x={timeMs}
            y={trace}
            height={selectedOutputs.length === 1 ? 150 : 112}
            yRange={yRange}
          />
        ))}
        </div>
      </div>
    </section>
  );
}

function SpectrumView({
  spectra,
  selectedOutputs,
}: {
  spectra: Array<{ output: number; spectrum: Spectrum }> | null;
  selectedOutputs: number[];
}) {
  if (!spectra || spectra.length === 0) {
    return <EmptyView title="No frequency-domain response yet" detail="Add an input to inspect |FFT(q)|." />;
  }
  const yRange = positiveRange(
    spectra.flatMap(({ spectrum }) => Array.from(spectrum.magnitudes)),
  );
  return (
    <section className="analysis-stack">
      <div className="plot-scroll">
        <div className="small-multiple-stack">
        {spectra.map(({ output, spectrum }) => (
          <Chart
            key={output}
            title={`Output ${output} · ${spectrum.fftLength}-point FFT`}
            seriesLabel="|FFT(q)|"
            xUnit="Hz"
            yUnit="m/s²"
            x={spectrum.frequenciesHz}
            y={spectrum.magnitudes}
            height={selectedOutputs.length === 1 ? 150 : 112}
            yRange={yRange}
          />
        ))}
        </div>
      </div>
    </section>
  );
}

function ExportView({
  appData,
  projected,
  rmsDb,
  spectrum,
  selectedOutput,
  selectedOutputs,
  model,
  colorMap,
  interpolationAsset,
  modelScale,
  projection,
  surfaceMode,
  stimuli,
  colorMinDb,
  colorMaxDb,
  onStatus,
}: {
  appData: AppData | null;
  projected: ProjectedVibrations | null;
  rmsDb: Float32Array | null;
  spectrum: Spectrum | null;
  selectedOutput: number;
  selectedOutputs: number[];
  model: number;
  colorMap: MatlabColormap | null;
  interpolationAsset: SurfaceInterpolationAsset | null;
  modelScale: number;
  projection: ProjectionMode;
  surfaceMode: SurfaceMode;
  stimuli: AssignedStimulus[];
  colorMinDb: number;
  colorMaxDb: number;
  onStatus: (status: string) => void;
}) {
  if (!projected || !rmsDb) {
    return <EmptyView title="No downloads yet" detail="Add an input first." />;
  }

  const baseName = `skinsourcesim-model${model}-output${selectedOutput}`;
  return (
    <section className="export-stack">
      <p>
        Current render: limb {model}, {projected.samples} samples at {projected.sampleRateHz} Hz,
        primary output {selectedOutput}, {selectedOutputs.length} selected output
        {selectedOutputs.length === 1 ? "" : "s"}.
      </p>
      <div className="export-grid">
        <button
          type="button"
          onClick={() =>
            downloadText(
              `${baseName}-time-domain.csv`,
              "text/csv",
              selectedTimeCsv(projected, selectedOutputs),
            )
          }
          title="Download q(t) for all selected outputs as CSV."
        >
          <Download size={13} aria-hidden="true" />
          Time-domain CSV
        </button>
        <button
          type="button"
          onClick={() =>
            downloadBlob(
              `${baseName}-time-domain.wav`,
              encodeMonoWavPcm16(
                traceAtOutput(projected, selectedOutput - 1),
                projected.sampleRateHz,
              ),
            )
          }
          title="Download the primary selected output as a peak-normalized mono WAV."
        >
          <Download size={13} aria-hidden="true" />
          Time-domain WAV
        </button>
        <button
          type="button"
          onClick={() =>
            spectrum &&
            downloadText(
              `${baseName}-frequency-domain.csv`,
              "text/csv",
              spectrumCsv(spectrum),
            )
          }
          disabled={!spectrum}
          title="Download the one-sided frequency-domain magnitude for the primary output."
        >
          <Download size={13} aria-hidden="true" />
          Frequency CSV
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(
              `skinsourcesim-model${model}-surface-rms.csv`,
              "text/csv",
              rmsCsv(rmsDb),
            )
          }
          title="Download RMS surface values in dB relative to the rendered maximum."
        >
          <Download size={13} aria-hidden="true" />
          Surface RMS CSV
        </button>
        <button
          type="button"
          onClick={() =>
            downloadText(
              `skinsourcesim-model${model}-session.json`,
              "application/json",
              JSON.stringify(
                {
                  model,
                  displayedQuantity: projection,
                  displayedQuantityLabel: displayedQuantityShortLabel(projection),
                  selectedOutput,
                  selectedOutputs,
                  sampleRateHz: projected.sampleRateHz,
                  samples: projected.samples,
                  stimuli: stimuli.map((stimulus) => ({
                    location: stimulus.location,
                    label: stimulus.label,
                    targetAmplitude: stimulus.targetAmplitude,
                    samples: stimulus.signal.length,
                  })),
                },
                null,
                2,
              ),
            )
          }
          title="Download enough configuration metadata to reproduce this render."
        >
          <Download size={13} aria-hidden="true" />
          Session JSON
        </button>
        <button
          type="button"
          onClick={() =>
            appData &&
            colorMap &&
            void downloadSurfacePng(
              appData.geometry,
              rmsDb,
              colorMap,
              colorMinDb,
              colorMaxDb,
              `skinsourcesim-model${model}-surface.png`,
            )
          }
          disabled={!appData || !colorMap}
          title="Download a black-background surface map PNG without selected-output highlighting."
        >
          <Download size={13} aria-hidden="true" />
          Surface PNG
        </button>
        <button
          type="button"
          onClick={() =>
            appData &&
            colorMap &&
            void downloadSurfaceWebm({
              geometry: appData.geometry,
              projected,
              selectedOutput,
              colorMap,
              interpolationAsset,
              modelScale,
              surfaceMode,
              colorMinDb,
              colorMaxDb,
              filename: `skinsourcesim-model${model}-surface.webm`,
              onStatus,
            })
          }
          disabled={!appData || !colorMap}
          title="Render and download a short WebM movie showing the surface response over time."
        >
          <Film size={13} aria-hidden="true" />
          Movie WebM
        </button>
      </div>
    </section>
  );
}

function EmptyView({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-view">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}

function Chart({
  title,
  seriesLabel,
  xUnit,
  yUnit,
  x,
  y,
  height = 140,
  yRange,
}: {
  title: string;
  seriesLabel: string;
  xUnit: string;
  yUnit: string;
  x: Float32Array | Float64Array;
  y: Float32Array | Float64Array;
  height?: number;
  yRange?: [number, number];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = new uPlot(
      {
        width: hostRef.current.clientWidth || 720,
        height,
        scales: { x: { time: false }, y: yRange ? { range: () => yRange } : {} },
        axes: [
          {
            stroke: "#aab5c2",
            grid: { stroke: "rgba(255,255,255,0.08)" },
            values: (_u, vals) => vals.map((value) => `${formatAxisValue(value)} ${xUnit}`),
          },
          {
            stroke: "#aab5c2",
            grid: { stroke: "rgba(255,255,255,0.08)" },
            values: (_u, vals) => vals.map((value) => `${formatAxisValue(value)} ${yUnit}`),
          },
        ],
        cursor: {
          drag: { x: true, y: false },
          focus: { prox: -1 },
        },
        series: [
          {},
          {
            label: seriesLabel,
            stroke: "#74d8d1",
            width: 1.6,
          },
        ],
      },
      [Array.from(x), Array.from(y)],
      hostRef.current,
    );
    const resize = () => chart.setSize({ width: hostRef.current?.clientWidth || 720, height });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.destroy();
    };
  }, [seriesLabel, xUnit, yUnit, x, y, height, yRange]);
  return (
    <div className="chart-frame">
      <div className="chart-label">{title}</div>
      <div className="chart-host" ref={hostRef} />
    </div>
  );
}

function getBounds(points: Array<readonly [number | null, number | null]>) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const [x, y] of points) {
    if (typeof x !== "number" || typeof y !== "number") continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    count += 1;
  }
  if (count === 0) return null;
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function symmetricRange(values: number[]): [number, number] {
  let maxAbs = 0;
  for (const value of values) {
    if (Number.isFinite(value)) maxAbs = Math.max(maxAbs, Math.abs(value));
  }
  const limit = maxAbs > 0 ? maxAbs * 1.08 : 1;
  return [-limit, limit];
}

function positiveRange(values: number[]): [number, number] {
  let max = 0;
  for (const value of values) {
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return [0, max > 0 ? max * 1.08 : 1];
}

function formatAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  if (abs === 0) return "0";
  return value.toExponential(1);
}

function formatControlValue(value: number, step: number): string {
  if (step >= 1) return value.toFixed(0);
  if (step >= 0.1) return value.toFixed(1);
  return value.toString();
}

function selectedTimeCsv(projected: ProjectedVibrations, selectedOutputs: number[]): string {
  const outputs = selectedOutputs.length > 0 ? selectedOutputs : [20];
  const header = ["time_ms", ...outputs.map((output) => `output_${output}_q_m_per_s2`)];
  const lines = [header.join(",")];
  for (let sample = 0; sample < projected.samples; sample += 1) {
    const timeMs = (1000 * sample) / projected.sampleRateHz;
    const values = outputs.map((output) => {
      const offset = sample + projected.samples * (output - 1);
      return projected.data[offset];
    });
    lines.push([timeMs, ...values].join(","));
  }
  return `${lines.join("\n")}\n`;
}

function spectrumCsv(spectrum: Spectrum): string {
  const lines = ["frequency_hz,magnitude"];
  for (let index = 0; index < spectrum.frequenciesHz.length; index += 1) {
    lines.push(`${spectrum.frequenciesHz[index]},${spectrum.magnitudes[index]}`);
  }
  return `${lines.join("\n")}\n`;
}

function rmsCsv(values: Float32Array): string {
  const lines = ["output_location,rms_db_re_max"];
  for (let index = 0; index < values.length; index += 1) {
    lines.push(`${index + 1},${values[index]}`);
  }
  return `${lines.join("\n")}\n`;
}

function downloadText(filename: string, mimeType: string, text: string) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function encodeMonoWavPcm16(signal: Float32Array, sampleRateHz: number): Blob {
  let peak = 0;
  for (const value of signal) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0 ? 0.98 / peak : 1;
  const dataBytes = signal.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < signal.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, signal[index] * gain));
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

async function downloadSurfacePng(
  geometry: VisualizationGeometry,
  values: Float32Array,
  colorMap: MatlabColormap,
  colorMinDb: number,
  colorMaxDb: number,
  filename: string,
) {
  const svg = surfaceSvgMarkup(geometry, values, colorMap, colorMinDb, colorMaxDb);
  const image = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to render surface SVG"));
  });
  image.src = url;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }, "image/png");
}

interface SurfaceWebmRequest {
  geometry: VisualizationGeometry;
  projected: ProjectedVibrations;
  selectedOutput: number;
  colorMap: MatlabColormap;
  interpolationAsset: SurfaceInterpolationAsset | null;
  modelScale: number;
  surfaceMode: SurfaceMode;
  colorMinDb: number;
  colorMaxDb: number;
  filename: string;
  onStatus: (status: string) => void;
}

async function downloadSurfaceWebm({
  geometry,
  projected,
  selectedOutput,
  colorMap,
  interpolationAsset,
  modelScale,
  surfaceMode,
  colorMinDb,
  colorMaxDb,
  filename,
  onStatus,
}: SurfaceWebmRequest) {
  if (!("MediaRecorder" in window)) {
    onStatus("This browser cannot export WebM video");
    return;
  }
  const mimeType = preferredWebmMimeType();
  if (!mimeType) {
    onStatus("This browser has no supported WebM encoder");
    return;
  }

  onStatus("Encoding surface WebM...");
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    onStatus("Canvas video export is unavailable");
    return;
  }

  const fps = 24;
  const frameCount = Math.min(144, projected.samples);
  const stride = Math.max(1, Math.floor(projected.samples / frameCount));
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  const maxAbs = maxAbsProjected(projected);
  for (let sample = 0; sample < projected.samples; sample += stride) {
    const frameValues = frameDbValues(projected, sample, maxAbs);
    drawSurfaceFrame({
      ctx,
      geometry,
      values: frameValues,
      selectedOutput,
      colorMap,
      interpolationAsset,
      modelScale,
      surfaceMode,
      colorMinDb,
      colorMaxDb,
      timeMs: (1000 * sample) / projected.sampleRateHz,
      width: canvas.width,
      height: canvas.height,
    });
    await waitMs(1000 / fps);
  }
  recorder.stop();
  await stopped;
  downloadBlob(filename, new Blob(chunks, { type: mimeType }));
  onStatus(`Downloaded ${filename}`);
}

function preferredWebmMimeType(): string | null {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function maxAbsProjected(projected: ProjectedVibrations): number {
  let max = 0;
  for (const value of projected.data) max = Math.max(max, Math.abs(value));
  return max || 1;
}

function frameDbValues(
  projected: ProjectedVibrations,
  sample: number,
  maxAbs: number,
): Float32Array {
  const out = new Float32Array(projected.outputLocations);
  for (let output = 0; output < projected.outputLocations; output += 1) {
    const value = Math.abs(projected.data[sample + projected.samples * output]);
    out[output] = 20 * Math.log10(Math.max(Number.MIN_VALUE, value / maxAbs));
  }
  return out;
}

function drawSurfaceFrame({
  ctx,
  geometry,
  values,
  selectedOutput,
  colorMap,
  interpolationAsset,
  modelScale,
  surfaceMode,
  colorMinDb,
  colorMaxDb,
  timeMs,
  width,
  height,
}: {
  ctx: CanvasRenderingContext2D;
  geometry: VisualizationGeometry;
  values: Float32Array;
  selectedOutput: number;
  colorMap: MatlabColormap;
  interpolationAsset: SurfaceInterpolationAsset | null;
  modelScale: number;
  surfaceMode: SurfaceMode;
  colorMinDb: number;
  colorMaxDb: number;
  timeMs: number;
  width: number;
  height: number;
}) {
  const vertices = geometry.surfaceVertices.map(([x, y]) => [
    x * modelScale,
    y * modelScale,
  ] as [number, number]);
  const outputs = geometry.outputLocations.map(([x, y]) => [
    x == null ? null : x * modelScale,
    y == null ? null : y * modelScale,
  ] as [number | null, number | null]);
  const validOutputs = outputs
    .map((point, index) => ({ point, id: index + 1 }))
    .filter(({ point }) => point[0] !== null && point[1] !== null);
  const bounds = getBounds(vertices.length > 0 ? vertices : validOutputs.map(({ point }) => point as [number, number]));
  if (!bounds) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  const pad = 48;
  const scale = Math.min(
    (width - 2 * pad) / bounds.width,
    (height - 2 * pad) / bounds.height,
  );
  const xOffset = (width - bounds.width * scale) / 2;
  const yOffset = (height - bounds.height * scale) / 2;
  const point = (x: number, y: number) => ({
    x: xOffset + (x - bounds.minX) * scale,
    y: yOffset + (bounds.maxY - y) * scale,
  });

  if (surfaceMode === "interpolated" && interpolationAsset) {
    drawInterpolatedCanvasFrame(
      ctx,
      interpolationAsset,
      values,
      colorMap,
      point,
      scale,
      colorMinDb,
      colorMaxDb,
    );
  }

  ctx.strokeStyle = "rgba(232, 238, 247, 0.36)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  vertices.forEach(([x, y], index) => {
    const p = point(x, y);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  for (const { point: outputPoint, id } of validOutputs) {
    const [x, y] = outputPoint as [number, number];
    const p = point(x, y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, id === selectedOutput ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = colorForDb(values[id - 1], colorMap, colorMinDb, colorMaxDb);
    ctx.fill();
    ctx.strokeStyle = id === selectedOutput ? "#fff7cf" : "rgba(255,255,255,.66)";
    ctx.lineWidth = id === selectedOutput ? 2 : 1.2;
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(242,245,248,.92)";
  ctx.font = "16px Inter, system-ui, sans-serif";
  ctx.fillText(`SkinSource · ${timeMs.toFixed(1)} ms`, 24, 32);
  ctx.fillStyle = "rgba(157,168,183,.9)";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(`${colorMinDb} to ${colorMaxDb} dB normalized RMS acceleration`, 24, 52);
}

function drawInterpolatedCanvasFrame(
  ctx: CanvasRenderingContext2D,
  asset: SurfaceInterpolationAsset,
  values: Float32Array,
  colorMap: MatlabColormap,
  point: (x: number, y: number) => { x: number; y: number },
  scale: number,
  colorMinDb: number,
  colorMaxDb: number,
) {
  const field = interpolateSurface(asset, values);
  const temp = document.createElement("canvas");
  temp.width = asset.width;
  temp.height = asset.height;
  const tempCtx = temp.getContext("2d");
  if (!tempCtx) return;
  const image = tempCtx.createImageData(asset.width, asset.height);
  for (let pixel = 0; pixel < field.length; pixel += 1) {
    const value = field[pixel];
    const offset = pixel * 4;
    if (!Number.isFinite(value)) {
      image.data[offset + 3] = 0;
      continue;
    }
    const [r, g, b] = rgbForDb(value, colorMap, colorMinDb, colorMaxDb);
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = 225;
  }
  tempCtx.putImageData(image, 0, 0);

  const min = point(asset.bounds.minX, asset.bounds.minY);
  const max = point(asset.bounds.minX + asset.width, asset.bounds.minY + asset.height);
  const left = min.x;
  const top = max.y;
  const drawWidth = asset.width * scale;
  const drawHeight = asset.height * scale;
  ctx.save();
  ctx.translate(left, top + drawHeight);
  ctx.scale(1, -1);
  ctx.drawImage(temp, 0, 0, drawWidth, drawHeight);
  ctx.restore();
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function downloadBlob(filename: string, blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function surfaceSvgMarkup(
  geometry: VisualizationGeometry,
  values: Float32Array,
  colorMap: MatlabColormap,
  colorMinDb: number,
  colorMaxDb: number,
): string {
  const vertices = geometry.surfaceVertices;
  const outputs = geometry.outputLocations
    .map((point, index) => ({ point, id: index + 1 }))
    .filter(({ point }) => point[0] !== null && point[1] !== null);
  const bounds = getBounds(vertices.length > 0 ? vertices : outputs.map(({ point }) => point));
  if (!bounds) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"></svg>`;
  }
  const pad = 32;
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`;
  const outline = vertices.length
    ? `<polyline points="${vertices.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="rgba(232,238,247,.38)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`
    : "";
  const circles = outputs
    .map(({ point, id }) => {
      const [x, y] = point as [number, number];
      return `<circle cx="${x}" cy="${y}" r="6.2" fill="${colorForDb(values[id - 1], colorMap, colorMinDb, colorMaxDb)}" stroke="rgba(255,255,255,.62)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    })
    .join("");
  const colorbar = surfaceColorbarSvg(bounds, colorMinDb, colorMaxDb);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="${viewBox}">
  <defs>
    <linearGradient id="surfaceColorbar" x1="0%" y1="100%" x2="0%" y2="0%">
      ${surfaceGradientStops(colorMap)}
    </linearGradient>
  </defs>
  <rect x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${bounds.width + 2 * pad}" height="${bounds.height + 2 * pad}" fill="#000"/>
  <g transform="scale(1,-1) translate(0,${-(bounds.maxY + bounds.minY)})">
    ${outline}
    ${circles}
  </g>
  ${colorbar}
</svg>`;
}

function surfaceGradientStops(colorMap: MatlabColormap): string {
  return colorMap.values
    .map((value, index) => {
      const offset = colorMap.values.length <= 1 ? 0 : (100 * index) / (colorMap.values.length - 1);
      const [r, g, b] = value.map((channel) => Math.round(255 * channel));
      return `<stop offset="${offset.toFixed(2)}%" stop-color="rgb(${r},${g},${b})"/>`;
    })
    .join("");
}

function surfaceColorbarSvg(
  bounds: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number },
  minDb: number,
  maxDb: number,
): string {
  const barHeight = bounds.height * 0.18;
  const barWidth = bounds.width * 0.018;
  const x = bounds.maxX - bounds.width * 0.035;
  const y = bounds.minY + bounds.height * 0.12;
  const textX = x - bounds.width * 0.012;
  const fontSize = Math.max(bounds.width * 0.018, 7);
  return `
  <g>
    <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#surfaceColorbar)" stroke="rgba(255,255,255,.72)" stroke-width="0.8" vector-effect="non-scaling-stroke"/>
    <text x="${textX}" y="${y + fontSize * 0.4}" fill="rgba(245,247,250,.94)" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" text-anchor="end">${maxDb} dB</text>
    <text x="${textX}" y="${y + barHeight}" fill="rgba(245,247,250,.94)" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" text-anchor="end">${minDb} dB</text>
  </g>`;
}

function displayedQuantityLabel(mode: ProjectionMode): string {
  return DISPLAYED_QUANTITIES.find((quantity) => quantity.value === mode)?.label ?? mode;
}

function displayedQuantityShortLabel(mode: ProjectionMode): string {
  return DISPLAYED_QUANTITIES.find((quantity) => quantity.value === mode)?.shortLabel ?? mode;
}

function displayedQuantityEquation(mode: ProjectionMode): { expression: string; note: string } {
  if (mode === "x") {
    return {
      expression: "q(x,t) = u_x(x,t)",
      note: "Raw local accelerometer x-axis response.",
    };
  }
  if (mode === "y") {
    return {
      expression: "q(x,t) = u_y(x,t)",
      note: "Raw local accelerometer y-axis response.",
    };
  }
  if (mode === "z") {
    return {
      expression: "q(x,t) = u_z(x,t)",
      note: "Skin-normal accelerometer-axis response.",
    };
  }
  if (mode === "rms") {
    return {
      expression: "q(x,t) = u(x,t) dot e_rms(x)",
      note: "e_rms is the per-output unit axis from RMS energy across x, y, and z.",
    };
  }
  return {
    expression: "q(x,t) = sqrt(u_x(x,t)^2 + u_y(x,t)^2 + u_z(x,t)^2)",
    note: "Vector magnitude of the three accelerometer axes.",
  };
}

function makeTimeMs(samples: number, sampleRateHz: number): Float64Array {
  return Float64Array.from(
    Array.from({ length: samples }, (_, i) => (1000 * i) / sampleRateHz),
  );
}

interface DecodedWavSignal {
  signal: Float32Array;
  originalSampleRate: number;
}

async function decodeWavFile(file: File): Promise<DecodedWavSignal> {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("This browser does not expose Web Audio WAV decoding");
  }
  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const mono = mixToMono(decoded);
    const signal =
      decoded.sampleRate === SAMPLE_RATE_HZ
        ? mono
        : resampleSignal(mono, decoded.sampleRate, SAMPLE_RATE_HZ);
    normalizePeak(signal);
    return {
      signal,
      originalSampleRate: decoded.sampleRate,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let sample = 0; sample < buffer.length; sample += 1) {
      mono[sample] += data[sample] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleSignal(
  signal: Float32Array,
  sourceRateHz: number,
  targetRateHz: number,
): Float32Array {
  const targetSamples = Math.max(1, Math.round((signal.length * targetRateHz) / sourceRateHz));
  const output = new Float32Array(targetSamples);
  const rateRatio = targetRateHz / sourceRateHz;
  const cutoff = Math.min(0.5, rateRatio / 2);
  const radius = rateRatio < 1 ? 36 : 12;

  for (let sample = 0; sample < targetSamples; sample += 1) {
    const sourcePosition = (sample * sourceRateHz) / targetRateHz;
    const left = Math.ceil(sourcePosition - radius);
    const right = Math.floor(sourcePosition + radius);
    let sum = 0;
    let weightSum = 0;
    for (let index = left; index <= right; index += 1) {
      if (index < 0 || index >= signal.length) continue;
      const distance = sourcePosition - index;
      const window = 0.5 + 0.5 * Math.cos((Math.PI * distance) / radius);
      const weight = 2 * cutoff * sinc(2 * cutoff * distance) * window;
      sum += signal[index] * weight;
      weightSum += weight;
    }
    output[sample] = weightSum === 0 ? 0 : sum / weightSum;
  }

  return output;
}

function sinc(value: number): number {
  if (Math.abs(value) < 1e-8) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

const rootElement = document.getElementById("root")!;
const rootGlobal = globalThis as typeof globalThis & {
  __skinSourceSimRoot?: ReturnType<typeof ReactDOM.createRoot>;
};
const root = rootGlobal.__skinSourceSimRoot ?? ReactDOM.createRoot(rootElement);
rootGlobal.__skinSourceSimRoot = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
