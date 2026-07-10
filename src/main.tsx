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
import { OUTPUT_LOCATIONS, type ProjectionMode } from "./lib/constants";
import {
  ChunkStore,
  assetUrl,
  loadManifest,
  loadMatlabColormap,
  loadVisualizationGeometry,
} from "./lib/data";
import {
  DEFAULT_DB_MAX,
  DEFAULT_DB_MIN,
  colorForDb,
  colorMapGradient,
  type MatlabColormap,
} from "./lib/colormap";
import { oneSidedMagnitudeSpectrum } from "./lib/fft";
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

interface AppData {
  manifest: SkinSourceManifest;
  geometry: VisualizationGeometry;
  colorMap: MatlabColormap;
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
  const [selectedOutput, setSelectedOutput] = useState(20);
  const [signalKind, setSignalKind] = useState<SignalKind>("sinusoid");
  const [durationMs, setDurationMs] = useState(250);
  const [frequencyHz, setFrequencyHz] = useState(100);
  const [seed, setSeed] = useState(0);
  const [targetAmplitude, setTargetAmplitude] = useState(1);
  const [projection, setProjection] = useState<ProjectionMode>("mag");
  const [stimuli, setStimuli] = useState<AssignedStimulus[]>([]);
  const [projected, setProjected] = useState<ProjectedVibrations | null>(null);
  const [rmsDb, setRmsDb] = useState<Float32Array | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [status, setStatus] = useState("Loading dataset manifest...");
  const [tab, setTab] = useState<TabKey>("surface");
  const cacheRef = useRef(new ImpulseFftCache(6));

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        const manifest = await loadManifest();
        const [geometry, colorMap] = await Promise.all([
          loadVisualizationGeometry(manifest),
          loadMatlabColormap(manifest),
        ]);
        const store = new ChunkStore(manifest);
        if (!alive) return;
        setAppData({ manifest, geometry, colorMap, store });
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

  const trace = useMemo(() => {
    if (!projected) return null;
    return traceAtOutput(projected, selectedOutput - 1);
  }, [projected, selectedOutput]);

  const spectrum = useMemo<Spectrum | null>(() => {
    if (!trace || !projected) return null;
    return oneSidedMagnitudeSpectrum(trace, projected.sampleRateHz);
  }, [trace, projected]);

  function buildSignal(): Float32Array {
    if (signalKind === "sinusoid") {
      return makeSinusoid({
        durationMs,
        frequencyHz,
        window: "none",
      });
    }
    if (signalKind === "noise") {
      return makeWhiteNoise({ durationMs, seed });
    }
    if (signalKind === "tap") {
      return makeTap(durationMs, 12);
    }
    return makeImpulse({ durationMs });
  }

  function addStimulus() {
    const signal = buildSignal();
    const label =
      signalKind === "sinusoid"
        ? `${frequencyHz} Hz sine`
        : signalKind === "noise"
          ? `white noise seed ${seed}`
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
              </select>
            </label>
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
              values={rmsDb}
              selected={selectedOutput}
              onSelect={setSelectedOutput}
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
              <SurfaceReadout selectedOutput={selectedOutput} rmsDb={rmsDb} />
            ) : null}
            {tab === "time" ? (
              <TraceView projected={projected} trace={trace} selectedOutput={selectedOutput} />
            ) : null}
            {tab === "frequency" ? (
              <SpectrumView spectrum={spectrum} selectedOutput={selectedOutput} />
            ) : null}
            {tab === "export" ? (
              <ExportView
                appData={appData}
                projected={projected}
                rmsDb={rmsDb}
                spectrum={spectrum}
                selectedOutput={selectedOutput}
                model={model}
                colorMap={appData?.colorMap ?? null}
                projection={projection}
                stimuli={stimuli}
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
  values,
  selected,
  onSelect,
}: {
  geometry: VisualizationGeometry | null;
  colorMap: MatlabColormap | null;
  values: Float32Array | null;
  selected: number;
  onSelect: (location: number) => void;
}) {
  const vertices = geometry?.surfaceVertices ?? [];
  const outputs = geometry?.outputLocations ?? [];
  const validOutputs = outputs
    .map((point, index) => ({ point, id: index + 1 }))
    .filter(({ point }) => point[0] !== null && point[1] !== null);
  const bounds = getBounds(vertices.length > 0 ? vertices : validOutputs.map(({ point }) => point as [number, number]));
  return (
    <section className="map-panel output-map">
      <header>
        <h2>Surface Response</h2>
        <span>RMS, dB re max</span>
      </header>
      {bounds && colorMap ? (
        <div className="surface-stage">
          <svg viewBox={`${bounds.minX - 20} ${bounds.minY - 20} ${bounds.width + 40} ${bounds.height + 40}`}>
            {vertices.length > 0 ? (
              <polyline
                points={vertices.map(([x, y]) => `${x},${y}`).join(" ")}
                className="surface-outline"
              />
            ) : null}
            {validOutputs.map(({ point, id }) => {
              const [x, y] = point as [number, number];
              const value = values?.[id - 1] ?? -42;
              return (
                <g
                  key={id}
                  onClick={() => onSelect(id)}
                  className="map-point-button"
                  aria-label={`Output location ${id}`}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={id === selected ? 9 : 6.5}
                    fill={colorForDb(value, colorMap)}
                    className={id === selected ? "output-point selected" : "output-point"}
                  />
                  {id === selected ? (
                    <text className="output-label" x={x + 10} y={y + 4}>
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

function SurfaceReadout({
  selectedOutput,
  rmsDb,
}: {
  selectedOutput: number;
  rmsDb: Float32Array | null;
}) {
  const value = rmsDb?.[selectedOutput - 1];
  return (
    <section className="readout-grid">
      <Metric label="Selected Output" value={`${selectedOutput}`} />
      <Metric label="RMS Level" value={value == null ? "not rendered" : `${value.toFixed(1)} dB`} />
      <Metric label="Dorsal Points" value={`${OUTPUT_LOCATIONS - 6} mapped`} />
      <Metric label="Volar Points" value="6 trace-only" />
    </section>
  );
}

function TraceView({
  projected,
  trace,
  selectedOutput,
}: {
  projected: ProjectedVibrations | null;
  trace: Float32Array | null;
  selectedOutput: number;
}) {
  if (!projected || !trace) {
    return <EmptyView title="No trace yet" detail="Render a response to inspect selected output traces." />;
  }
  const timeMs = Float64Array.from(
    Array.from({ length: trace.length }, (_, i) => (1000 * i) / projected.sampleRateHz),
  );
  return (
    <Chart
      title={`Output ${selectedOutput} · ${projected.mode}`}
      seriesLabel="m/s²"
      xLabel="ms"
      x={timeMs}
      y={trace}
    />
  );
}

function SpectrumView({
  spectrum,
  selectedOutput,
}: {
  spectrum: Spectrum | null;
  selectedOutput: number;
}) {
  if (!spectrum) {
    return <EmptyView title="No spectrum yet" detail="Render a response to inspect frequency magnitudes." />;
  }
  return (
    <Chart
      title={`Output ${selectedOutput} · ${spectrum.fftLength}-point FFT`}
      seriesLabel="magnitude"
      xLabel="Hz"
      x={spectrum.frequenciesHz}
      y={spectrum.magnitudes}
    />
  );
}

function ExportView({
  appData,
  projected,
  rmsDb,
  spectrum,
  selectedOutput,
  model,
  colorMap,
  projection,
  stimuli,
}: {
  appData: AppData | null;
  projected: ProjectedVibrations | null;
  rmsDb: Float32Array | null;
  spectrum: Spectrum | null;
  selectedOutput: number;
  model: number;
  colorMap: MatlabColormap | null;
  projection: ProjectionMode;
  stimuli: AssignedStimulus[];
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
}: {
  title: string;
  seriesLabel: string;
  xLabel: string;
  x: Float32Array | Float64Array;
  y: Float32Array | Float64Array;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = new uPlot(
      {
        width: hostRef.current.clientWidth || 720,
        height: 280,
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
    const resize = () => chart.setSize({ width: hostRef.current?.clientWidth || 720, height: 280 });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.destroy();
    };
  }, [title, seriesLabel, xLabel, x, y]);
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
