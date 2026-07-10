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
  loadManifest,
  loadVisualizationGeometry,
} from "./lib/data";
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

type TabKey = "surface" | "traces" | "spectrum" | "export";

interface AppData {
  manifest: SkinSourceManifest;
  geometry: VisualizationGeometry;
  store: ChunkStore;
}

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
        const geometry = await loadVisualizationGeometry(manifest);
        const store = new ChunkStore(manifest);
        if (!alive) return;
        setAppData({ manifest, geometry, store });
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
          `${response.samples} samples, projection ${projection}`,
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
            <h1>SkinSourceSim</h1>
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
          <ControlSection title="Model">
            <label>
              Model
              <select value={model} onChange={(event) => setModel(Number(event.target.value))}>
                {appData?.manifest.models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label} · {entry.handLengthMm} mm · {entry.sex}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Projection
              <select
                value={projection}
                onChange={(event) => setProjection(event.target.value as ProjectionMode)}
              >
                <option value="mag">Magnitude xyz</option>
                <option value="z">Z normal</option>
                <option value="x">X raw</option>
                <option value="y">Y raw</option>
                <option value="rms">RMS energy axis</option>
                <option value="soc">Sum components</option>
              </select>
            </label>
          </ControlSection>

          <ControlSection title="Stimulus">
            <label>
              Input location
              <select
                value={inputLocation}
                onChange={(event) => setInputLocation(Number(event.target.value))}
              >
                {appData?.manifest.inputLocations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id} · {entry.contactType}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Signal
              <select
                value={signalKind}
                onChange={(event) => setSignalKind(event.target.value as SignalKind)}
              >
                <option value="sinusoid">Sinusoid</option>
                <option value="impulse">Impulse</option>
                <option value="tap">Tap</option>
                <option value="noise">White noise</option>
              </select>
            </label>
            {signalKind === "sinusoid" ? (
              <label>
                Frequency Hz
                <input
                  type="number"
                  min={25}
                  max={600}
                  step={1}
                  value={frequencyHz}
                  onChange={(event) => setFrequencyHz(Number(event.target.value))}
                />
              </label>
            ) : null}
            {signalKind === "noise" ? (
              <label>
                Seed
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                />
              </label>
            ) : null}
            <div className="field-grid">
              <label>
                Duration ms
                <input
                  type="number"
                  min={30}
                  max={4000}
                  step={10}
                  value={durationMs}
                  onChange={(event) => setDurationMs(Number(event.target.value))}
                />
              </label>
              <label>
                Target m/s²
                <input
                  type="number"
                  step={0.1}
                  value={targetAmplitude}
                  onChange={(event) => setTargetAmplitude(Number(event.target.value))}
                />
              </label>
            </div>
            <button className="action-button" type="button" onClick={addStimulus} disabled={!ready}>
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
              selected={inputLocation}
              activeLocations={stimuli.map((item) => item.location)}
              onSelect={setInputLocation}
            />
            <OutputMap
              geometry={appData?.geometry ?? null}
              values={rmsDb}
              selected={selectedOutput}
              onSelect={setSelectedOutput}
            />
          </div>

          <nav className="tabs" aria-label="Analysis views">
            <TabButton icon={<Waves size={15} />} label="Surface" tab="surface" active={tab} onClick={setTab} />
            <TabButton icon={<LineChart size={15} />} label="Traces" tab="traces" active={tab} onClick={setTab} />
            <TabButton icon={<BarChart3 size={15} />} label="Spectrum" tab="spectrum" active={tab} onClick={setTab} />
            <TabButton icon={<Download size={15} />} label="Export" tab="export" active={tab} onClick={setTab} />
          </nav>

          <div className="view-pane">
            {tab === "surface" ? (
              <SurfaceReadout selectedOutput={selectedOutput} rmsDb={rmsDb} />
            ) : null}
            {tab === "traces" ? (
              <TraceView projected={projected} trace={trace} selectedOutput={selectedOutput} />
            ) : null}
            {tab === "spectrum" ? (
              <SpectrumView spectrum={spectrum} selectedOutput={selectedOutput} />
            ) : null}
            {tab === "export" ? <ExportPlaceholder projected={projected} /> : null}
          </div>
        </section>
      </section>
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
    >
      {icon}
      {label}
    </button>
  );
}

function InputMap({
  geometry,
  selected,
  activeLocations,
  onSelect,
}: {
  geometry: VisualizationGeometry | null;
  selected: number;
  activeLocations: number[];
  onSelect: (location: number) => void;
}) {
  const points = geometry?.inputLocations ?? [];
  const bounds = getBounds(points);
  return (
    <section className="map-panel compact-map">
      <header>
        <h2>Inputs</h2>
        <span>volar sites</span>
      </header>
      {bounds ? (
        <svg viewBox={`${bounds.minX - 22} ${bounds.minY - 22} ${bounds.width + 44} ${bounds.height + 44}`}>
          {points.map(([x, y], index) => {
            const id = index + 1;
            const active = activeLocations.includes(id);
            return (
              <g key={id} onClick={() => onSelect(id)} className="map-point-button">
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
      ) : (
        <div className="map-loading">Loading</div>
      )}
    </section>
  );
}

function OutputMap({
  geometry,
  values,
  selected,
  onSelect,
}: {
  geometry: VisualizationGeometry | null;
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
        <h2>RMS Surface</h2>
        <span>dB re. max</span>
      </header>
      {bounds ? (
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
              <g key={id} onClick={() => onSelect(id)} className="map-point-button">
                <circle
                  cx={x}
                  cy={y}
                  r={id === selected ? 9 : 6.5}
                  fill={colorForDb(value)}
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
      ) : (
        <div className="map-loading">Loading</div>
      )}
    </section>
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

function ExportPlaceholder({ projected }: { projected: ProjectedVibrations | null }) {
  return projected ? (
    <div className="empty-view">
      <h2>Export hooks ready</h2>
      <p>
        Rendered response: {projected.samples} samples x {projected.outputLocations} outputs.
        Data/image export lands in the next slice.
      </p>
    </div>
  ) : (
    <EmptyView title="Nothing to export" detail="Render a response first." />
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

function colorForDb(db: number): string {
  if (!Number.isFinite(db)) return "#27303b";
  const t = Math.max(0, Math.min(1, (db + 50) / 50));
  const stops = [
    [32, 43, 66],
    [44, 111, 122],
    [87, 162, 112],
    [231, 187, 83],
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const rgb = stops[i].map((value, channel) =>
    Math.round(value + (stops[i + 1][channel] - value) * f),
  );
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
