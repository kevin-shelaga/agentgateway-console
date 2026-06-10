/** Kubernetes resource.Quantity parsing for the subset metrics emit. */

/** CPU quantity → millicores ("2m" → 2, "1500000n" → 1.5, "1" → 1000). */
export function parseCpuMillis(quantity: string): number | null {
  const match = /^([0-9]*\.?[0-9]+)(n|u|m)?$/.exec(quantity.trim());
  if (!match) return null;
  const value = Number(match[1]);
  switch (match[2]) {
    case "n":
      return value / 1e6;
    case "u":
      return value / 1e3;
    case "m":
      return value;
    default:
      return value * 1000;
  }
}

const BINARY: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
};
const DECIMAL: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/** Memory quantity → bytes ("16Mi", "500M", "1024"). */
export function parseMemoryBytes(quantity: string): number | null {
  const match = /^([0-9]*\.?[0-9]+)(Ki|Mi|Gi|Ti|k|K|M|G|T)?$/.exec(quantity.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const suffix = match[2];
  if (!suffix) return value;
  return value * (BINARY[suffix] ?? DECIMAL[suffix]);
}

export function formatCpu(millis: number): string {
  if (millis >= 1000) {
    const cores = millis / 1000;
    return Number.isInteger(cores) ? String(cores) : cores.toFixed(1);
  }
  if (millis === 0) return "0m";
  // Idle pods sit well below 1m — fractions keep chart scales meaningful.
  if (millis < 1) return `${Number(millis.toPrecision(2))}m`;
  return `${Math.round(millis)}m`;
}

export function formatMemory(bytes: number): string {
  if (bytes >= BINARY.Gi) {
    const gi = bytes / BINARY.Gi;
    return `${Number.isInteger(gi) ? gi : gi.toFixed(1)}Gi`;
  }
  if (bytes >= BINARY.Mi) return `${Math.round(bytes / BINARY.Mi)}Mi`;
  if (bytes >= BINARY.Ki) return `${Math.round(bytes / BINARY.Ki)}Ki`;
  return `${Math.round(bytes)}B`;
}
