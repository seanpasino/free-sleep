// Shared helpers for the bed temperature history (Sleep page card and the Temperature page's Tonight card)
import { BedTemperatureRecord } from '@api/bedTemperatures.ts';
import { COLORS } from '../theme.ts';

export type Side = 'left' | 'right';
export type SeriesKey = 'bed' | 'setpoint' | 'water' | 'room' | 'otherBed' | 'out' | 'in' | 'probe';

export type SeriesDef = {
  key: SeriesKey;
  label: string;
  color: string;
  value: (row: BedTemperatureRecord, side: Side, other: Side) => number | null;
};

export const SERIES: SeriesDef[] = [
  { key: 'bed', label: 'Bed', color: COLORS.warm, value: (r, s) => r[`${s}_bed`] },
  { key: 'setpoint', label: 'Setpoint', color: COLORS.text, value: (r, s) => r[`${s}_setpoint`] },
  { key: 'water', label: 'Water', color: COLORS.cool, value: (r, s) => r[`${s}_water`] },
  { key: 'room', label: 'Room', color: '#A991FF', value: (r) => r.room },
  { key: 'otherBed', label: 'Other side', color: '#FFC46B', value: (r, _s, o) => r[`${o}_bed`] },
  { key: 'out', label: 'Outer edge', color: '#FF7A7A', value: (r, s) => r[`${s}_out`] },
  { key: 'in', label: 'Inner', color: COLORS.ok, value: (r, s) => r[`${s}_in`] },
  { key: 'probe', label: '"Side" probe', color: '#C9CEDA', value: (r, s) => r[`${s}_side`] },
];

export const seriesColor = (key: SeriesKey) => SERIES.find((s) => s.key === key)?.color ?? COLORS.text;

export const ON_TARGET_F = 1;
// Gaps shorter than this inside an on-period (a restart, a missed minute) don't end it
const MAX_GAP_MS = 10 * 60 * 1000;
const ON_NOW_MS = 20 * 60 * 1000;

export const fmtF = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}°`);

export const fmtRange = (values: number[]) => {
  if (!values.length) return '—';
  const lo = Math.min(...values).toFixed(0);
  const hi = Math.max(...values).toFixed(0);
  return lo === hi ? `${lo}°` : `${lo}–${hi}°`;
};

export type OnPeriod = { from: number; to: number | null } | null;

// Tonight: the stretch the side has been on, up to now. While it's off, its last on-period
// (a few minutes either side); with none in the lookback, the last 12 hours.
export const liveWindow = (rows: BedTemperatureRecord[], side: Side): { rows: BedTemperatureRecord[]; on: OnPeriod } => {
  let end = rows.length - 1;
  while (end >= 0 && !rows[end][`${side}_on`]) end--;
  if (end < 0) {
    return { rows: rows.filter((r) => r.timestamp >= Date.now() - 12 * 3600_000), on: null };
  }
  let start = end;
  while (start > 0 && rows[start - 1][`${side}_on`] && rows[start].timestamp - rows[start - 1].timestamp <= MAX_GAP_MS) start--;
  const onNow = end === rows.length - 1 && Date.now() - rows[end].timestamp < ON_NOW_MS;
  return {
    rows: rows.slice(Math.max(0, start - 10), onNow ? undefined : end + 15),
    on: { from: rows[start].timestamp, to: onNow ? null : rows[end].timestamp },
  };
};

// How well the bed held its setpoint while someone was in it
export const onTargetStats = (rows: BedTemperatureRecord[], side: Side) => {
  const held = rows.filter((r) => r[`${side}_present`] && r[`${side}_setpoint`] !== null && r[`${side}_bed`] !== null);
  const onTarget = held.filter((r) => Math.abs((r[`${side}_bed`] as number) - (r[`${side}_setpoint`] as number)) <= ON_TARGET_F);
  const bed = held.map((r) => r[`${side}_bed`] as number);
  return {
    percent: held.length ? Math.round((onTarget.length / held.length) * 100) : null,
    inBedHours: held.length / 60,
    bedAvg: bed.length ? bed.reduce((a, b) => a + b, 0) / bed.length : null,
  };
};
