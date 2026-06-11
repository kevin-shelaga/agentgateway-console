/** Minimal Prometheus text-format parsing for the BFF metrics scrape. */

export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

/** Parse `name{a="b",...} value` lines, keeping only wanted metric prefixes. */
export function parsePrometheusText(text: string, prefixes: string[]): PromSample[] {
  const samples: PromSample[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    if (!prefixes.some((p) => line.startsWith(p))) continue;

    const braceStart = line.indexOf("{");
    let name: string;
    const labels: Record<string, string> = {};
    let rest: string;

    if (braceStart === -1) {
      const space = line.indexOf(" ");
      if (space === -1) continue;
      name = line.slice(0, space);
      rest = line.slice(space + 1);
    } else {
      name = line.slice(0, braceStart);
      const braceEnd = findClosingBrace(line, braceStart);
      if (braceEnd === -1) continue;
      parseLabels(line.slice(braceStart + 1, braceEnd), labels);
      rest = line.slice(braceEnd + 1).trim();
    }

    const value = Number(rest.split(" ")[0]);
    if (!Number.isFinite(value)) continue;
    samples.push({ name, labels, value });
  }
  return samples;
}

function findClosingBrace(line: string, start: number): number {
  let inQuotes = false;
  for (let i = start + 1; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inQuotes = !inQuotes;
    else if (ch === "}" && !inQuotes) return i;
  }
  return -1;
}

function parseLabels(body: string, out: Record<string, string>): void {
  // a="b",c="d" — values may contain escaped quotes and commas.
  let i = 0;
  while (i < body.length) {
    const eq = body.indexOf("=", i);
    if (eq === -1) break;
    const key = body.slice(i, eq).replace(/^,/, "").trim();
    if (body[eq + 1] !== '"') break;
    let j = eq + 2;
    let value = "";
    while (j < body.length) {
      const ch = body[j];
      if (ch === "\\" && j + 1 < body.length) {
        value += body[j + 1];
        j += 2;
        continue;
      }
      if (ch === '"') break;
      value += ch;
      j++;
    }
    out[key] = value;
    i = j + 1;
  }
}

function seriesKey(sample: PromSample): string {
  const labels = Object.keys(sample.labels)
    .sort()
    .map((k) => `${k}=${sample.labels[k]}`)
    .join(",");
  return `${sample.name}|${labels}`;
}

/**
 * Sum samples across replicas: identical name+labels from different pods
 * collapse into one series (what PromQL sum() would do at query time).
 */
export function mergeSamples(perPod: PromSample[][]): PromSample[] {
  const merged = new Map<string, PromSample>();
  for (const samples of perPod) {
    for (const sample of samples) {
      const key = seriesKey(sample);
      const existing = merged.get(key);
      if (existing) existing.value += sample.value;
      else merged.set(key, { ...sample, labels: { ...sample.labels } });
    }
  }
  return [...merged.values()];
}
