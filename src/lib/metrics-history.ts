import type { InfraPod } from "./api-client";

export interface MetricSample {
  t: number;
  cpu: number;
  mem: number;
}

/** ~30 minutes at the 15s poll interval. */
const MAX_SAMPLES = 120;

/**
 * Session-wide usage history. metrics.k8s.io only serves instantaneous
 * values, so trends are accumulated client-side while the app is open —
 * module scope keeps them across page navigations.
 */
const store = new Map<string, MetricSample[]>();

export function podKey(pod: Pick<InfraPod, "namespace" | "name">): string {
  return `${pod.namespace}/${pod.name}`;
}

export function recordSamples(pods: InfraPod[], t: number): void {
  for (const pod of pods) {
    if (pod.cpuMillis === undefined || pod.memoryBytes === undefined) continue;
    const key = podKey(pod);
    const series = store.get(key) ?? [];
    if (series.at(-1)?.t === t) continue;
    series.push({ t, cpu: pod.cpuMillis, mem: pod.memoryBytes });
    store.set(key, series.slice(-MAX_SAMPLES));
  }
}

export function getHistory(key: string): MetricSample[] {
  return store.get(key) ?? [];
}

export function clearHistory(): void {
  store.clear();
}
