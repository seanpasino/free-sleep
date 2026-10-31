/* eslint-disable react/no-multi-comp */
import { useMemo } from 'react';
import moment from 'moment-timezone';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { useResizeDetector } from 'react-resize-detector';
import { BedTemperatureRecord } from '@api/bedTemperatures.ts';
import { SERIES, SeriesKey, Side } from '@lib/bedTemperature.ts';
import { COLORS } from '../theme.ts';

type Margin = { left: number; right: number; top: number; bottom: number };

// In-bed periods as a thin strip under the chart, on the chart's own time scale
const PresenceStrip = ({ rows, side, width, margin }: { rows: BedTemperatureRecord[]; side: Side; width: number; margin: Margin }) => {
  if (rows.length < 2) return null;
  const t0 = rows[0].timestamp;
  const t1 = rows[rows.length - 1].timestamp;
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
};

export default function BedTemperaturePlot({ rows, side, visible, height, compact = false }: BedTemperaturePlotProps) {
  const { width = 320, ref } = useResizeDetector();
  const other: Side = side === 'left' ? 'right' : 'left';
  const margin: Margin = compact ? { left: 34, right: 8, top: 8, bottom: 24 } : { left: 44, right: 16, top: 12, bottom: 28 };

  const dataset = useMemo(() => rows.map((r) => {
    const point: Record<string, number | Date | null> = { time: new Date(r.timestamp) };
    for (const s of SERIES) point[s.key] = s.value(r, side, other);
    return point;
  }), [rows, side, other]);

  const shown = SERIES.filter((s) => visible.includes(s.key));
  const yValues = dataset.flatMap((p) => shown.map((s) => p[s.key])).filter((v): v is number => typeof v === 'number');
  const yMin = yValues.length ? Math.floor(Math.min(...yValues) - 1) : 60;
  const yMax = yValues.length ? Math.ceil(Math.max(...yValues) + 1) : 90;
  const otherLabel = `${other === 'left' ? 'Left' : 'Right'} side`;
  // Pin the time axis to the data (no padding past now) and label minutes while the span is short
  const t0 = rows.length ? new Date(rows[0].timestamp) : undefined;
  const t1 = rows.length ? new Date(rows[rows.length - 1].timestamp) : undefined;
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
        series={ shown.map((s) => ({
          id: s.key,
          dataKey: s.key,
          label: s.key === 'otherBed' ? otherLabel : s.label,
          color: s.color,
          showMark: false,
          curve: s.key === 'setpoint' ? 'stepAfter' : 'linear',
          area: s.key === 'bed',
          connectNulls: false,
          valueFormatter: (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}°F`),
        })) }
        slotProps={ { legend: { hidden: true } } }
        sx={ {
          '& .MuiLineElement-root': { strokeWidth: 1.5 },
          '& .MuiLineElement-series-bed': { strokeWidth: 2.5 },
          '& .MuiLineElement-series-setpoint': { strokeDasharray: '6 4', strokeWidth: 1.5, opacity: 0.75 },
          '& .MuiLineElement-series-room': { opacity: 0.75 },
          '& .MuiAreaElement-series-bed': { fillOpacity: compact ? 0.1 : 0.08 },
          '& .MuiChartsGrid-line': { stroke: COLORS.divider },
          '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: COLORS.border },
          '& .MuiChartsAxis-tickLabel': { fill: COLORS.textTertiary },
        } }
      />
      <PresenceStrip rows={ rows } side={ side } width={ width } margin={ margin }/>
    </Box>
  );
}
