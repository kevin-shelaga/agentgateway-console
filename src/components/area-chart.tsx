"use client";

import { useId } from "react";
import type { MetricSample } from "@/lib/metrics-history";

export interface ReferenceLine {
  value: number;
  label: string;
}

/**
 * Dependency-free SVG area chart for session usage trends, with a labeled
 * value axis, time axis, and optional dashed reference lines (requests/
 * limits). The scale grows to fit both the data and the reference lines.
 */
export function AreaChart({
  samples,
  metric,
  format,
  referenceLines = [],
  className,
  height = 160,
}: {
  samples: MetricSample[];
  metric: "cpu" | "mem";
  format: (value: number) => string;
  referenceLines?: ReferenceLine[];
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
  const pad = { top: 14, right: 8, bottom: 20, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  // Headroom above the data; reference lines must always fit on the scale.
  const max = Math.max(...values.map((v) => v * 1.15), ...referenceLines.map((r) => r.value * 1.05), 1e-9);
  const minValue = Math.min(...values);
  const current = values[values.length - 1];

  const x = (i: number) => pad.left + (i / (values.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${(pad.left + innerW).toFixed(1)},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`;

  const timeOf = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const ticks = [0.25, 0.5, 0.75, 1];

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-mono text-base font-semibold tabular-nums">{format(current)}</span>
        <span className="text-muted-foreground">
          min {format(minValue)} · max {format(Math.max(...values))}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${metric} usage trend`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Value axis: labeled gridlines */}
        {ticks.map((f) => (
          <g key={f}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="currentColor"
              strokeOpacity="0.08"
            />
            <text
              x={pad.left - 6}
              y={y(max * f) + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono"
              fontSize="9"
            >
              {format(max * f)}
            </text>
          </g>
        ))}

        {/* Reference lines: requests/limits */}
        {referenceLines.map((ref) => (
          <g key={ref.label}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y(ref.value)}
              y2={y(ref.value)}
              stroke="currentColor"
              strokeOpacity="0.45"
              strokeDasharray="5 4"
            />
            <text
              x={pad.left + innerW - 2}
              y={y(ref.value) - 3}
              textAnchor="end"
              className="fill-current"
              fontSize="9"
              opacity="0.8"
            >
              {ref.label} {format(ref.value)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={x(values.length - 1)} cy={y(current)} r="3" fill="currentColor" />

        {/* Time axis */}
        <text x={pad.left} y={height - 4} className="fill-muted-foreground font-mono" fontSize="9">
          {timeOf(samples[0].t)}
        </text>
        <text
          x={pad.left + innerW}
          y={height - 4}
          textAnchor="end"
          className="fill-muted-foreground font-mono"
          fontSize="9"
        >
          {timeOf(samples[samples.length - 1].t)}
        </text>
      </svg>
    </div>
  );
}
