/* eslint-disable react/no-multi-comp */
import { useMemo } from 'react';
import moment from 'moment-timezone';
import { Box, Card, Skeleton, Typography } from '@mui/material';
import { useLiveBedTemperatures } from '@api/bedTemperatures.ts';
import { useBedEvents } from '@api/nights.ts';
import { useSchedules } from '@api/schedules.ts';
import { useSettings } from '@api/settings.ts';
import BedTemperaturePlot from './BedTemperaturePlot.tsx';
import NightRating from './NightRating.tsx';
import {
  DAY_OF_NIGHT, liveWindow, nightOf, ON_TARGET_F, onTargetStats, schedulePlan, seriesColor, SeriesKey, Side,
} from '@lib/bedTemperature.ts';
import { COLORS } from '../theme.ts';

const VISIBLE: SeriesKey[] = ['bed', 'setpoint', 'water', 'room'];
// Older than this, the latest reading is stale and isn't shown as "now"
const FRESH_MS = 5 * 60_000;
const TREND_MINUTES = 15;
const TREND_MIN_F = 0.3;
// After power-off, the card asks how the night felt until this long after
const RATE_FOR_MS = 14 * 3600_000;

const toDisplay = (f: number, celsius: boolean) => (celsius ? (f - 32) * 5 / 9 : f);

const Reading = ({ label, value, color, dashed = false, note }: {
  label: string; value: string; color: string; dashed?: boolean; note?: string;
}) => (
  <Box sx={ { minWidth: 0 } }>
    <Box sx={ { display: 'flex', alignItems: 'center', gap: 0.75 } }>
      <Box
        component="span"
        sx={ dashed
          ? { width: 10, borderTop: `2px dashed ${color}`, opacity: 0.8 }
          : { width: 7, height: 7, borderRadius: '50%', bgcolor: color } }
      />
      <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>{ label }</Typography>
    </Box>
    <Typography sx={ { fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 } }>
      { value }
    </Typography>
    <Typography sx={ { fontSize: 11, color: COLORS.textTertiary, minHeight: 16, fontVariantNumeric: 'tabular-nums' } }>
      { note ?? '' }
    </Typography>
  </Box>
);

const LegendItem = ({ label, line }: { label: string; line: string }) => (
  <Box sx={ { display: 'flex', alignItems: 'center', gap: 0.5 } }>
    <Box component="span" sx={ { width: 14, borderTop: line } }/>
    <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ label }</Typography>
  </Box>
);

const LiveDot = () => (
  <Box
    component="span"
    sx={ {
      width: 7,
      height: 7,
      borderRadius: '50%',
      bgcolor: COLORS.ok,
      '@media (prefers-reduced-motion: no-preference)': {
        animation: 'tonightPulse 2.4s ease-in-out infinite',
      },
      '@keyframes tonightPulse': {
        '0%, 100%': { boxShadow: `0 0 0 0 ${COLORS.ok}66` },
        '50%': { boxShadow: `0 0 0 5px ${COLORS.ok}00` },
      },
    } }
  />
);

type TonightCardProps = {
  side: Side;
  isOn: boolean;
  // The bed setpoint the Pod reports (updates with every press, before the history does)
  setpointF?: number;
  displayCelsius: boolean;
};

// Temperature page: tonight's bed, setpoint, water and room, now and since the side turned on
export default function TonightCard({ side, isOn, setpointF, displayCelsius }: TonightCardProps) {
  const { data, isLoading } = useLiveBedTemperatures();
  const allRows = useMemo(() => data ?? [], [data]);
  const { rows, on } = useMemo(() => liveWindow(allRows, side), [allRows, side]);
  const stats = useMemo(() => onTargetStats(rows, side), [rows, side]);
  const { data: schedules } = useSchedules();
  const { data: settings } = useSettings();
  const night = on ? nightOf(on.from) : undefined;
  const plan = useMemo(() => (night
    ? schedulePlan(schedules?.[side]?.[DAY_OF_NIGHT(night)], night, settings?.timeZone || moment.tz.guess())
    : null), [schedules, side, night, settings?.timeZone]);
  const windowStart = rows.length ? new Date(rows[0].timestamp).toISOString() : undefined;
  const { data: events } = useBedEvents(side, windowStart, undefined, 60_000);

  if (isLoading) {
    return <Skeleton variant="rounded" height={ 300 } sx={ { borderRadius: '18px', bgcolor: COLORS.surface } }/>;
  }
  if (!allRows.length) return null;

  const latest = allRows[allRows.length - 1];
  const fresh = Date.now() - latest.timestamp < FRESH_MS;
  const unit = displayCelsius ? '°C' : '°';
  const fmt = (f: number | null | undefined, digits = 1) => (
    f === null || f === undefined || !fresh ? '—' : `${toDisplay(f, displayCelsius).toFixed(digits)}${unit}`
  );

  const bedNow = latest[`${side}_bed`];
  const before = [...allRows].reverse().find((r) => r.timestamp <= latest.timestamp - TREND_MINUTES * 60_000);
  const bedBefore = before?.[`${side}_bed`];
  let trend: string | undefined;
  if (fresh && typeof bedNow === 'number' && typeof bedBefore === 'number') {
    const delta = bedNow - bedBefore;
    if (Math.abs(delta) >= TREND_MIN_F) {
      const shown = displayCelsius ? Math.abs(delta) * 5 / 9 : Math.abs(delta);
      trend = `${delta > 0 ? '↑' : '↓'} ${shown.toFixed(1)}° in ${TREND_MINUTES} min`;
    }
  }

  const liveNow = on !== null && on.to === null;
  const title = liveNow ? 'Tonight' : on ? 'Last night' : 'Last 12 hours';
  const status = liveNow
    ? `On since ${moment(on.from).format('h:mm A')}`
    : on
      ? `${moment(on.from).format('h:mm A')} – ${moment(on.to).format('h:mm A')}`
      : 'Side off';

  return (
    <Card sx={ { p: 2, pb: 1.5 } }>
      <Box sx={ { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 } }>
        <Typography sx={ { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }>{ title }</Typography>
        <Box sx={ { display: 'flex', alignItems: 'center', gap: 0.75, color: COLORS.textTertiary, fontSize: 12 } }>
          { liveNow && <LiveDot/> }
          { status }
        </Box>
      </Box>

      <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, mt: 1.5 } }>
        <Reading label="Bed" value={ fmt(bedNow) } color={ seriesColor('bed') } note={ trend }/>
        <Reading
          label="Setpoint"
          value={ isOn && setpointF !== undefined ? `${toDisplay(setpointF, displayCelsius).toFixed(displayCelsius ? 1 : 0)}${unit}` : 'Off' }
          color={ seriesColor('setpoint') }
          dashed
        />
        <Reading label="Water" value={ fmt(latest[`${side}_water`]) } color={ seriesColor('water') }/>
        <Reading label="Room" value={ fmt(latest.room) } color={ seriesColor('room') }/>
      </Box>

      { rows.length > 1 && (
        <Box sx={ { mt: 0.5, mx: -0.5 } }>
          <BedTemperaturePlot
            rows={ rows }
            side={ side }
            visible={ VISIBLE }
            height={ 170 }
            compact
            plan={ plan }
            extendTo={ liveNow && plan ? plan[plan.length - 1].time : undefined }
            events={ events }
          />
          <Box sx={ { display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.75, ml: '34px' } }>
            <LegendItem label="Setpoint" line={ `2px dashed ${seriesColor('setpoint')}` }/>
            { plan && <LegendItem label="Schedule" line={ `2px dotted ${COLORS.textTertiary}` }/> }
            { !!events?.some((e) => e.kind === 'button' || e.kind === 'manual') && (
              <LegendItem label="Your changes" line={ `2px dashed ${COLORS.warm}` }/>
            ) }
          </Box>
        </Box>
      ) }

      { !liveNow && on?.to && Date.now() - on.to < RATE_FOR_MS && night && (
        <Box sx={ { mt: 2, pt: 1.5, borderTop: `1px solid ${COLORS.divider}` } }>
          <NightRating side={ side } night={ night } title="How did last night feel?"/>
        </Box>
      ) }

      { stats.percent !== null && (
        <Typography sx={ { mt: 1, fontSize: 12, color: COLORS.textTertiary } }>
          Within ±{ ON_TARGET_F }°F of setpoint { stats.percent }% of { stats.inBedHours.toFixed(1) } h in bed
        </Typography>
      ) }
    </Card>
  );
}
