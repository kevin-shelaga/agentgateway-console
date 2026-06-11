import type { PromSample } from "./prom-parse";

/**
 * Session-scope usage history: successive scrapes of cluster-summed counters
 * become reset-aware per-second rates for charting. Same honest model as the
 * pod CPU/mem charts — trends build while the console is open.
 */

export interface RatePoint {
  t: number;
  v: number;
}

export interface SeriesRate {
  labels: Record<string, string>;
  perSecond: number;
}

interface SeriesState {
  name: string;
  labels: Record<string, string>;
  lastValue: number;
  lastAt: number;
  perSecond: number;
  /** Reset-aware increase accumulated since this console session started. */
  sessionDelta: number;
  points: RatePoint[];
}

const MAX_POINTS = 120;
const store = new Map<string, SeriesState>();

function seriesKey(name: string, labels: Record<string, string>): string {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
  return `${name}|${parts}`;
}

/** Feed one poll's merged samples (any families) into the history. */
export function recordScrape(samples: PromSample[], at: number): void {
  for (const sample of samples) {
    const key = seriesKey(sample.name, sample.labels);
    const prev = store.get(key);
    if (!prev) {
      store.set(key, {
        name: sample.name,
        labels: { ...sample.labels },
        lastValue: sample.value,
        lastAt: at,
        perSecond: 0,
        sessionDelta: 0,
        points: [],
      });
      continue;
    }
    const dt = (at - prev.lastAt) / 1000;
    if (dt <= 0) continue;
    // Counter reset (pod restart): re-base without emitting a negative rate.
    const delta = sample.value >= prev.lastValue ? sample.value - prev.lastValue : 0;
    const perSecond = delta / dt;
    prev.lastValue = sample.value;
    prev.lastAt = at;
    prev.perSecond = perSecond;
    prev.sessionDelta += delta;
    prev.points = [...prev.points, { t: at, v: perSecond }].slice(-MAX_POINTS);
  }
}

/** Latest per-second rate for every series of a metric. */
export function computeRates(name: string): SeriesRate[] {
  const out: SeriesRate[] = [];
  for (const state of store.values()) {
    if (state.name === name) out.push({ labels: state.labels, perSecond: state.perSecond });
  }
  return out;
}

/** Rate-over-time points for one exact series (label match). */
export function usageSeries(name: string, labels: Record<string, string>): RatePoint[] {
  return store.get(seriesKey(name, labels))?.points ?? [];
}

/** All series states for a metric (for summed chart series). */
export function allSeries(name: string): Array<{ labels: Record<string, string>; points: RatePoint[] }> {
  const out: Array<{ labels: Record<string, string>; points: RatePoint[] }> = [];
  for (const state of store.values()) {
    if (state.name === name) out.push({ labels: state.labels, points: state.points });
  }
  return out;
}

/** Sum latest rates per value of one label, descending. */
export function groupBy(
  rates: Array<{ labels: Record<string, string>; perSecond: number }>,
  label: string,
): Array<{ key: string; perSecond: number }> {
  const sums = new Map<string, number>();
  for (const rate of rates) {
    const key = rate.labels[label] ?? "unknown";
    sums.set(key, (sums.get(key) ?? 0) + rate.perSecond);
  }
  return [...sums.entries()]
    .map(([key, perSecond]) => ({ key, perSecond }))
    .sort((a, b) => b.perSecond - a.perSecond || a.key.localeCompare(b.key));
}

export interface SeriesTotal {
  labels: Record<string, string>;
  /** Latest counter value — cumulative since the proxy pods started. */
  value: number;
  /** Reset-aware increase observed while this console session was open. */
  sessionDelta: number;
}

/** Cumulative totals for every series of a metric. */
export function totals(name: string): SeriesTotal[] {
  const out: SeriesTotal[] = [];
  for (const state of store.values()) {
    if (state.name === name)
      out.push({ labels: state.labels, value: state.lastValue, sessionDelta: state.sessionDelta });
  }
  return out;
}

/** Sum lifetime and session totals, optionally over a label filter. */
export function sumTotals(
  list: SeriesTotal[],
  filter?: (labels: Record<string, string>) => boolean,
): { lifetime: number; session: number } {
  let lifetime = 0;
  let session = 0;
  for (const entry of list) {
    if (filter && !filter(entry.labels)) continue;
    lifetime += entry.value;
    session += entry.sessionDelta;
  }
  return { lifetime, session };
}

/** Sum session totals per value of one label, descending. */
export function sessionTotalsBy(
  list: SeriesTotal[],
  label: string,
): Array<{ key: string; total: number }> {
  const sums = new Map<string, number>();
  for (const entry of list) {
    const key = entry.labels[label] ?? "unknown";
    sums.set(key, (sums.get(key) ?? 0) + entry.sessionDelta);
  }
  return [...sums.entries()]
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** Last `windowMs` of points, anchored to the newest sample (not wall clock). */
export function sliceWindow(points: RatePoint[], windowMs: number): RatePoint[] {
  const last = points.at(-1);
  if (!last) return points;
  const cutoff = last.t - windowMs;
  return points.filter((p) => p.t >= cutoff);
}

export function clearUsageHistory(): void {
  store.clear();
}

/** Sum points across series at matching poll timestamps (one chart line). */
export function sumPoints(
  seriesList: Array<{ points: RatePoint[] }>,
): RatePoint[] {
  const sums = new Map<number, number>();
  for (const series of seriesList) {
    for (const point of series.points) {
      sums.set(point.t, (sums.get(point.t) ?? 0) + point.v);
    }
  }
  return [...sums.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
}
