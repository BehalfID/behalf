"use client";

/**
 * Chart primitives for the console analytics dashboard.
 *
 * The repo has no charting dependency, so these are hand-rolled SVG. Three
 * rules they all follow:
 *   - Series are distinguished by texture as well as colour, so the graphs stay
 *     readable without colour perception.
 *   - Every value is reachable as text: hover/focus titles carry exact numbers,
 *     and each chart ships a real data table behind a disclosure.
 *   - Zero buckets are drawn as a baseline tick rather than nothing, so gaps in
 *     time are visible instead of being silently compressed.
 */

import { useId, useMemo, useState } from "react";
import type { BucketGranularity } from "@/lib/adminAnalytics/types";

export type SeriesTone = "allow" | "deny" | "approval" | "shadow" | "neutral" | "brand" | "info";

export type ChartSeries = {
  key: string;
  label: string;
  tone: SeriesTone;
};

export type ChartPoint = {
  bucketStart: string;
  values: Record<string, number>;
};

const TONE_TEXTURE: Record<SeriesTone, "solid" | "hatch" | "dots" | "back-hatch" | "grid"> = {
  allow: "solid",
  deny: "hatch",
  approval: "dots",
  shadow: "back-hatch",
  neutral: "grid",
  brand: "solid",
  info: "hatch"
};

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const numberFormat = new Intl.NumberFormat("en");

export function formatCount(value: number) {
  return numberFormat.format(value);
}

/** Renders a fraction as a percentage, or an em dash when it is undefined. */
export function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(value >= 0.1 || value === 0 ? 1 : 2)}%`;
}

const hourLabel = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hourCycle: "h23"
});
const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const fullLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hourCycle: "h23"
});

export function formatBucketLabel(iso: string, granularity: BucketGranularity) {
  const date = new Date(iso);
  return granularity === "hour" ? hourLabel.format(date) : dayLabel.format(date);
}

/** Unambiguous label used in tooltips and data tables; always states UTC. */
export function formatBucketExact(iso: string, granularity: BucketGranularity) {
  const date = new Date(iso);
  return granularity === "hour"
    ? `${fullLabel.format(date)} UTC`
    : `${dayLabel.format(date)} UTC`;
}

export function formatTimestamp(iso: string | null) {
  if (!iso) return "—";
  return `${fullLabel.format(new Date(iso))} UTC`;
}

/* ------------------------------------------------------------------ *
 * Shared frame
 * ------------------------------------------------------------------ */

export function ChartCard({
  title,
  description,
  action,
  children,
  footnote
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  footnote?: string;
}) {
  const headingId = useId();
  return (
    <figure className="analytics-card" role="group" aria-labelledby={headingId}>
      <div className="analytics-card__head">
        <div>
          <h3 className="analytics-card__title" id={headingId}>{title}</h3>
          {description ? <p className="analytics-card__desc">{description}</p> : null}
        </div>
        {action ? <div className="analytics-card__action">{action}</div> : null}
      </div>
      {children}
      {footnote ? <figcaption className="analytics-card__footnote">{footnote}</figcaption> : null}
    </figure>
  );
}

function Textures({ idPrefix, series }: { idPrefix: string; series: ChartSeries[] }) {
  return (
    <defs>
      {series.map((entry) => {
        const texture = TONE_TEXTURE[entry.tone];
        return (
          <pattern
            key={entry.key}
            id={`${idPrefix}-${entry.key}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" className={`analytics-fill analytics-fill--${entry.tone}`} />
            {texture === "hatch" ? (
              <path d="M0 6 L6 0" className="analytics-texture" />
            ) : null}
            {texture === "back-hatch" ? (
              <path d="M0 0 L6 6" className="analytics-texture" />
            ) : null}
            {texture === "dots" ? <circle cx="3" cy="3" r="1.2" className="analytics-texture-solid" /> : null}
            {texture === "grid" ? (
              <path d="M0 3 H6 M3 0 V6" className="analytics-texture" />
            ) : null}
          </pattern>
        );
      })}
    </defs>
  );
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="analytics-legend">
      {series.map((entry) => (
        <li key={entry.key}>
          <span
            aria-hidden="true"
            className={`analytics-legend__swatch analytics-legend__swatch--${entry.tone} analytics-legend__swatch--${TONE_TEXTURE[entry.tone]}`}
          />
          <span>{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  caption,
  columns,
  rows
}: {
  caption: string;
  columns: string[];
  rows: Array<{ label: string; values: Array<string | number> }>;
}) {
  return (
    <details className="analytics-data-table">
      <summary>View data table</summary>
      <div className="analytics-data-table__scroll">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Bucket (UTC)</th>
              {columns.map((column) => (
                <th key={column} scope="col">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${columns[index]}`}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Time series
 * ------------------------------------------------------------------ */

const PLOT_HEIGHT = 140;
const LABEL_HEIGHT = 26;
const MIN_BAR_WIDTH = 10;
const BAR_GAP = 4;

/**
 * Stacked (or overlaid line) time series.
 * `series` is whatever the caller wants visible — the range selector and series
 * toggles live in the page so several charts can share one window.
 */
export function TimeSeriesChart({
  points,
  series,
  granularity,
  variant = "bars",
  valueLabel = "events"
}: {
  points: ChartPoint[];
  series: ChartSeries[];
  granularity: BucketGranularity;
  variant?: "bars" | "line";
  valueLabel?: string;
}) {
  const idPrefix = useId().replace(/[^a-zA-Z0-9-]/g, "");

  const { max, totals } = useMemo(() => {
    const totalsByPoint = points.map((point) =>
      series.reduce((sum, entry) => sum + (point.values[entry.key] ?? 0), 0)
    );
    const peak = variant === "line"
      ? Math.max(
          1,
          ...points.flatMap((point) => series.map((entry) => point.values[entry.key] ?? 0))
        )
      : Math.max(1, ...totalsByPoint);
    return { max: peak, totals: totalsByPoint };
  }, [points, series, variant]);

  if (!points.length || !series.length) {
    return <ChartEmpty message={series.length ? "No buckets in this range." : "Select at least one series."} />;
  }

  const barWidth = Math.max(MIN_BAR_WIDTH, Math.min(30, 640 / points.length - BAR_GAP));
  const step = barWidth + BAR_GAP;
  const plotWidth = points.length * step - BAR_GAP;
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const grandTotal = totals.reduce((sum, value) => sum + value, 0);

  const summary = `${series.map((entry) => entry.label).join(", ")} by ${granularity}, ${formatCount(grandTotal)} ${valueLabel} total, peak ${formatCount(max)}.`;

  return (
    <>
      <div className="analytics-plot">
        <svg
          className="analytics-plot__svg"
          role="img"
          aria-label={summary}
          viewBox={`0 0 ${plotWidth} ${PLOT_HEIGHT + LABEL_HEIGHT}`}
          preserveAspectRatio="xMinYMid meet"
          width="100%"
        >
          <Textures idPrefix={idPrefix} series={series} />
          <line
            x1="0"
            y1={PLOT_HEIGHT}
            x2={plotWidth}
            y2={PLOT_HEIGHT}
            className="analytics-plot__axis"
          />
          {variant === "bars"
            ? points.map((point, index) => {
                const x = index * step;
                let stackTop = PLOT_HEIGHT;
                const tooltip = `${formatBucketExact(point.bucketStart, granularity)}: ${series
                  .map((entry) => `${entry.label} ${formatCount(point.values[entry.key] ?? 0)}`)
                  .join(", ")}`;
                return (
                  <g key={point.bucketStart} tabIndex={0} className="analytics-plot__group">
                    <title>{tooltip}</title>
                    {series.map((entry) => {
                      const value = point.values[entry.key] ?? 0;
                      if (value <= 0) return null;
                      const height = Math.max(1, Math.round((value / max) * PLOT_HEIGHT));
                      stackTop -= height;
                      return (
                        <rect
                          key={entry.key}
                          x={x}
                          y={stackTop}
                          width={barWidth}
                          height={height}
                          fill={`url(#${idPrefix}-${entry.key})`}
                          className={`analytics-bar analytics-bar--${entry.tone}`}
                        />
                      );
                    })}
                    {totals[index] === 0 ? (
                      <rect
                        x={x}
                        y={PLOT_HEIGHT - 2}
                        width={barWidth}
                        height={2}
                        className="analytics-bar--zero"
                      />
                    ) : null}
                  </g>
                );
              })
            : series.map((entry) => (
                <polyline
                  key={entry.key}
                  className={`analytics-line analytics-line--${entry.tone}`}
                  points={points
                    .map((point, index) => {
                      const value = point.values[entry.key] ?? 0;
                      const x = index * step + barWidth / 2;
                      const y = PLOT_HEIGHT - (value / max) * PLOT_HEIGHT;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              ))}
          {variant === "line"
            ? points.map((point, index) => (
                <g key={point.bucketStart} tabIndex={0} className="analytics-plot__group">
                  <title>
                    {`${formatBucketExact(point.bucketStart, granularity)}: ${series
                      .map((entry) => `${entry.label} ${formatCount(point.values[entry.key] ?? 0)}`)
                      .join(", ")}`}
                  </title>
                  {series.map((entry) => {
                    const value = point.values[entry.key] ?? 0;
                    return (
                      <circle
                        key={entry.key}
                        cx={index * step + barWidth / 2}
                        cy={PLOT_HEIGHT - (value / max) * PLOT_HEIGHT}
                        r={2.5}
                        className={`analytics-dot analytics-dot--${entry.tone}`}
                      />
                    );
                  })}
                </g>
              ))
            : null}
          {points.map((point, index) =>
            index % labelEvery === 0 ? (
              <text
                key={`label-${point.bucketStart}`}
                x={index * step + barWidth / 2}
                y={PLOT_HEIGHT + LABEL_HEIGHT - 8}
                textAnchor="middle"
                className="analytics-plot__label"
              >
                {formatBucketLabel(point.bucketStart, granularity)}
              </text>
            ) : null
          )}
        </svg>
      </div>
      <ChartLegend series={series} />
      <DataTable
        caption={summary}
        columns={series.map((entry) => entry.label)}
        rows={points.map((point) => ({
          label: formatBucketExact(point.bucketStart, granularity),
          values: series.map((entry) => formatCount(point.values[entry.key] ?? 0))
        }))}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Outcome breakdown
 * ------------------------------------------------------------------ */

/**
 * Horizontal outcome bars. Each row states its label, count and share as text,
 * so the graphic is a redundant encoding rather than the only encoding.
 */
export function OutcomeBars({
  rows,
  denominatorLabel
}: {
  rows: Array<{ label: string; tone: SeriesTone; count: number; rate: number | null }>;
  denominatorLabel: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return <ChartEmpty message={`No ${denominatorLabel} in this range.`} />;
  }

  return (
    <ul className="analytics-outcomes">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="analytics-outcomes__head">
            <span className="analytics-outcomes__label">
              <span
                aria-hidden="true"
                className={`analytics-legend__swatch analytics-legend__swatch--${row.tone} analytics-legend__swatch--${TONE_TEXTURE[row.tone]}`}
              />
              {row.label}
            </span>
            <span className="analytics-outcomes__value">
              {formatCount(row.count)}
              <span className="analytics-outcomes__rate">{formatRate(row.rate)}</span>
            </span>
          </div>
          <div
            className="analytics-outcomes__track"
            role="meter"
            aria-valuenow={row.count}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={`${row.label}: ${formatCount(row.count)} of ${formatCount(total)} ${denominatorLabel} (${formatRate(row.rate)})`}
          >
            <span
              className={`analytics-outcomes__bar analytics-outcomes__bar--${row.tone}`}
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * Rankings
 * ------------------------------------------------------------------ */

export function RankingTable<Row>({
  caption,
  rows,
  columns,
  emptyMessage
}: {
  caption: string;
  rows: Row[];
  columns: Array<{
    header: string;
    numeric?: boolean;
    render: (row: Row) => React.ReactNode;
  }>;
  emptyMessage: string;
}) {
  if (!rows.length) {
    return <ChartEmpty message={emptyMessage} />;
  }
  return (
    <div className="analytics-table__scroll">
      <table className="analytics-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} scope="col" className={column.numeric ? "is-numeric" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column, columnIndex) => (
                <td
                  key={column.header}
                  className={column.numeric ? "is-numeric" : undefined}
                  {...(columnIndex === 0 ? { scope: "row" } : {})}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * States and controls
 * ------------------------------------------------------------------ */

export function ChartEmpty({ message }: { message: string }) {
  return <p className="analytics-empty">{message}</p>;
}

export function ChartSkeleton({ label }: { label: string }) {
  return (
    <div className="analytics-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="analytics-skeleton__bars" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, index) => (
          <span key={index} style={{ height: `${25 + ((index * 37) % 60)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SeriesToggle({
  options,
  selected,
  onChange,
  legend
}: {
  options: ChartSeries[];
  selected: string[];
  onChange: (keys: string[]) => void;
  legend: string;
}) {
  return (
    <fieldset className="analytics-series-toggle">
      <legend>{legend}</legend>
      {options.map((option) => {
        const checked = selected.includes(option.key);
        return (
          <label key={option.key}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((key) => key !== option.key)
                    : [...selected, option.key]
                )
              }
            />
            <span
              aria-hidden="true"
              className={`analytics-legend__swatch analytics-legend__swatch--${option.tone} analytics-legend__swatch--${TONE_TEXTURE[option.tone]}`}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * Series selection for a chart. `visible` preserves the declaration order of
 * `all`, so toggling series never reshuffles the stacking order.
 */
export function useSeriesSelection(all: ChartSeries[], initial: string[]) {
  const [selected, setSelected] = useState<string[]>(initial);
  const visible = useMemo(() => all.filter((entry) => selected.includes(entry.key)), [all, selected]);
  return { selected, setSelected, visible };
}
