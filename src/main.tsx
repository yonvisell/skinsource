import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  BarChart3,
  Database,
  Download,
  LineChart,
  Loader2,
  Play,
  Plus,
  Trash2,
  Waves,
} from "lucide-react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import "./styles.css";
import { OUTPUT_LOCATIONS, SAMPLE_RATE_HZ, type ProjectionMode } from "./lib/constants";
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

type TabKey = "surface" | "time" | "frequency" | "export";
type SurfaceMode = "sensors" | "interpolated";
type StimulusPreset = "taps" | "superposition" | "noise";

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
  hint: string;
}> = [
  {
    value: "mag",
    label: "Vector magnitude",
    hint: "sqrt(x^2 + y^2 + z^2) at each output location",
  },
  {
    value: "z",
    label: "Normal acceleration (z)",
    hint: "Skin-normal accelerometer axis from the SkinSource data",
  },
  {
    value: "x",
    label: "Raw x acceleration",
    hint: "Raw local accelerometer x axis",
  },
  {
    value: "y",
    label: "Raw y acceleration",
    hint: "Raw local accelerometer y axis",
  },
  {
    value: "rms",
    label: "RMS-energy axis",
    hint: "Dot product with the per-output axis carrying the largest RMS energy",
  },
];

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
  const [arrayText, setArrayText] = useState("");
  const [projection, setProjection] = useState<ProjectionMode>("mag");
  const [stimuli, setStimuli] = useState<AssignedStimulus[]>([]);
  const [projected, setProjected] = useState<ProjectedVibrations | null>(null);
  const [rmsDb, setRmsDb] = useState<Float32Array | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("sensors");
  const [interpolationAsset, setInterpolationAsset] =
    useState<SurfaceInterpolationAsset | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [status, setStatus] = useState("Loading dataset manifest...");
  const [tab, setTab] = useState<TabKey>("surface");
  const cacheRef = useRef(new ImpulseFftCache(6));

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
            if (alive) setStatus("Dataset ready");
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

  function addStimulus() {
    const signal = buildSignal();
    if (!signal) {
      setStatus("Choose a WAV file before assigning a WAV stimulus");
      return;
    }
    const label =
      signalKind === "sinusoid"
        ? `${frequencyHz} Hz sine`
        : signalKind === "noise"
          ? `white noise seed ${seed}`
          : signalKind === "wav"
            ? wavFileName ?? "WAV"
            : signalKind;
    const stimulus: AssignedStimulus = {
      id: `${inputLocation}-${Date.now()}`,
      location: inputLocation,
      label,
      signal,
      targetAmplitude,
    };
    setStimuli((current) => [
      ...current.filter((item) => item.location !== inputLocation),
      stimulus,
    ]);
    setStatus(`Assigned ${label} to input location ${inputLocation}`);
  }

  function applyStimulusRows() {
    try {
      const parsed = parseStimulusRows(arrayText, {
        durationMs,
        frequencyHz,
        seed,
        targetAmplitude,
      });
      if (parsed.length === 0) {
        setStatus("No valid stimulus rows found");
        return;
      }
      const locations = new Set(parsed.map((stimulus) => stimulus.location));
      setStimuli((current) => [
        ...current.filter((stimulus) => !locations.has(stimulus.location)),
        ...parsed,
      ]);
      setStatus(`Assigned ${parsed.length} stimuli from rows`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
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

  function loadStimulusPreset(preset: StimulusPreset) {
    if (preset === "taps") {
      setModel(3);
      setProjection("mag");
      setDurationMs(100);
      setArrayText("7,tap,0,1\n8,tap,0,1\n9,tap,0,1\n10,tap,0,1");
      setSelectedOutputs([20, 21, 22, 24]);
      setStatus("Loaded multi-digit tap rows");
      return;
    }
    if (preset === "superposition") {
      setModel(3);
      setProjection("x");
      setDurationMs(50);
      setArrayText("8,sinusoid,200,1\n13,sinusoid,200,1");
      setSelectedOutputs([19, 21, 24, 32]);
      setStatus("Loaded sinusoid superposition rows");
      return;
    }
    setModel(2);
    setProjection("x");
    setDurationMs(Math.round((1000 * 1000) / SAMPLE_RATE_HZ));
    setArrayText("5,noise,0,1");
    setSelectedOutputs([1, 6, 8, 9, 48, 49, 72]);
    setStatus("Loaded white-noise spectrum rows");
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

  async function render() {
    if (!appData || stimuli.length === 0) {
      setStatus("Assign at least one stimulus before rendering");
      return;
    }

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
      const nextProjected = projectVibrations(response, projection);
      setProjected(nextProjected);
      setRmsDb(decibelsRelativeToMax(rmsByOutput(nextProjected)));
      setTab("surface");
      setStatus(
        `Rendered ${stimuli.length} input${stimuli.length === 1 ? "" : "s"}: ` +
          `${response.samples} samples, ${displayedQuantityLabel(projection)}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRendering(false);
    }
  }

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
            <p>Static upper-limb vibration workbench</p>
          </div>
        </div>
        <div className="top-status">
          <span className="status-pill">
            <Database size={14} aria-hidden="true" />
            {preload.loaded}/{preload.total}
          </span>
          <span className="status-text">{loadError ?? status}</span>
        </div>
      </header>

      <section className="workbench">
        <aside className="control-rail">
          <ControlSection title="Setup">
            <label title="Choose the upper-limb geometry and impulse-response set.">
              Upper-limb model
              <select
                value={model}
                onChange={(event) => setModel(Number(event.target.value))}
                title="Choose the upper-limb geometry and impulse-response set."
              >
                {appData?.manifest.models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label} · {entry.handLengthMm} mm · {entry.sex}
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
          </ControlSection>

          <ControlSection title="Stimulus">
            <label title="Choose the hand contact site for the next assigned input.">
              Input location
              <select
                value={inputLocation}
                onChange={(event) => setInputLocation(Number(event.target.value))}
                title="Choose the hand contact site for the next assigned input."
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
              <label title="Sinusoidal carrier frequency in hertz.">
                Frequency (Hz)
                <input
                  type="number"
                  min={25}
                  max={600}
                  step={1}
                  value={frequencyHz}
                  onChange={(event) => setFrequencyHz(Number(event.target.value))}
                  title="Sinusoidal carrier frequency in hertz."
                />
              </label>
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
            <div className="field-grid">
              {signalKind !== "wav" ? (
                <label title="Stimulus duration; the response also includes the impulse-response tail.">
                  Stimulus duration (ms)
                  <input
                    type="number"
                    min={30}
                    max={4000}
                    step={10}
                    value={durationMs}
                    onChange={(event) => setDurationMs(Number(event.target.value))}
                    title="Stimulus duration; the response also includes the impulse-response tail."
                  />
                </label>
              ) : (
                <label title="Duration is set from the decoded WAV signal.">
                  WAV duration (ms)
                  <input type="number" value={durationMs} readOnly />
                </label>
              )}
              <label title="Scale the generated input before SkinSource superposition.">
                Response scale (m/s²)
                <input
                  type="number"
                  step={0.1}
                  value={targetAmplitude}
                  onChange={(event) => setTargetAmplitude(Number(event.target.value))}
                  title="Scale the generated input before SkinSource superposition."
                />
              </label>
            </div>
            <button
              className="action-button"
              type="button"
              onClick={addStimulus}
              disabled={!ready}
              title="Assign or replace the stimulus at the selected input location."
            >
              <Plus size={16} aria-hidden="true" />
              Assign
            </button>
          </ControlSection>

          <ControlSection title="Stimulus Array">
            <div className="preset-row">
              <button type="button" onClick={() => loadStimulusPreset("taps")} title="Load the multi-digit tap example rows.">
                Fig. 2E taps
              </button>
              <button type="button" onClick={() => loadStimulusPreset("superposition")} title="Load the two-location sinusoid superposition example rows.">
                Fig. 2F sine
              </button>
              <button type="button" onClick={() => loadStimulusPreset("noise")} title="Load the white-noise spectrum example rows.">
                Noise spectra
              </button>
            </div>
            <label title="Rows use location, signal, value, scale. Signals: sinusoid, tap, impulse, noise.">
              Rows
              <textarea
                value={arrayText}
                onChange={(event) => setArrayText(event.target.value)}
                placeholder={"8,sinusoid,200,1\n13,sinusoid,200,1"}
                spellCheck={false}
                title="Rows use location, signal, value, scale. Signals: sinusoid, tap, impulse, noise."
              />
            </label>
            <button
              className="action-button subtle"
              type="button"
              onClick={applyStimulusRows}
              disabled={!ready}
              title="Assign all stimulus rows, replacing existing rows at the same input locations."
            >
              <Plus size={16} aria-hidden="true" />
              Apply Rows
            </button>
          </ControlSection>

          <ControlSection title="Assigned Inputs">
            <div className="stimulus-list">
              {stimuli.length === 0 ? (
                <p className="empty-note">No inputs assigned</p>
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
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))
              )}
            </div>
            <button
              className="render-button"
              type="button"
              onClick={() => void render()}
              disabled={!ready || isRendering}
              title="Render the superposed SkinSource response for assigned inputs."
            >
              {isRendering ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Play size={16} aria-hidden="true" />
              )}
              Render
            </button>
          </ControlSection>
        </aside>

        <section className="analysis-pane">
          <div className="map-strip">
            <InputMap
              geometry={appData?.geometry ?? null}
              outlineUrl={
                appData
                  ? assetUrl(`data/${appData.manifest.visualization.inputHandOutlineImage}`)
                  : null
              }
              selected={inputLocation}
              activeLocations={stimuli.map((item) => item.location)}
              onSelect={setInputLocation}
            />
            <OutputMap
              geometry={appData?.geometry ?? null}
              colorMap={appData?.colorMap ?? null}
              interpolationAsset={interpolationAsset}
              modelScale={modelScale}
              surfaceMode={surfaceMode}
              onSurfaceModeChange={setSurfaceMode}
              values={rmsDb}
              selected={selectedOutputs}
              onSelect={selectOutput}
            />
          </div>

          <nav className="tabs" aria-label="Analysis views">
            <TabButton icon={<Waves size={15} />} label="Surface" tab="surface" active={tab} onClick={setTab} />
            <TabButton icon={<LineChart size={15} />} label="Time domain" tab="time" active={tab} onClick={setTab} />
            <TabButton icon={<BarChart3 size={15} />} label="Frequency" tab="frequency" active={tab} onClick={setTab} />
            <TabButton icon={<Download size={15} />} label="Export" tab="export" active={tab} onClick={setTab} />
          </nav>

          <div className="view-pane">
            {tab === "surface" ? (
              <SurfaceReadout selectedOutputs={selectedOutputs} rmsDb={rmsDb} />
            ) : null}
            {tab === "time" ? (
              <TraceView
                projected={projected}
                traces={selectedTraces}
                selectedOutputs={selectedOutputs}
              />
            ) : null}
            {tab === "frequency" ? (
              <SpectrumView spectra={selectedSpectra} selectedOutputs={selectedOutputs} />
            ) : null}
            {tab === "export" ? (
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
                onStatus={setStatus}
              />
            ) : null}
          </div>
        </section>
      </section>
      <footer className="app-footer">
        <span>
          N. Tummala et al., SkinSource, IEEE Haptics Symposium 2024 ·{" "}
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
            GitHub
          </a>
          {" · "}
          <a href="https://doi.org/10.5281/zenodo.10547601" target="_blank" rel="noreferrer">
            Zenodo data
          </a>
        </span>
      </footer>
    </main>
  );
}

function ControlSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="control-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function TabButton({
  icon,
  label,
  tab,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tab: TabKey;
  active: TabKey;
  onClick: (tab: TabKey) => void;
}) {
  return (
    <button
      type="button"
      className={active === tab ? "tab active" : "tab"}
      onClick={() => onClick(tab)}
      title={`Open ${label} view`}
    >
      {icon}
      {label}
    </button>
  );
}

function InputMap({
  geometry,
  outlineUrl,
  selected,
  activeLocations,
  onSelect,
}: {
  geometry: VisualizationGeometry | null;
  outlineUrl: string | null;
  selected: number;
  activeLocations: number[];
  onSelect: (location: number) => void;
}) {
  const points = geometry?.inputLocations ?? [];
  const bounds = getBounds(points);
  return (
    <section className="map-panel compact-map input-map">
      <header>
        <h2>Input Locations</h2>
        <span>volar hand</span>
      </header>
      {bounds ? (
        <div
          className="input-map-stage"
          style={outlineUrl ? { backgroundImage: `url(${outlineUrl})` } : undefined}
        >
          <svg viewBox={`${bounds.minX - 30} ${bounds.minY - 28} ${bounds.width + 60} ${bounds.height + 56}`}>
            {points.map(([x, y], index) => {
              const id = index + 1;
              const active = activeLocations.includes(id);
              return (
                <g
                  key={id}
                  onClick={() => onSelect(id)}
                  className="map-point-button"
                  aria-label={`Input location ${id}`}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={id === selected ? 13 : 10}
                    className={
                      id === selected ? "input-point selected" : active ? "input-point active" : "input-point"
                    }
                  />
                  <text x={x} y={y + 4}>
                    {id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="map-loading">Loading</div>
      )}
    </section>
  );
}

function OutputMap({
  geometry,
  colorMap,
  interpolationAsset,
  modelScale,
  surfaceMode,
  onSurfaceModeChange,
  values,
  selected,
  onSelect,
}: {
  geometry: VisualizationGeometry | null;
  colorMap: MatlabColormap | null;
  interpolationAsset: SurfaceInterpolationAsset | null;
  modelScale: number;
  surfaceMode: SurfaceMode;
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
    return interpolatedSurfaceImageUrl(interpolationAsset, values, colorMap);
  }, [surfaceMode, interpolationAsset, values, colorMap]);
  return (
    <section className="map-panel output-map">
      <header className="surface-header">
        <div>
          <h2>Surface Response</h2>
          <span>RMS, dB re max</span>
        </div>
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
                    r={isSelected ? 9 : 6.5}
                    fill={colorForDb(value, colorMap)}
                    className={isSelected ? "output-point selected" : "output-point"}
                  />
                  {isSelected ? (
                    <text className="output-label" x={x + labelDx} y={y + labelDy}>
                      {id}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <ColorBar colorMap={colorMap} />
        </div>
      ) : (
        <div className="map-loading">Loading</div>
      )}
    </section>
  );
}

function ColorBar({ colorMap }: { colorMap: MatlabColormap }) {
  return (
    <div className="colorbar" aria-label="Surface color scale">
      <div className="colorbar-ramp" style={{ background: colorMapGradient(colorMap) }} />
      <div className="colorbar-labels">
        <span>{DEFAULT_DB_MAX} dB</span>
        <span>{DEFAULT_DB_MIN} dB</span>
      </div>
    </div>
  );
}

function interpolatedSurfaceImageUrl(
  asset: SurfaceInterpolationAsset,
  values: Float32Array,
  colorMap: MatlabColormap,
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
    const [r, g, b] = rgbForDb(value, colorMap);
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = 230;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function SurfaceReadout({
  selectedOutputs,
  rmsDb,
}: {
  selectedOutputs: number[];
  rmsDb: Float32Array | null;
}) {
  const primaryOutput = selectedOutputs[selectedOutputs.length - 1] ?? 20;
  const value = rmsDb?.[primaryOutput - 1];
  const selectionLabel = selectedOutputs.length <= 4
    ? selectedOutputs.join(", ")
    : `${selectedOutputs.slice(0, 4).join(", ")} +${selectedOutputs.length - 4}`;
  return (
    <section className="readout-grid">
      <Metric label="Selected Outputs" value={selectionLabel} />
      <Metric label="Primary RMS Level" value={value == null ? "not rendered" : `${value.toFixed(1)} dB`} />
      <Metric label="Dorsal Points" value={`${OUTPUT_LOCATIONS - 6} mapped`} />
      <Metric label="Volar Points" value="6 trace-only" />
    </section>
  );
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
    return <EmptyView title="No trace yet" detail="Render a response to inspect selected output traces." />;
  }
  const timeMs = makeTimeMs(projected.samples, projected.sampleRateHz);
  const equation = displayedQuantityEquation(projected.mode as ProjectionMode);
  return (
    <section className="analysis-stack">
      <div className="equation-strip">
        <span>{displayedQuantityLabel(projected.mode as ProjectionMode)}</span>
        <code>{equation.expression}</code>
        <small>{equation.note}</small>
      </div>
      <div className={traces.length === 1 ? "small-multiple-grid single" : "small-multiple-grid"}>
        {traces.map(({ output, trace }) => (
          <Chart
            key={output}
            title={`Output ${output}`}
            seriesLabel="m/s²"
            xLabel="ms"
            x={timeMs}
            y={trace}
            height={selectedOutputs.length === 1 ? 260 : 170}
          />
        ))}
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
    return <EmptyView title="No spectrum yet" detail="Render a response to inspect frequency magnitudes." />;
  }
  return (
    <section className="analysis-stack">
      <div className="view-note">
        {selectedOutputs.length === 1
          ? "One-sided magnitude spectrum for the selected output."
          : "One-sided magnitude spectra for selected outputs."}
      </div>
      <div className={spectra.length === 1 ? "small-multiple-grid single" : "small-multiple-grid"}>
        {spectra.map(({ output, spectrum }) => (
          <Chart
            key={output}
            title={`Output ${output} · ${spectrum.fftLength}-point FFT`}
            seriesLabel="magnitude"
            xLabel="Hz"
            x={spectrum.frequenciesHz}
            y={spectrum.magnitudes}
            height={selectedOutputs.length === 1 ? 260 : 170}
          />
        ))}
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
  onStatus: (status: string) => void;
}) {
  if (!projected || !rmsDb) {
    return <EmptyView title="Nothing to export" detail="Render a response first." />;
  }

  const baseName = `skinsourcesim-model${model}-output${selectedOutput}`;
  return (
    <section className="export-grid">
      <button
        type="button"
        onClick={() =>
          downloadText(
            `${baseName}-trace.csv`,
            "text/csv",
            traceCsv(projected, selectedOutput - 1),
          )
        }
      >
        <Download size={16} aria-hidden="true" />
        Trace CSV
      </button>
      <button
        type="button"
        onClick={() =>
          spectrum &&
          downloadText(
            `${baseName}-spectrum.csv`,
            "text/csv",
            spectrumCsv(spectrum),
          )
        }
        disabled={!spectrum}
      >
        <Download size={16} aria-hidden="true" />
        Spectrum CSV
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
      >
        <Download size={16} aria-hidden="true" />
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
                displayedQuantityLabel: displayedQuantityLabel(projection),
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
      >
        <Download size={16} aria-hidden="true" />
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
            selectedOutput,
            colorMap,
            `skinsourcesim-model${model}-surface.png`,
          )
        }
        disabled={!appData || !colorMap}
      >
        <Download size={16} aria-hidden="true" />
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
            filename: `skinsourcesim-model${model}-surface.webm`,
            onStatus,
          })
        }
        disabled={!appData || !colorMap}
      >
        <Download size={16} aria-hidden="true" />
        Surface WebM
      </button>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  xLabel,
  x,
  y,
  height = 280,
}: {
  title: string;
  seriesLabel: string;
  xLabel: string;
  x: Float32Array | Float64Array;
  y: Float32Array | Float64Array;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = new uPlot(
      {
        width: hostRef.current.clientWidth || 720,
        height,
        title,
        scales: { x: { time: false } },
        axes: [
          { label: xLabel, stroke: "#9da8b7", grid: { stroke: "rgba(255,255,255,0.06)" } },
          { label: seriesLabel, stroke: "#9da8b7", grid: { stroke: "rgba(255,255,255,0.06)" } },
        ],
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
  }, [title, seriesLabel, xLabel, x, y, height]);
  return <div className="chart-host" ref={hostRef} />;
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

function traceCsv(projected: ProjectedVibrations, outputIndex: number): string {
  const lines = ["time_ms,acceleration"];
  for (let sample = 0; sample < projected.samples; sample += 1) {
    const timeMs = (1000 * sample) / projected.sampleRateHz;
    const value = projected.data[sample + projected.samples * outputIndex];
    lines.push(`${timeMs},${value}`);
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

async function downloadSurfacePng(
  geometry: VisualizationGeometry,
  values: Float32Array,
  selectedOutput: number,
  colorMap: MatlabColormap,
  filename: string,
) {
  const svg = surfaceSvgMarkup(geometry, values, selectedOutput, colorMap);
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
  ctx.fillStyle = "#10151d";
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

  ctx.fillStyle = "#10151d";
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
    drawInterpolatedCanvasFrame(ctx, interpolationAsset, values, colorMap, point, scale);
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
    ctx.fillStyle = colorForDb(values[id - 1], colorMap);
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
  ctx.fillText(`${DEFAULT_DB_MIN} to ${DEFAULT_DB_MAX} dB re max`, 24, 52);
}

function drawInterpolatedCanvasFrame(
  ctx: CanvasRenderingContext2D,
  asset: SurfaceInterpolationAsset,
  values: Float32Array,
  colorMap: MatlabColormap,
  point: (x: number, y: number) => { x: number; y: number },
  scale: number,
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
    const [r, g, b] = rgbForDb(value, colorMap);
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
  selectedOutput: number,
  colorMap: MatlabColormap,
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
      const r = id === selectedOutput ? 9 : 6.2;
      const stroke = id === selectedOutput ? "#fff7cf" : "rgba(255,255,255,.62)";
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${colorForDb(values[id - 1], colorMap)}" stroke="${stroke}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    })
    .join("");
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="${viewBox}">
  <rect x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${bounds.width + 2 * pad}" height="${bounds.height + 2 * pad}" fill="#10151d"/>
  <g transform="scale(1,-1) translate(0,${-(bounds.maxY + bounds.minY)})">
    ${outline}
    ${circles}
  </g>
</svg>`;
}

function displayedQuantityLabel(mode: ProjectionMode): string {
  return DISPLAYED_QUANTITIES.find((quantity) => quantity.value === mode)?.label ?? mode;
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

interface StimulusRowDefaults {
  durationMs: number;
  frequencyHz: number;
  seed: number;
  targetAmplitude: number;
}

interface DecodedWavSignal {
  signal: Float32Array;
  originalSampleRate: number;
}

function parseStimulusRows(
  text: string,
  defaults: StimulusRowDefaults,
): AssignedStimulus[] {
  const rows = text.split(/\r?\n/);
  const parsed: AssignedStimulus[] = [];
  rows.forEach((rawRow, rowIndex) => {
    const row = rawRow.trim();
    if (!row || row.startsWith("#")) return;
    const tokens = row.split(/[,\t ]+/).map((token) => token.trim()).filter(Boolean);
    const location = Number(tokens[0]);
    if (!Number.isInteger(location) || location < 1 || location > 20) {
      throw new Error(`Row ${rowIndex + 1}: input location must be 1-20`);
    }
    const kind = normalizeRowSignalKind(tokens[1] ?? "sinusoid");
    const value = parseOptionalNumber(tokens[2]);
    const targetAmplitude = parseOptionalNumber(tokens[3]) ?? defaults.targetAmplitude;
    const seed = parseOptionalNumber(tokens[4]) ?? defaults.seed;
    const { signal, label } = makeStimulusRowSignal(kind, value, {
      ...defaults,
      seed,
    });
    parsed.push({
      id: `row-${rowIndex}-${location}-${Date.now()}`,
      location,
      label,
      signal,
      targetAmplitude,
    });
  });
  return parsed;
}

function normalizeRowSignalKind(token: string): Exclude<SignalKind, "wav"> {
  const kind = token.toLowerCase();
  if (kind === "sine" || kind === "sin" || kind === "sinusoid") return "sinusoid";
  if (kind === "white" || kind === "whitenoise" || kind === "noise") return "noise";
  if (kind === "tap" || kind === "taps") return "tap";
  if (kind === "impulse" || kind === "imp") return "impulse";
  throw new Error(`Unknown stimulus signal "${token}"`);
}

function makeStimulusRowSignal(
  kind: Exclude<SignalKind, "wav">,
  value: number | null,
  defaults: StimulusRowDefaults,
): { signal: Float32Array; label: string } {
  if (kind === "sinusoid") {
    const frequencyHz = value ?? defaults.frequencyHz;
    return {
      signal: makeSinusoid({
        durationMs: defaults.durationMs,
        frequencyHz,
        window: "none",
      }),
      label: `${frequencyHz} Hz sine`,
    };
  }
  if (kind === "noise") {
    const rowSeed = Math.round(value ?? defaults.seed);
    return {
      signal: makeWhiteNoise({ durationMs: defaults.durationMs, seed: rowSeed }),
      label: `white noise seed ${rowSeed}`,
    };
  }
  if (kind === "tap") {
    const tapTimeMs = value ?? 12;
    return {
      signal: makeTap(defaults.durationMs, tapTimeMs),
      label: `${tapTimeMs} ms tap`,
    };
  }
  const sampleIndex = Math.max(0, Math.round(value ?? 14));
  return {
    signal: makeImpulse({ durationMs: defaults.durationMs, sampleIndex }),
    label: `impulse sample ${sampleIndex + 1}`,
  };
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number "${value}"`);
  return parsed;
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
        : await resampleWithWebAudio(mono, decoded.sampleRate, SAMPLE_RATE_HZ);
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

async function resampleWithWebAudio(
  signal: Float32Array,
  sourceRateHz: number,
  targetRateHz: number,
): Promise<Float32Array> {
  const targetSamples = Math.max(1, Math.round((signal.length * targetRateHz) / sourceRateHz));
  const offline = new OfflineAudioContext(1, targetSamples, targetRateHz);
  const buffer = offline.createBuffer(1, signal.length, sourceRateHz);
  buffer.copyToChannel(new Float32Array(signal), 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
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
