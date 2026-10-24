import { Box, ButtonBase } from '@mui/material';
import { COLORS } from '../../theme.ts';
import { getCurrentNight } from '@lib/night.ts';
import { LOWERCASE_DAYS } from './days.ts';
import { useAppStore } from '@state/appStore.tsx';
import { useScheduleStore } from './scheduleStore.tsx';
import { useSettings } from '@api/settings.ts';

// One chip per night; the dot marks the night in progress
export default function DayChips() {
  const { selectDay, selectedDayIndex } = useScheduleStore();
  const { isUpdating, confirmDiscardChanges } = useAppStore();
  const { data: settings } = useSettings();
  const currentNight = getCurrentNight(settings?.timeZone);

  return (
    <Box
      role="tablist"
      aria-label="Nights of the week"
      sx={ {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gap: 0.75,
        width: '100%',
      } }>
      { LOWERCASE_DAYS.map((day, index) => {
        const selected = index === selectedDayIndex;
        const isCurrent = day === currentNight;
        return (
          <ButtonBase
            key={ day }
            role="tab"
            aria-selected={ selected }
            aria-label={ `${day.charAt(0).toUpperCase()}${day.slice(1)} night${isCurrent ? ' (current)' : ''}` }
            disabled={ isUpdating }
            onClick={ () => {
              if (selected || !confirmDiscardChanges()) return;
              selectDay(index);
            } }
            sx={ {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              pt: 1,
              pb: 0.75,
              borderRadius: '10px',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: selected ? COLORS.cool : COLORS.surface,
              color: selected ? COLORS.ground : COLORS.textSecondary,
            } }
          >
            { day.slice(0, 3).replace(/^./, c => c.toUpperCase()) }
            <Box
              sx={ {
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: isCurrent ? (selected ? COLORS.ground : COLORS.cool) : 'transparent',
              } }/>
          </ButtonBase>
        );
      }) }
    </Box>
  );
}
