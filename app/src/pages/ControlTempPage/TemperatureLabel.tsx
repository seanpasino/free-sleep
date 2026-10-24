import { Box, CircularProgress, Typography } from '@mui/material';

import { COLORS } from '../../theme.ts';
import { formatDegrees, formatTemperature } from '@lib/temperatureConversions.ts';


type TemperatureLabelProps = {
  isOn: boolean;
  isActive?: boolean | null;
  isInAwayMode: boolean;
  // What the dial shows: the user's pending pick, else the Pod's target
  targetTemperatureF: number;
  // What the Pod currently reports as its target
  currentTargetTemp: number;
  currentTemperatureF: number;
  displayCelsius: boolean;
  isSending: boolean;
  powerOnTime?: string;
};


const getTitle = (targetTemperatureF: number, currentTargetTemp: number, currentTemperatureF: number, isActive?: boolean | null) => {
  // User is mid-change
  if (targetTemperatureF !== currentTargetTemp) {
    if (targetTemperatureF < currentTemperatureF) return 'Cool to';
    if (targetTemperatureF > currentTemperatureF) return 'Warm to';
    return 'Hold at';
  }
  // Commanded on, but the pump/TEC hasn't physically engaged yet (the firmware
  // defers actuation for a couple minutes — anti-short-cycle protection)
  if (isActive === false) return 'Starting…';
  if (currentTemperatureF < currentTargetTemp) return 'Warming to';
  if (currentTemperatureF > currentTargetTemp) return 'Cooling to';
  return 'Holding at';
};


export default function TemperatureLabel({
  isOn,
  isActive,
  isInAwayMode,
  targetTemperatureF,
  currentTargetTemp,
  currentTemperatureF,
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
        { getTitle(targetTemperatureF, currentTargetTemp, currentTemperatureF, isActive) }
      </Typography>
      <Typography
        component="span"
        sx={ { fontSize: 'clamp(56px, 21vw, 80px)', fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.05, color: COLORS.text } }
      >
        { formatDegrees(targetTemperatureF, displayCelsius) }
      </Typography>
      <Typography sx={ { fontSize: 14, color: COLORS.textSecondary } }>
        Now { formatTemperature(currentTemperatureF, displayCelsius) }
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
