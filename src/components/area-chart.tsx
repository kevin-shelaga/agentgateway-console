"use client";

import { useId } from "react";
import type { MetricSample } from "@/lib/metrics-history";

/**
 * Dependency-free SVG area chart for session usage trends. `metric` picks
 * the series from the shared samples; values are auto-scaled to the max.
 */
export function AreaChart({
  samples,
  metric,
  format,
  className,
  height = 160,
}: {
  samples: MetricSample[];
  metric: "cpu" | "mem";
  format: (value: number) => string;
  className?: string;
  height?: number;
}) {
  const gradientId = useId();
  const values = samples.map((s) => s[metric]);

  if (values.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground"
        style={{ height }}
      >
        Collecting samples — trends build while the console is open…
      </div>
    );
  }

  const width = 600;
  const pad = { top: 14, right: 8, bottom: 18, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...values, 1e-9);
  const min = Math.min(...values);
  const current = values[values.length - 1];

  const x = (i: number) => pad.left + (i / (values.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${(pad.left + innerW).toFixed(1)},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`;

  const spanMs = samples[samples.length - 1].t - samples[0].t;
  const spanLabel =
    spanMs >= 60_000 ? `last ${Math.round(spanMs / 60_000)}m` : `last ${Math.round(spanMs / 1000)}s`;

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-mono text-base font-semibold tabular-nums">{format(current)}</span>
        <span className="text-muted-foreground">
          min {format(min)} · max {format(max)} · {spanLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${metric} usage trend`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={pad.left + innerW}
            y1={pad.top + innerH * f}
            y2={pad.top + innerH * f}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={x(values.length - 1)} cy={y(current)} r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
