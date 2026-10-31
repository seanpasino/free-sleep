import { Box, CircularProgress, Typography } from '@mui/material';

import { COLORS } from '../../theme.ts';
import { formatDegrees, formatTemperature } from '@lib/temperatureConversions.ts';
import { BedPhase } from '@lib/bedPhase.ts';


type TemperatureLabelProps = {
  isOn: boolean;
  isInAwayMode: boolean;
  // What the dial shows: the user's pending pick, else the Pod's target
  targetTemperatureF: number;
  // What the Pod currently reports as its target
  currentTargetTemp: number;
  currentTemperatureF: number;
  phase: BedPhase;
  // Water temperature, shown with bed control so the dial's number isn't mistaken for it
  waterF?: number | null;
  displayCelsius: boolean;
  isSending: boolean;
  powerOnTime?: string;
};


const PHASE_TITLE: Record<BedPhase, string> = {
  starting: 'Starting…',
  ready: 'Ready for you',
  bodyHeat: 'Warming up with you',
  warming: 'Warming to',
  cooling: 'Cooling to',
  holding: 'Holding at',
};

const getTitle = (targetTemperatureF: number, currentTargetTemp: number, currentTemperatureF: number, phase: BedPhase) => {
  // User is mid-change
  if (targetTemperatureF !== currentTargetTemp) {
    if (targetTemperatureF < currentTemperatureF) return 'Cool to';
    if (targetTemperatureF > currentTemperatureF) return 'Warm to';
    return 'Hold at';
  }
  return PHASE_TITLE[phase];
};


export default function TemperatureLabel({
  isOn,
  isInAwayMode,
  targetTemperatureF,
  currentTargetTemp,
  currentTemperatureF,
  phase,
  waterF,
  displayCelsius,
  isSending,
  powerOnTime,
}: TemperatureLabelProps) {
  if (!isOn || isInAwayMode) {
    return (
      <>
        <Typography
          sx={ {
            fontSize: 'clamp(48px, 16vw, 64px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: COLORS.textTertiary,
          } }>
          { isInAwayMode ? 'Away' : 'Off' }
        </Typography>
        { !isInAwayMode && powerOnTime && (
          <Typography sx={ { fontSize: 14, color: COLORS.textTertiary, mt: 1 } }>
            Turns on at { powerOnTime }
          </Typography>
        ) }
      </>
    );
  }

  return (
    <>
      <Typography sx={ { fontSize: 14, fontWeight: 500, color: COLORS.textSecondary } }>
        { getTitle(targetTemperatureF, currentTargetTemp, currentTemperatureF, phase) }
      </Typography>
      <Typography
        component="span"
        sx={ { fontSize: 'clamp(56px, 21vw, 80px)', fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.05, color: COLORS.text } }
      >
        { formatDegrees(targetTemperatureF, displayCelsius) }
      </Typography>
      <Typography sx={ { fontSize: 14, color: COLORS.textSecondary } }>
        { waterF === undefined || waterF === null
          ? `Now ${formatTemperature(currentTemperatureF, displayCelsius)}`
          : `Bed ${formatTemperature(currentTemperatureF, displayCelsius)} · Water ${formatTemperature(Math.round(waterF), displayCelsius)}` }
      </Typography>
      <Box sx={ { height: 20, mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.75, color: COLORS.textTertiary, fontSize: 12 } }>
        { isSending && (
          <>
            <CircularProgress size={ 10 } thickness={ 6 } sx={ { color: COLORS.cool } }/>
            Sending to Pod…
          </>
        ) }
      </Box>
    </>
  );
}
