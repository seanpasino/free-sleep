import { Box, ButtonBase, Chip } from '@mui/material';
import { COLORS } from '../../theme.ts';
import { DayOfWeek } from '@api/schedulesSchema.ts';
import { LOWERCASE_DAYS } from './days.ts';
import { useAppStore } from '@state/appStore.tsx';
import { useScheduleStore } from './scheduleStore.tsx';

// Nights are keyed by the evening they start: Sun–Thu nights end on weekday mornings
const PRESETS: { label: string; days: DayOfWeek[] }[] = [
  { label: 'Weeknights', days: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
  { label: 'Weekend nights', days: ['friday', 'saturday'] },
  { label: 'Every night', days: LOWERCASE_DAYS },
];

const capitalize = (day: string) => day.charAt(0).toUpperCase() + day.slice(1);

// Picks the other nights that get a copy of this night's schedule on Save
export default function ApplyToOtherNights() {
  const { selectedDays, toggleSelectedDay, selectedDay } = useScheduleStore();
  const { isUpdating } = useAppStore();
  const others = LOWERCASE_DAYS.filter(day => day !== selectedDay);

  // Presets select exactly their nights (earlier they toggled, so pressing one twice undid it)
  const applyPreset = (days: DayOfWeek[]) => {
    others.forEach((day) => {
      if (selectedDays[day] !== days.includes(day)) toggleSelectedDay(day);
    });
  };

  return (
    <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1.5 } }>
      <Box sx={ { display: 'flex', gap: 1, flexWrap: 'wrap' } }>
        { PRESETS.map(({ label, days }) => (
          <Chip key={ label } label={ label } onClick={ () => applyPreset(days) } disabled={ isUpdating } variant="outlined"/>
        )) }
        <Chip label="None" onClick={ () => applyPreset([]) } disabled={ isUpdating } variant="outlined"/>
      </Box>
      <Box sx={ { display: 'flex', gap: 0.75, flexWrap: 'wrap' } }>
        { others.map((day) => {
          const on = selectedDays[day];
          return (
            <ButtonBase
              key={ day }
              role="checkbox"
              aria-checked={ on }
              onClick={ () => toggleSelectedDay(day) }
              disabled={ isUpdating }
              sx={ {
                px: 1.5,
                minHeight: 36,
                borderRadius: '10px',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                backgroundColor: on ? COLORS.cool : COLORS.raised,
                color: on ? COLORS.ground : COLORS.textSecondary,
              } }
            >
              { capitalize(day) }
            </ButtonBase>
          );
        }) }
      </Box>
    </Box>
  );
}
