import { useState, type ReactNode } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';

/**
 * Hand-rolled SVG charts. Shared rules, applied everywhere below:
 *
 *  - One series per chart, drawn in a single accent hue. Category identity
 *    lives in the axis labels, so hue is never asked to carry it — and a
 *    value-ramp is never used on nominal categories.
 *  - Bars are capped at 24px, with a 4px rounded data-end and a square base.
 *  - Gridlines and axes are solid hairlines, one step off the surface.
 *  - Labels wear text colours, never the mark colour.
 *  - Every chart ships a table view, so no value is reachable only by hover.
 */

const MARK_MAX = 24; // px, bar/column thickness cap
const RADIUS = 4; // px, rounded data-end
const BAND_GAP = 2; // px, surface gap between adjacent marks

export interface ChartDatum {
  label: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Horizontal bar: square at the x=0 baseline, rounded at the tip. */
function hBarPath(x0: number, y: number, length: number, thickness: number): string {
  const r = Math.min(RADIUS, length, thickness / 2);
  const x1 = x0 + Math.max(length, 0);
  if (length <= r) return `M${x0},${y} H${x1} V${y + thickness} H${x0} Z`;
  return [
    `M${x0},${y}`,
    `H${x1 - r}`,
    `A${r},${r} 0 0 1 ${x1},${y + r}`,
    `V${y + thickness - r}`,
    `A${r},${r} 0 0 1 ${x1 - r},${y + thickness}`,
    `H${x0}`,
    'Z',
  ].join(' ');
}

/** Vertical column: square at the baseline, rounded at the cap. */
function columnPath(x: number, yTop: number, width: number, baseline: number): string {
  const height = baseline - yTop;
  const r = Math.min(RADIUS, height, width / 2);
  if (height <= r) return `M${x},${baseline} V${yTop} H${x + width} V${baseline} Z`;
  return [
    `M${x},${baseline}`,
    `V${yTop + r}`,
    `A${r},${r} 0 0 1 ${x + r},${yTop}`,
    `H${x + width - r}`,
    `A${r},${r} 0 0 1 ${x + width},${yTop + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}

/** Axis ticks rounded to readable numbers. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const numberFmt = new Intl.NumberFormat();

// ---------------------------------------------------------------------------
// Chart card — title, chart, and the table-view twin
// ---------------------------------------------------------------------------

export function ChartCard({
  title,
  description,
  columns,
  rows,
  emptyMessage,
  refreshing = false,
  footer,
  children,
}: {
  title: string;
  description?: string;
  columns: [string, string];
  rows: ChartDatum[];
  emptyMessage: string;
  refreshing?: boolean;
  footer?: ReactNode;
  children: (width: number) => ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const hasData = rows.some((r) => r.value > 0);

  return (
    <section className="card">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {hasData ? (
          <button
            type="button"
            className="btn-ghost shrink-0 text-xs"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
          >
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        ) : null}
      </header>

      <div className="p-5">
        {!hasData ? (
          <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">{columns[0]}</th>
                  <th className="py-2 text-right font-medium">{columns[1]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 pr-4 text-slate-700">{row.label}</td>
                    <td className="py-2 text-right tabular-nums text-slate-900">
                      {numberFmt.format(row.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div ref={ref} className={refreshing ? 'is-refreshing' : undefined}>
            {width > 0 ? children(width) : <div style={{ height: 200 }} />}
          </div>
        )}
        {footer && !showTable ? <div className="mt-4">{footer}</div> : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart — nominal categories, value at the tip
// ---------------------------------------------------------------------------

export function HorizontalBarChart({
  data,
  width,
  labelWidth,
  unit = 'leads',
}: {
  data: ChartDatum[];
  width: number;
  labelWidth?: number;
  unit?: string;
}) {
  const rowHeight = 30;
  const labelCol = labelWidth ?? Math.min(240, Math.max(110, Math.round(width * 0.4)));
  const valueCol = 44;
  const plotWidth = Math.max(20, width - labelCol - valueCol - 8);
  const max = Math.max(...data.map((d) => d.value), 1);
  const height = data.length * rowHeight;
  const thickness = Math.min(MARK_MAX, rowHeight - 12);

  return (
    <svg width={width} height={height} role="img" aria-label={`Bar chart, ${unit} by category`}>
      {data.map((d, i) => {
        const y = i * rowHeight;
        const barY = y + (rowHeight - thickness) / 2;
        const length = (d.value / max) * plotWidth;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${numberFmt.format(d.value)} ${unit}`}</title>
            <rect x={0} y={y} width={width} height={rowHeight} fill="transparent" />
            <text
              x={0}
              y={y + rowHeight / 2}
              dominantBaseline="middle"
              className="fill-slate-600 text-[12px]"
            >
              {truncateLabel(d.label, labelCol)}
            </text>
            <path
              d={hBarPath(labelCol, barY, length, thickness)}
              className="fill-brand-500 transition-colors hover:fill-brand-700"
            />
            <text
              x={labelCol + length + 8}
              y={y + rowHeight / 2}
              dominantBaseline="middle"
              className="fill-slate-700 text-[12px] tabular-nums"
            >
              {numberFmt.format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Rough character budget for the label gutter — never clip mid-glyph. */
function truncateLabel(label: string, pxWidth: number): string {
  const maxChars = Math.max(6, Math.floor((pxWidth - 10) / 6.4));
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

// ---------------------------------------------------------------------------
// Column chart / histogram — ordered bins, y ticks, extreme labelled
// ---------------------------------------------------------------------------

export function ColumnChart({
  data,
  width,
  height = 240,
  unit = 'leads',
}: {
  data: ChartDatum[];
  width: number;
  height?: number;
  unit?: string;
}) {
  const padLeft = 34;
  const padRight = 8;
  const padTop = 16;
  const axisBand = 26; // reserved for x labels, inside the height
  const plotHeight = height - padTop - axisBand;
  const plotWidth = Math.max(10, width - padLeft - padRight);
  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = niceTicks(max);
  const scaleMax = ticks[ticks.length - 1] || 1;
  const band = plotWidth / data.length;
  const barWidth = Math.min(MARK_MAX, Math.max(4, band - BAND_GAP * 2));
  const baseline = padTop + plotHeight;
  const peak = Math.max(...data.map((d) => d.value));

  return (
    <svg width={width} height={height} role="img" aria-label={`Histogram of ${unit}`}>
      {ticks.map((tick) => {
        const y = baseline - (tick / scaleMax) * plotHeight;
        return (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="stroke-slate-200" strokeWidth={1} />
            <text
              x={padLeft - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-500 text-[11px] tabular-nums"
            >
              {numberFmt.format(tick)}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const x = padLeft + i * band + (band - barWidth) / 2;
        const y = baseline - (d.value / scaleMax) * plotHeight;
        const isPeak = d.value === peak && peak > 0;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${numberFmt.format(d.value)} ${unit}`}</title>
            <rect x={padLeft + i * band} y={padTop} width={band} height={plotHeight} fill="transparent" />
            {d.value > 0 ? (
              <path
                d={columnPath(x, y, barWidth, baseline)}
                className="fill-brand-500 transition-colors hover:fill-brand-700"
              />
            ) : null}
            {isPeak ? (
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-slate-700 text-[11px] font-medium tabular-nums"
              >
                {numberFmt.format(d.value)}
              </text>
            ) : null}
            <text
              x={padLeft + i * band + band / 2}
              y={baseline + 16}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] tabular-nums"
            >
              {d.label}
            </text>
          </g>
        );
      })}

      <line
        x1={padLeft}
        x2={width - padRight}
        y1={baseline}
        y2={baseline}
        className="stroke-slate-300"
        strokeWidth={1}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Funnel — pipeline stages in fixed order, drawn as centred bars
// ---------------------------------------------------------------------------

export function FunnelChart({ data, width }: { data: ChartDatum[]; width: number }) {
  const rowHeight = 34;
  const height = data.length * rowHeight;
  const max = Math.max(...data.map((d) => d.value), 1);
  const thickness = Math.min(MARK_MAX, rowHeight - 12);
  const labelCol = Math.min(190, Math.max(100, Math.round(width * 0.34)));
  const plotWidth = Math.max(20, width - labelCol - 56);

  return (
    <svg width={width} height={height} role="img" aria-label="Pipeline funnel by stage">
      {data.map((d, i) => {
        const y = i * rowHeight;
        const barY = y + (rowHeight - thickness) / 2;
        const length = (d.value / max) * plotWidth;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${numberFmt.format(d.value)} leads`}</title>
            <text x={0} y={barY + thickness / 2} dominantBaseline="middle" className="fill-slate-700 text-[12px]">
              {truncateLabel(d.label, labelCol)}
            </text>
            <path
              d={hBarPath(labelCol, barY, length, thickness)}
              className="fill-brand-500 transition-colors hover:fill-brand-700"
            />
            <text
              x={labelCol + length + 8}
              y={barY + thickness / 2}
              dominantBaseline="middle"
              className="fill-slate-700 text-[12px] tabular-nums"
            >
              {numberFmt.format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Line chart — one series over time, end point labelled
// ---------------------------------------------------------------------------

export function LineChart({
  data,
  width,
  height = 240,
  formatX,
}: {
  data: ChartDatum[];
  width: number;
  height?: number;
  formatX: (label: string) => string;
}) {
  const padLeft = 34;
  const padRight = 40;
  const padTop = 16;
  const axisBand = 26;
  const plotHeight = height - padTop - axisBand;
  const plotWidth = Math.max(10, width - padLeft - padRight);
  const baseline = padTop + plotHeight;

  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = niceTicks(max);
  const scaleMax = ticks[ticks.length - 1] || 1;

  const x = (i: number) => padLeft + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);
  const y = (v: number) => baseline - (v / scaleMax) * plotHeight;

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`);
  const areaPath = `M${padLeft},${baseline} L${points.join(' L')} L${x(data.length - 1)},${baseline} Z`;

  // Show at most 6 x labels so dates never collide.
  const labelStep = Math.max(1, Math.ceil(data.length / 6));
  const last = data[data.length - 1];

  return (
    <svg width={width} height={height} role="img" aria-label="Leads created per day">
      {ticks.map((tick) => {
        const ty = y(tick);
        return (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={ty} y2={ty} className="stroke-slate-200" strokeWidth={1} />
            <text
              x={padLeft - 8}
              y={ty}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-500 text-[11px] tabular-nums"
            >
              {numberFmt.format(tick)}
            </text>
          </g>
        );
      })}

      <path d={areaPath} className="fill-brand-500" fillOpacity={0.1} />
      <polyline
        points={points.join(' ')}
        fill="none"
        className="stroke-brand-500"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {data.map((d, i) => (
        <g key={d.label}>
          <title>{`${formatX(d.label)}: ${numberFmt.format(d.value)} leads`}</title>
          {/* Generous hit area — the visible dot is far smaller than a comfortable target. */}
          <circle cx={x(i)} cy={y(d.value)} r={12} fill="transparent" />
        </g>
      ))}

      {last ? (
        <>
          <circle cx={x(data.length - 1)} cy={y(last.value)} r={4} className="fill-brand-500 stroke-white" strokeWidth={2} />
          <text
            x={Math.min(width - 4, x(data.length - 1) + 10)}
            y={y(last.value)}
            dominantBaseline="middle"
            className="fill-slate-700 text-[11px] font-medium tabular-nums"
          >
            {numberFmt.format(last.value)}
          </text>
        </>
      ) : null}

      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        // Drop a stepped label that would collide with the always-drawn last one.
        const tooCloseToLast = !isLast && x(data.length - 1) - x(i) < 48;
        return (i % labelStep === 0 && !tooCloseToLast) || isLast ? (
          <text
            key={`x-${d.label}`}
            x={x(i)}
            y={baseline + 16}
            textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
            className="fill-slate-500 text-[10px]"
          >
            {formatX(d.label)}
          </text>
        ) : null;
      })}

      <line x1={padLeft} x2={width - padRight} y1={baseline} y2={baseline} className="stroke-slate-300" strokeWidth={1} />
    </svg>
  );
}
