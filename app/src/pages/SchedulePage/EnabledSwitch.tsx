import { FormControlLabel, Switch } from '@mui/material';
import { useScheduleStore } from './scheduleStore.tsx';
import { useAppStore } from '@state/appStore.tsx';


export default function EnabledSwitch() {
  const { isUpdating } = useAppStore();
  const { selectedSchedule, updateSelectedSchedule } = useScheduleStore();

  return (
    <FormControlLabel
      control={
        <Switch
          checked={ selectedSchedule?.power.enabled || false }
          onChange={ () => {
            updateSelectedSchedule({
              power: {
                enabled: !selectedSchedule?.power.enabled
              }
            }
            );
          } }
          disabled={ isUpdating }
          size="small"
        />
      }
      label="Enabled"
      labelPlacement="start"
      sx={ { m: 0, gap: 0.5, '& .MuiFormControlLabel-label': { fontSize: 13, color: 'text.secondary' } } }
    />
  );
}
