import { Box, TextField } from '@mui/material';
import PowerOffTime from './PowerOffTime.tsx';
import { useAppStore } from '@state/appStore.tsx';
import { useScheduleStore } from './scheduleStore.tsx';

// Power on / off times for the selected night
export default function PowerTimes() {
  const { isUpdating } = useAppStore();
  const { selectedSchedule, updateSelectedSchedule } = useScheduleStore();

  return (
    <Box sx={ { display: 'flex', gap: 2, flexWrap: 'wrap' } }>
      <TextField
        label="Power on"
        type="time"
        size="small"
        value={ selectedSchedule?.power.on || '21:00' }
        disabled={ isUpdating }
        onChange={ (event) => updateSelectedSchedule({ power: { on: event.target.value } }) }
        sx={ { width: 140 } }
      />
      <PowerOffTime/>
    </Box>
  );
}
