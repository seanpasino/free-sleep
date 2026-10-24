import FlightTakeoff from '@mui/icons-material/FlightTakeoff';
import { Box, Button, Typography } from '@mui/material';
import { DeepPartial } from 'ts-essentials';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { COLORS } from '../../theme.ts';
import { Settings } from '@api/settingsSchema.ts';
import { postSettings } from '@api/settings.ts';
import { reportError, Side, useAppStore } from '@state/appStore.tsx';

type AwayNotificationProps = {
  settings?: Settings;
}

const sideName = (settings: Settings | undefined, side: Side) => settings?.[side]?.name || (side === 'left' ? 'Left' : 'Right');

// Explains away mode (instead of the controls just disappearing) and offers the way out
export default function AwayNotification({ settings }: AwayNotificationProps) {
  const queryClient = useQueryClient();
  const { side } = useAppStore();
  const [isSaving, setIsSaving] = useState(false);
  const otherSide: Side = side === 'right' ? 'left' : 'right';
  const thisAway = !!settings?.[side]?.awayMode;
  const otherAway = !!settings?.[otherSide]?.awayMode;
  if (!thisAway && !otherAway) return null;

  const turnOffAwayMode = () => {
    const update: DeepPartial<Settings> = {};
    if (thisAway) update[side] = { awayMode: false };
    if (otherAway && !thisAway) update[otherSide] = { awayMode: false };
    setIsSaving(true);
    postSettings(update)
      .then(() => queryClient.invalidateQueries({ queryKey: ['useSettings'] }))
      .catch(error => reportError('turn off away mode', error))
      .finally(() => setIsSaving(false));
  };

  let title: string;
  let body: string;
  if (thisAway && otherAway) {
    title = 'Both sides are away';
    body = 'Temperature changes apply to the whole bed.';
  } else if (thisAway) {
    title = `${sideName(settings, side)} side is away`;
    body = `Its temperature is controlled from ${sideName(settings, otherSide)}'s side until away mode is turned off.`;
  } else {
    title = `${sideName(settings, otherSide)} side is away`;
    body = `${sideName(settings, side)}'s controls are adjusting the whole bed until away mode is turned off.`;
  }

  return (
    <Box
      sx={ {
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 2,
        borderRadius: '14px',
        backgroundColor: COLORS.surface,
        width: '100%',
        boxSizing: 'border-box',
      } }>
      <Box sx={ { display: 'flex', alignItems: 'center', gap: 1.25 } }>
        <FlightTakeoff sx={ { fontSize: 20, color: COLORS.textSecondary } }/>
        <Typography sx={ { fontSize: 14, fontWeight: 500 } }>{ title }</Typography>
      </Box>
      <Typography sx={ { fontSize: 13, lineHeight: 1.45, color: COLORS.textSecondary } }>{ body }</Typography>
      { !(thisAway && otherAway) && (
        <Button
          variant="text"
          onClick={ turnOffAwayMode }
          disabled={ isSaving }
          sx={ { alignSelf: 'flex-start', px: 0, minHeight: 32 } }
        >
          Turn off away mode
        </Button>
      ) }
    </Box>
  );
}
