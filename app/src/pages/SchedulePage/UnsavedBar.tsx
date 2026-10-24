import { Box, Button, Typography } from '@mui/material';
import { COLORS, NAV_HEIGHT } from '../../theme.ts';
import { useAppStore } from '@state/appStore.tsx';
import { useScheduleStore } from './scheduleStore.tsx';

type UnsavedBarProps = {
  onSave: () => void;
};

// Sticks above the bottom nav while the selected night has unsaved edits
export default function UnsavedBar({ onSave }: UnsavedBarProps) {
  const { isUpdating } = useAppStore();
  const { changesPresent, isValid, reloadScheduleData } = useScheduleStore();
  if (!changesPresent) return null;
  const valid = isValid();

  return (
    <Box
      role="region"
      aria-label="Unsaved changes"
      sx={ {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: `calc(${NAV_HEIGHT + 10}px + env(safe-area-inset-bottom))`,
        display: 'flex',
        justifyContent: 'center',
        px: 1.5,
        zIndex: 11,
        pointerEvents: 'none',
      } }
    >
      <Box
        sx={ {
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 560,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1.25,
          pl: 2,
          pr: 1.25,
          borderRadius: '16px',
          backgroundColor: COLORS.raised,
          border: `1px solid #2A3042`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        } }
      >
        <Typography sx={ { flexGrow: 1, fontSize: 14, fontWeight: 500 } }>
          { valid ? 'Unsaved changes' : 'Fix the highlighted time' }
        </Typography>
        <Button onClick={ reloadScheduleData } disabled={ isUpdating } sx={ { color: COLORS.textSecondary, fontWeight: 500 } }>
          Discard
        </Button>
        <Button variant="contained" onClick={ onSave } disabled={ isUpdating || !valid } sx={ { px: 2.5 } }>
          Save
        </Button>
      </Box>
    </Box>
  );
}
