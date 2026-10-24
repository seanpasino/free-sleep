import { Box, Slider, Typography } from '@mui/material';
import { COLORS } from '../../theme.ts';
import { formatTemperature, MAX_TEMP_F, MIN_TEMP_F } from '@lib/temperatureConversions.ts';
import { useAppStore } from '@state/appStore.tsx';
import { useScheduleStore } from './scheduleStore.tsx';

// Temperature the bed starts at when it powers on
export default function StartTemperature({ displayCelsius }: { displayCelsius: boolean }) {
  const { isUpdating } = useAppStore();
  const { selectedSchedule, updateSelectedSchedule } = useScheduleStore();
  const value = selectedSchedule?.power.onTemperature ?? 82;

  return (
    <Box sx={ { px: 1 } }>
      <Slider
        aria-label="Power-on temperature"
        value={ value }
        onChange={ (_, newValue) => updateSelectedSchedule({ power: { onTemperature: newValue as number } }) }
        min={ MIN_TEMP_F }
        max={ MAX_TEMP_F }
        step={ 1 }
        disabled={ isUpdating }
        valueLabelDisplay="auto"
        valueLabelFormat={ (v) => formatTemperature(v, displayCelsius) }
      />
      <Box sx={ { display: 'flex', justifyContent: 'space-between' } }>
        <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>{ formatTemperature(MIN_TEMP_F, displayCelsius) }</Typography>
        <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>{ formatTemperature(MAX_TEMP_F, displayCelsius) }</Typography>
      </Box>
    </Box>
  );
}
