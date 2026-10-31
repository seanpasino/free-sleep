/* eslint-disable react/no-multi-comp */
import { useMemo } from 'react';
import moment from 'moment-timezone';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { BedEvent } from '@api/nights.ts';
import { useResizeDetector } from 'react-resize-detector';
import { BedTemperatureRecord } from '@api/bedTemperatures.ts';
import { PlanPoint, SERIES, SeriesKey, Side } from '@lib/bedTemperature.ts';
import { COLORS } from '../theme.ts';

type Margin = { left: number; right: number; top: number; bottom: number };

// In-bed periods as a thin strip under the chart, on the chart's own time scale
const PresenceStrip = ({ rows, side, width, margin, domain }: {
  rows: BedTemperatureRecord[]; side: Side; width: number; margin: Margin; domain: [number, number];
}) => {
  if (rows.length < 2) return null;
  const [t0, t1] = domain;
  const plot = Math.max(1, width - margin.left - margin.right);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * plot;
  const segments: { from: number; to: number }[] = [];
  for (const row of rows) {
    if (!row[`${side}_present`]) continue;
    const last = segments[segments.length - 1];
    if (last && row.timestamp - last.to <= 2 * 60_000) last.to = row.timestamp;
    else segments.push({ from: row.timestamp, to: row.timestamp + 60_000 });
  }
  return (
    <Box sx={ { display: 'flex', alignItems: 'center', mt: 0.5 } }>
      <Typography
        sx={ { width: margin.left, fontSize: '0.625rem', color: COLORS.textTertiary, pr: 0.75, textAlign: 'right', whiteSpace: 'nowrap' } }
      >
        In bed
      </Typography>
      <Box sx={ { position: 'relative', width: plot, height: 4, borderRadius: 2, bgcolor: COLORS.raised, overflow: 'hidden' } }>
        { segments.map((s) => (
          <Box
            key={ s.from }
            sx={ {
              position: 'absolute', top: 0, bottom: 0, borderRadius: 2, bgcolor: COLORS.ok, opacity: 0.85,
              left: x(s.from), width: Math.max(2, x(s.to) - x(s.from)),
            } }
          />
        )) }
      </Box>
    </Box>
  );
};

type BedTemperaturePlotProps = {
  rows: BedTemperatureRecord[];
  side: Side;
  visible: SeriesKey[];
  height: number;
  // Smaller margins and fewer ticks, for the Temperature page
  compact?: boolean;
  // The night's schedule, drawn as a faint step line (and on past the data, up to extendTo)
  plan?: PlanPoint[] | null;
  extendTo?: number;
  // Button presses and app/HA changes, marked on the chart
  events?: BedEvent[];
};

const PLAN_COLOR = COLORS.textTertiary;

const eventLabel = (e: BedEvent) => {
  if (e.toF === undefined) return '';
  if (e.fromF === undefined) return `${e.toF}°`;
  return `${e.toF > e.fromF ? '▲' : '▼'}${e.toF}°`;
};

export default function BedTemperaturePlot({
  rows, side, visible, height, compact = false, plan, extendTo, events,
}: BedTemperaturePlotProps) {
  const { width = 320, ref } = useResizeDetector();
  const other: Side = side === 'left' ? 'right' : 'left';
  const margin: Margin = compact ? { left: 34, right: 8, top: 8, bottom: 24 } : { left: 44, right: 16, top: 12, bottom: 28 };

  const dataset = useMemo(() => {
    const planAt = (t: number) => {
      let f: number | null = null;
      for (const p of plan ?? []) {
        if (p.time > t) break;
        f = p.f;
      }
      return f;
    };
    const points = rows.map((r) => {
      const point: Record<string, number | Date | null> = { time: new Date(r.timestamp), plan: plan ? planAt(r.timestamp) : null };
      for (const s of SERIES) point[s.key] = s.value(r, side, other);
      return point;
    });
    // The rest of the night's plan, after the latest reading
    const last = rows.length ? rows[rows.length - 1].timestamp : 0;
    if (plan && extendTo && extendTo > last) {
      for (const p of plan) if (p.time > last && p.time <= extendTo) points.push({ time: new Date(p.time), plan: p.f });
      points.push({ time: new Date(extendTo), plan: planAt(extendTo) });
    }
    return points;
  }, [rows, side, other, plan, extendTo]);

  const shown = SERIES.filter((s) => visible.includes(s.key));
  const showPlan = !!plan && plan.length > 0;
  const yValues = dataset.flatMap((p) => [...shown.map((s) => p[s.key]), showPlan ? p.plan : null])
    .filter((v): v is number => typeof v === 'number');
  const yMin = yValues.length ? Math.floor(Math.min(...yValues) - 1) : 60;
  const yMax = yValues.length ? Math.ceil(Math.max(...yValues) + 1) : 90;
  const otherLabel = `${other === 'left' ? 'Left' : 'Right'} side`;
  // Pin the time axis to the data (no padding past now) and label minutes while the span is short
  const t0 = rows.length ? new Date(rows[0].timestamp) : undefined;
  const lastRow = rows.length ? rows[rows.length - 1].timestamp : undefined;
  const t1 = lastRow === undefined ? undefined : new Date(Math.max(lastRow, plan && extendTo ? extendTo : lastRow));
  const spanHours = t0 && t1 ? (t1.getTime() - t0.getTime()) / 3_600_000 : 0;
  const tickFormat = spanHours < 3 ? 'h:mm' : 'h A';

  return (
    <Box ref={ ref }>
      <LineChart
        height={ height }
        margin={ margin }
        dataset={ dataset }
        grid={ { horizontal: true } }
        skipAnimation
        xAxis={ [{
          dataKey: 'time',
          scaleType: 'time',
          min: t0,
          max: t1,
          tickNumber: Math.max(2, Math.min(Math.floor(width / (compact ? 110 : 90)), Math.ceil(spanHours * 4))),
          disableLine: compact,
          disableTicks: compact,
          valueFormatter: (d: Date, ctx) => moment(d).format(ctx.location === 'tooltip' ? 'h:mm A' : tickFormat),
        }] }
        yAxis={ [{
          min: yMin,
          max: yMax,
          tickNumber: compact ? 4 : 6,
          disableLine: compact,
          disableTicks: compact,
          valueFormatter: (v: number) => `${v}°`,
        }] }
        series={ [...shown.map((s) => ({
          id: s.key,
          dataKey: s.key,
          label: s.key === 'otherBed' ? otherLabel : s.label,
          color: s.color,
          showMark: false,
          curve: s.key === 'setpoint' ? 'stepAfter' as const : 'linear' as const,
          area: s.key === 'bed',
          connectNulls: false,
          valueFormatter: (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}°F`),
        })), ...(showPlan ? [{
          id: 'plan',
          dataKey: 'plan',
          label: 'Schedule',
          color: PLAN_COLOR,
          showMark: false,
          curve: 'stepAfter' as const,
          connectNulls: true,
          valueFormatter: (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}°F`),
        }] : [])] }
        slotProps={ { legend: { hidden: true } } }
        sx={ {
          '& .MuiLineElement-root': { strokeWidth: 1.5 },
          '& .MuiLineElement-series-bed': { strokeWidth: 2.5 },
          '& .MuiLineElement-series-setpoint': { strokeDasharray: '6 4', strokeWidth: 1.5, opacity: 0.75 },
          '& .MuiLineElement-series-room': { opacity: 0.75 },
          '& .MuiLineElement-series-plan': { strokeDasharray: '2 4', strokeWidth: 1.5, opacity: 0.7 },
          '& .MuiChartsReferenceLine-line': { strokeDasharray: '2 3', opacity: 0.6 },
          '& .MuiAreaElement-series-bed': { fillOpacity: compact ? 0.1 : 0.08 },
          '& .MuiChartsGrid-line': { stroke: COLORS.divider },
          '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: COLORS.border },
          '& .MuiChartsAxis-tickLabel': { fill: COLORS.textTertiary },
        } }
      >
        { (events ?? [])
          .filter((e) => (e.kind === 'button' || e.kind === 'manual') && t0 && t1 && e.time >= t0.getTime() && e.time <= t1.getTime())
          .map((e) => (
            <ChartsReferenceLine
              key={ e.time }
              x={ new Date(e.time) }
              label={ eventLabel(e) }
              labelAlign="start"
              lineStyle={ { stroke: COLORS.warm } }
              labelStyle={ { fontSize: 10, fill: COLORS.textSecondary } }
            />
          )) }
      </LineChart>
      { t0 && t1 && <PresenceStrip rows={ rows } side={ side } width={ width } margin={ margin } domain={ [t0.getTime(), t1.getTime()] }/> }
    </Box>
  );
}
