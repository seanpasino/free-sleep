/* eslint-disable react/no-multi-comp */
import { useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { Box, Card, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { useResizeDetector } from 'react-resize-detector';
import { BedTemperatureRecord, useBedTemperatures } from '@api/bedTemperatures.ts';
import { SleepRecord } from '../../../server/src/db/sleepRecordsSchema.ts';
import { COLORS } from '../theme.ts';

type Side = 'left' | 'right';
export type BedTemperatureMode = 'live' | 'night';

type SeriesKey = 'bed' | 'setpoint' | 'water' | 'room' | 'otherBed' | 'out' | 'in' | 'probe';

type SeriesDef = {
  key: SeriesKey;
  label: string;
  color: string;
  value: (row: BedTemperatureRecord, side: Side, other: Side) => number | null;
};

const SERIES: SeriesDef[] = [
  { key: 'bed', label: 'Bed', color: COLORS.warm, value: (r, s) => r[`${s}_bed`] },
  { key: 'setpoint', label: 'Setpoint', color: COLORS.text, value: (r, s) => r[`${s}_setpoint`] },
  { key: 'water', label: 'Water', color: COLORS.cool, value: (r, s) => r[`${s}_water`] },
  { key: 'room', label: 'Room', color: '#A991FF', value: (r) => r.room },
  { key: 'otherBed', label: 'Other side', color: '#FFC46B', value: (r, _s, o) => r[`${o}_bed`] },
  { key: 'out', label: 'Outer edge', color: '#FF7A7A', value: (r, s) => r[`${s}_out`] },
  { key: 'in', label: 'Inner', color: COLORS.ok, value: (r, s) => r[`${s}_in`] },
  { key: 'probe', label: '"Side" probe', color: '#C9CEDA', value: (r, s) => r[`${s}_side`] },
];

const DEFAULT_VISIBLE: SeriesKey[] = ['bed', 'setpoint', 'water', 'room'];
const ON_TARGET_F = 1;
const LIVE_LOOKBACK_HOURS = 24;
// Gaps shorter than this inside an on-period (a restart, a missed minute) don't end it
const MAX_GAP_MS = 10 * 60 * 1000;
const MARGIN = { left: 44, right: 16, top: 12, bottom: 28 };

const fmtF = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}°`);
const fmtRange = (values: number[]) => {
  if (!values.length) return '—';
  const lo = Math.min(...values).toFixed(0);
  const hi = Math.max(...values).toFixed(0);
  return lo === hi ? `${lo}°` : `${lo}–${hi}°`;
};

// Tonight: the stretch the side has been on, up to now. While it's off, its last on-period
// (a few minutes either side); with none in the lookback, the last 12 hours.
const liveWindow = (rows: BedTemperatureRecord[], side: Side) => {
  let end = rows.length - 1;
  while (end >= 0 && !rows[end][`${side}_on`]) end--;
  if (end < 0) {
    return { rows: rows.filter((r) => r.timestamp >= Date.now() - 12 * 3600_000), on: null };
  }
  let start = end;
  while (start > 0 && rows[start - 1][`${side}_on`] && rows[start].timestamp - rows[start - 1].timestamp <= MAX_GAP_MS) start--;
  const onNow = end === rows.length - 1 && Date.now() - rows[end].timestamp < 20 * 60_000;
  return {
    rows: rows.slice(Math.max(0, start - 10), onNow ? undefined : end + 15),
    on: { from: rows[start].timestamp, to: onNow ? null : rows[end].timestamp },
  };
};

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <Box sx={ { flex: '1 1 0', minWidth: 72, bgcolor: COLORS.raised, borderRadius: 3, px: 1.5, py: 1 } }>
    <Typography sx={ { fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.textTertiary } }>
      { label }
    </Typography>
    <Typography sx={ { fontSize: '1.125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ value }</Typography>
    { hint && <Typography sx={ { fontSize: '0.6875rem', color: COLORS.textTertiary } }>{ hint }</Typography> }
  </Box>
);

// In-bed periods as a thin strip under the chart, on the chart's own time scale
const PresenceStrip = ({ rows, side, width }: { rows: BedTemperatureRecord[]; side: Side; width: number }) => {
  if (rows.length < 2) return null;
  const t0 = rows[0].timestamp;
  const t1 = rows[rows.length - 1].timestamp;
  const plot = Math.max(1, width - MARGIN.left - MARGIN.right);
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
      <Typography sx={ { width: MARGIN.left, fontSize: '0.625rem', color: COLORS.textTertiary, pr: 0.75, textAlign: 'right' } }>
        In bed
      </Typography>
      <Box sx={ { position: 'relative', width: plot, height: 6, borderRadius: 3, bgcolor: COLORS.raised, overflow: 'hidden' } }>
        { segments.map((s) => (
          <Box
            key={ s.from }
            sx={ {
              position: 'absolute', top: 0, bottom: 0, borderRadius: 3, bgcolor: COLORS.ok,
              left: x(s.from), width: Math.max(2, x(s.to) - x(s.from)),
            } }
          />
        )) }
      </Box>
    </Box>
  );
};

type BedTemperatureChartProps = {
  side: Side;
  sleepRecord?: SleepRecord;
  mode?: BedTemperatureMode;
  setMode: (mode: BedTemperatureMode) => void;
};

export default function BedTemperatureChart({ side, sleepRecord, mode, setMode }: BedTemperatureChartProps) {
  const { width = 320, ref } = useResizeDetector();
  const other: Side = side === 'left' ? 'right' : 'left';
  const [visible, setVisible] = useState<SeriesKey[]>(DEFAULT_VISIBLE);

  // Fixed for the life of the page, so the query key doesn't change every render
  const [liveStart] = useState(() => moment().subtract(LIVE_LOOKBACK_HOURS, 'hours').startOf('hour').toISOString());
  const live = useBedTemperatures({ startTime: liveStart }, true, mode === 'night' ? false : 60_000);
  const nightParams = {
    startTime: moment(sleepRecord?.entered_bed_at).subtract(30, 'minutes').toISOString(),
    endTime: moment(sleepRecord?.left_bed_at).add(15, 'minutes').toISOString(),
  };
  const night = useBedTemperatures(nightParams, sleepRecord !== undefined);

  // With no choice made yet, show tonight while the side is on (or was in the last 20 minutes)
  const liveRows = useMemo(() => live.data ?? [], [live.data]);
  const latest = liveRows[liveRows.length - 1];
  const sideOnNow = !!latest && !!latest[`${side}_on`] && Date.now() - latest.timestamp < 20 * 60_000;
  const activeMode: BedTemperatureMode = mode ?? (sideOnNow || !sleepRecord ? 'live' : 'night');

  const { rows, on } = useMemo(() => {
    if (activeMode === 'night') return { rows: night.data ?? [], on: null };
    return liveWindow(liveRows, side);
  }, [activeMode, night.data, liveRows, side]);

  const stats = useMemo(() => {
    const held = rows.filter((r) => r[`${side}_present`] && r[`${side}_setpoint`] !== null && r[`${side}_bed`] !== null);
    const onTarget = held.filter((r) => Math.abs((r[`${side}_bed`] as number) - (r[`${side}_setpoint`] as number)) <= ON_TARGET_F);
    const bed = held.map((r) => r[`${side}_bed`] as number);
    const water = rows.filter((r) => r[`${side}_on`] && r[`${side}_water`] !== null).map((r) => r[`${side}_water`] as number);
    const room = rows.map((r) => r.room).filter((v): v is number => v !== null);
    return {
      onTarget: held.length ? `${Math.round((onTarget.length / held.length) * 100)}%` : '—',
      heldHours: held.length ? `${(held.length / 60).toFixed(1)} h in bed` : 'no time in bed',
      bedAvg: bed.length ? fmtF(bed.reduce((a, b) => a + b, 0) / bed.length) : '—',
      water: fmtRange(water),
      room: fmtRange(room),
    };
  }, [rows, side]);

  const dataset = useMemo(() => rows.map((r) => {
    const point: Record<string, number | Date | null> = { time: new Date(r.timestamp) };
    for (const s of SERIES) point[s.key] = s.value(r, side, other);
    return point;
  }), [rows, side, other]);

  const shown = SERIES.filter((s) => visible.includes(s.key));
  const yValues = dataset.flatMap((p) => shown.map((s) => p[s.key])).filter((v): v is number => typeof v === 'number');
  const yMin = yValues.length ? Math.floor(Math.min(...yValues) - 1) : 60;
  const yMax = yValues.length ? Math.ceil(Math.max(...yValues) + 1) : 90;

  const toggle = (key: SeriesKey) => setVisible((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  const subtitle = activeMode === 'night'
    ? sleepRecord
      ? `${moment(sleepRecord.entered_bed_at).format('ddd h:mm A')} – ${moment(sleepRecord.left_bed_at).format('h:mm A')}`
      : 'Pick a night above'
    : !on
      ? 'Last 12 hours (side off)'
      : on.to === null
        ? `Live · on since ${moment(on.from).format('h:mm A')}`
        : `Last on ${moment(on.from).format('ddd h:mm A')} – ${moment(on.to).format('h:mm A')}`;
  const loading = activeMode === 'night' ? night.isLoading : live.isLoading;

  return (
    <Card sx={ { mt: 2, p: 2 } }>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={ 1 } flexWrap="wrap">
        <Box>
          <Typography variant="h6" sx={ { lineHeight: 1.2 } }>Bed temperature</Typography>
          <Typography sx={ { fontSize: '0.8125rem', color: COLORS.textSecondary } }>{ subtitle }</Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={ activeMode }
          onChange={ (_e, value: BedTemperatureMode | null) => value && setMode(value) }
          aria-label="Time range"
        >
          <ToggleButton value="live" sx={ { px: 1.5 } }>Tonight</ToggleButton>
          <ToggleButton value="night" disabled={ !sleepRecord } sx={ { px: 1.5 } }>Selected night</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack direction="row" gap={ 1 } sx={ { mt: 1.5 } }>
        <Stat label="On target" value={ stats.onTarget } hint={ `±${ON_TARGET_F}°F, ${stats.heldHours}` }/>
        <Stat label="Bed avg" value={ stats.bedAvg } hint="while in bed"/>
        <Stat label="Water" value={ stats.water }/>
        <Stat label="Room" value={ stats.room }/>
      </Stack>

      <Stack direction="row" gap={ 0.75 } flexWrap="wrap" sx={ { mt: 1.5 } }>
        { SERIES.map((s) => {
          const on = visible.includes(s.key);
          return (
            <Chip
              key={ s.key }
              size="small"
              label={ s.key === 'otherBed' ? `${other === 'left' ? 'Left' : 'Right'} side` : s.label }
              onClick={ () => toggle(s.key) }
              variant={ on ? 'filled' : 'outlined' }
              aria-pressed={ on }
              icon={ (
                <Box
                  component="span"
                  sx={ {
                    width: 10, height: s.key === 'setpoint' ? 0 : 10, borderRadius: '50%', ml: '8px !important',
                    bgcolor: s.key === 'setpoint' ? 'transparent' : s.color,
                    borderTop: s.key === 'setpoint' ? `2px dashed ${s.color}` : 'none',
                    opacity: on ? 1 : 0.35,
                  } }
                />
              ) }
              sx={ {
                bgcolor: on ? COLORS.raised : 'transparent',
                borderColor: COLORS.border,
                color: on ? COLORS.text : COLORS.textTertiary,
              } }
            />
          );
        }) }
      </Stack>

      <Box ref={ ref } sx={ { mt: 1, minHeight: 300 } }>
        { !loading && dataset.length === 0 ? (
          <Typography sx={ { py: 6, textAlign: 'center', color: COLORS.textTertiary, fontSize: '0.875rem' } }>
            No temperature history for this time. It is kept for 30 days, starting Oct 30, 2026.
          </Typography>
        ) : (
          <>
            <LineChart
              height={ 280 }
              margin={ MARGIN }
              dataset={ dataset }
              grid={ { horizontal: true } }
              skipAnimation
              xAxis={ [{
                dataKey: 'time',
                scaleType: 'time',
                tickNumber: Math.max(3, Math.floor(width / 90)),
                valueFormatter: (d: Date, ctx) => moment(d).format(ctx.location === 'tooltip' ? 'h:mm A' : 'h A'),
              }] }
              yAxis={ [{ min: yMin, max: yMax, valueFormatter: (v: number) => `${v}°` }] }
              series={ shown.map((s) => ({
                id: s.key,
                dataKey: s.key,
                label: s.key === 'otherBed' ? `${other === 'left' ? 'Left' : 'Right'} side` : s.label,
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
                '& .MuiLineElement-series-setpoint': { strokeDasharray: '6 4', strokeWidth: 1.5, opacity: 0.8 },
                '& .MuiLineElement-series-room': { opacity: 0.8 },
                '& .MuiAreaElement-series-bed': { fillOpacity: 0.08 },
                '& .MuiChartsGrid-line': { stroke: COLORS.divider },
                '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: COLORS.border },
                '& .MuiChartsAxis-tickLabel': { fill: COLORS.textTertiary },
              } }
            />
            <PresenceStrip rows={ rows } side={ side } width={ width }/>
          </>
        ) }
      </Box>
    </Card>
  );
}
