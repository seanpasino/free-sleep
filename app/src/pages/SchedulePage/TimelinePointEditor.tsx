import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { Add, DeleteOutline, Remove } from '@mui/icons-material';
import _ from 'lodash';
import moment from 'moment-timezone';

import { COLORS } from '../../theme.ts';
import { formatClock } from '@lib/night.ts';
import { formatTemperature, MAX_TEMP_F, MIN_TEMP_F } from '@lib/temperatureConversions.ts';
import { minutesIntoNight, nightLength, START_POINT } from './NightTimeline.tsx';
import { useAppStore } from '@state/appStore.tsx';
import { useScheduleStore } from './scheduleStore.tsx';

type TimelinePointEditorProps = {
  displayCelsius: boolean;
  selected?: string;
  onSelect: (point?: string) => void;
};

const stepButtonSx = { width: 40, height: 40, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.raised };

// Edits the point selected on the timeline: time, temperature, delete; plus "Add point"
export default function TimelinePointEditor({ displayCelsius, selected, onSelect }: TimelinePointEditorProps) {
  const { selectedSchedule, updateSelectedSchedule, updateSelectedTemperatures } = useScheduleStore();
  const { isUpdating, notify } = useAppStore();
  if (!selectedSchedule) return null;
  const { power, temperatures } = selectedSchedule;
  const total = nightLength(power);
  const isStart = selected === START_POINT;
  const temperatureF = isStart ? power.onTemperature : selected ? temperatures[selected] : undefined;

  // Steps outside the power window never run; surface them instead of hiding them
  const outside = Object.keys(temperatures).filter((time) => {
    const m = minutesIntoNight(power, time);
    return m === 0 || m >= total;
  });

  const setTemperature = (value: number) => {
    const clamped = Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, value));
    if (isStart) {
      updateSelectedSchedule({ power: { onTemperature: clamped } });
    } else if (selected) {
      updateSelectedTemperatures({ ...temperatures, [selected]: clamped });
    }
  };

  const setTime = (newTime: string) => {
    if (!selected || isStart || !newTime || newTime === selected) return;
    if (temperatures[newTime] !== undefined) {
      notify(`There's already a step at ${formatClock(newTime)}`);
      return;
    }
    const { [selected]: value, ...rest } = temperatures;
    updateSelectedTemperatures({ ...rest, [newTime]: value });
    onSelect(newTime);
  };

  const remove = () => {
    if (!selected || isStart) return;
    updateSelectedTemperatures(_.omit(temperatures, selected));
    onSelect(undefined);
  };

  const removeOutside = () => {
    updateSelectedTemperatures(Object.fromEntries(Object.entries(temperatures).filter(([time]) => !outside.includes(time))));
  };

  const add = () => {
    // One hour after the last step (or power-on), kept inside the night
    const last = Object.keys(temperatures)
      .filter((time) => !outside.includes(time))
      .sort((a, b) => minutesIntoNight(power, b) - minutesIntoNight(power, a))[0];
    const from = last ?? power.on;
    let next = moment(from, 'HH:mm').add(1, 'hour').format('HH:mm');
    if (minutesIntoNight(power, next) >= total || temperatures[next] !== undefined) {
      next = moment(power.on, 'HH:mm').add(Math.floor(total / 2), 'minutes').format('HH:mm');
    }
    if (temperatures[next] !== undefined) {
      notify('Pick a free time for the new step first');
      return;
    }
    updateSelectedTemperatures({ ...temperatures, [next]: last ? temperatures[last] : power.onTemperature });
    onSelect(next);
  };

  return (
    <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1.5, px: 0.5 } }>
      { selected && temperatureF !== undefined ? (
        <Box sx={ { display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' } }>
          { isStart ? (
            <Typography sx={ { fontSize: 14, color: COLORS.textSecondary, flexGrow: 1 } }>
              Power on · { formatClock(power.on) }
            </Typography>
          ) : (
            <TextField
              label="Time"
              type="time"
              size="small"
              value={ selected }
              onChange={ (event) => setTime(event.target.value) }
              disabled={ isUpdating }
              sx={ { width: 128, flexGrow: 1 } }
            />
          ) }
          <Box sx={ { display: 'flex', alignItems: 'center', gap: 1 } }>
            <IconButton
              aria-label="Lower this step's temperature"
              sx={ stepButtonSx }
              disabled={ isUpdating || temperatureF <= MIN_TEMP_F }
              onClick={ () => setTemperature(temperatureF - 1) }
            >
              <Remove fontSize="small"/>
            </IconButton>
            <Typography aria-live="polite" sx={ { minWidth: 56, textAlign: 'center', fontSize: 16, fontWeight: 500 } }>
              { formatTemperature(temperatureF, displayCelsius) }
            </Typography>
            <IconButton
              aria-label="Raise this step's temperature"
              sx={ stepButtonSx }
              disabled={ isUpdating || temperatureF >= MAX_TEMP_F }
              onClick={ () => setTemperature(temperatureF + 1) }
            >
              <Add fontSize="small"/>
            </IconButton>
          </Box>
          { !isStart && (
            <IconButton aria-label="Delete this step" onClick={ remove } disabled={ isUpdating } sx={ { color: COLORS.textSecondary } }>
              <DeleteOutline/>
            </IconButton>
          ) }
        </Box>
      ) : (
        <Typography sx={ { fontSize: 13, color: COLORS.textTertiary } }>
          Tap a point to edit it, or drag it up and down.
        </Typography>
      ) }
      { outside.length > 0 && (
        <Box sx={ { display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, color: '#FFE6BF' } }>
          <Box sx={ { flexGrow: 1 } }>
            { outside.length === 1 ? `The ${formatClock(outside[0])} step is` : `${outside.length} steps are` }
            { ` outside ${formatClock(power.on)}–${formatClock(power.off)} and won't run.` }
          </Box>
          <Button size="small" color="warning" onClick={ removeOutside } sx={ { minHeight: 32, flexShrink: 0 } }>Remove</Button>
        </Box>
      ) }
      <Button startIcon={ <Add/> } onClick={ add } disabled={ isUpdating } sx={ { alignSelf: 'flex-start', minHeight: 36 } }>
        Add point
      </Button>
    </Box>
  );
}
