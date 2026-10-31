/* eslint-disable react/no-multi-comp */
import { useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { Box, Card, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useBedTemperatures, useLiveBedTemperatures } from '@api/bedTemperatures.ts';
import { SleepRecord } from '../../../server/src/db/sleepRecordsSchema.ts';
import BedTemperaturePlot from './BedTemperaturePlot.tsx';
import { fmtF, fmtRange, liveWindow, ON_TARGET_F, onTargetStats, SERIES, SeriesKey, Side } from '@lib/bedTemperature.ts';
import { COLORS } from '../theme.ts';

export type BedTemperatureMode = 'live' | 'night';

const DEFAULT_VISIBLE: SeriesKey[] = ['bed', 'setpoint', 'water', 'room'];

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <Box sx={ { flex: '1 1 0', minWidth: 72, bgcolor: COLORS.raised, borderRadius: 3, px: 1.5, py: 1 } }>
    <Typography sx={ { fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.textTertiary } }>
      { label }
    </Typography>
    <Typography sx={ { fontSize: '1.125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>{ value }</Typography>
    { hint && <Typography sx={ { fontSize: '0.6875rem', color: COLORS.textTertiary } }>{ hint }</Typography> }
  </Box>
);

type BedTemperatureChartProps = {
  side: Side;
  sleepRecord?: SleepRecord;
  mode?: BedTemperatureMode;
  setMode: (mode: BedTemperatureMode) => void;
};

export default function BedTemperatureChart({ side, sleepRecord, mode, setMode }: BedTemperatureChartProps) {
  const other: Side = side === 'left' ? 'right' : 'left';
  const [visible, setVisible] = useState<SeriesKey[]>(DEFAULT_VISIBLE);

  const live = useLiveBedTemperatures(mode !== 'night');
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
    const target = onTargetStats(rows, side);
    const water = rows.filter((r) => r[`${side}_on`] && r[`${side}_water`] !== null).map((r) => r[`${side}_water`] as number);
    const room = rows.map((r) => r.room).filter((v): v is number => v !== null);
    return {
      onTarget: target.percent === null ? '—' : `${target.percent}%`,
      heldHours: target.inBedHours ? `${target.inBedHours.toFixed(1)} h in bed` : 'no time in bed',
      bedAvg: fmtF(target.bedAvg),
      water: fmtRange(water),
      room: fmtRange(room),
    };
  }, [rows, side]);

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
          const isOn = visible.includes(s.key);
          return (
            <Chip
              key={ s.key }
              size="small"
              label={ s.key === 'otherBed' ? `${other === 'left' ? 'Left' : 'Right'} side` : s.label }
              onClick={ () => toggle(s.key) }
              variant={ isOn ? 'filled' : 'outlined' }
              aria-pressed={ isOn }
              icon={ (
                <Box
                  component="span"
                  sx={ {
                    width: 10, height: s.key === 'setpoint' ? 0 : 10, borderRadius: '50%', ml: '8px !important',
                    bgcolor: s.key === 'setpoint' ? 'transparent' : s.color,
                    borderTop: s.key === 'setpoint' ? `2px dashed ${s.color}` : 'none',
                    opacity: isOn ? 1 : 0.35,
                  } }
                />
              ) }
              sx={ {
                bgcolor: isOn ? COLORS.raised : 'transparent',
                borderColor: COLORS.border,
                color: isOn ? COLORS.text : COLORS.textTertiary,
              } }
            />
          );
        }) }
      </Stack>

      <Box sx={ { mt: 1, minHeight: 300 } }>
        { !loading && rows.length === 0 ? (
          <Typography sx={ { py: 6, textAlign: 'center', color: COLORS.textTertiary, fontSize: '0.875rem' } }>
            No temperature history for this time. It is kept for 30 days, starting Oct 29, 2026.
          </Typography>
        ) : (
          <BedTemperaturePlot rows={ rows } side={ side } visible={ visible } height={ 280 }/>
        ) }
      </Box>
    </Card>
  );
}
