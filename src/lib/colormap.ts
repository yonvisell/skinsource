export interface MatlabColormap {
  name: string;
  source: string;
  values: number[][];
}

export const DEFAULT_DB_MIN = -50;
export const DEFAULT_DB_MAX = 0;

export function colorForDb(
  db: number,
  colorMap: MatlabColormap,
  minDb = DEFAULT_DB_MIN,
  maxDb = DEFAULT_DB_MAX,
): string {
  if (!Number.isFinite(db)) return "#27303b";
  const [r, g, b] = rgbForDb(db, colorMap, minDb, maxDb);
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgbForDb(
  db: number,
  colorMap: MatlabColormap,
  minDb = DEFAULT_DB_MIN,
  maxDb = DEFAULT_DB_MAX,
): [number, number, number] {
  if (!Number.isFinite(db)) return [39, 48, 59];
  const t = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
  return sampleColorMap(colorMap, t);
}

export function colorMapGradient(colorMap: MatlabColormap, steps = 16): string {
  const stops = Array.from({ length: steps }, (_, index) => {
    const t = steps === 1 ? 0 : index / (steps - 1);
    const [r, g, b] = sampleColorMap(colorMap, t);
    return `rgb(${r}, ${g}, ${b}) ${(100 * t).toFixed(1)}%`;
  });
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

function sampleColorMap(colorMap: MatlabColormap, t: number): [number, number, number] {
  const values = colorMap.values;
  if (values.length === 0) return [39, 48, 59];
  const scaled = t * (values.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(values.length - 1, low + 1);
  const frac = scaled - low;
  return [0, 1, 2].map((channel) => {
    const a = values[low][channel] ?? 0;
    const b = values[high][channel] ?? a;
    return Math.round(255 * (a + (b - a) * frac));
  }) as [number, number, number];
}
