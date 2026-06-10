"use client";

/** Tiny inline trend graph fed by client-accumulated metric samples. */
export function Sparkline({
  samples,
  width = 72,
  height = 20,
  className,
}: {
  samples: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (samples.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const max = Math.max(...samples, 1e-9);
  const pad = 2;
  const points = samples
    .map((value, i) => {
      const x = (i / (samples.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - (value / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = samples[samples.length - 1];
  const lastY = height - pad - (last / max) * (height - pad * 2);

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={width - pad} cy={lastY} r={2} fill="currentColor" />
    </svg>
  );
}
