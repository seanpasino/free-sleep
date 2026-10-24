import { useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { Button, Box } from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { useQueryClient } from '@tanstack/react-query';
import { useControlTempStore } from './controlTempStore.tsx';
import { sendPendingTarget } from './targetTemperature.ts';
import { Side, useAppStore } from '@state/appStore.tsx';
import { useSettings } from '@api/settings.ts';
import { MIN_TEMP_F, MAX_TEMP_F } from '@lib/temperatureConversions.ts';

type TemperatureButtonsProps = {
  // The target currently shown on the dial (pending pick or the Pod's value)
  targetTemperatureF: number;
}

const DEBOUNCE_MS = 2000;
export default function TemperatureButtons({ targetTemperatureF }: TemperatureButtonsProps) {
  const queryClient = useQueryClient();
  const { side } = useAppStore();
  const setPendingTarget = useControlTempStore(state => state.setPendingTarget);
  const { data: settings } = useSettings();
  const theme = useTheme();
  // One timer per side, so switching sides mid-debounce can't cancel the other side's send.
  // Not cleared on unmount: a tap made just before leaving the page still gets sent.
  const debounceTimers = useRef<Partial<Record<Side, ReturnType<typeof setTimeout>>>>({});

  const scheduleUpdate = () => {
    const sideAtClick = side;
    clearTimeout(debounceTimers.current[sideAtClick]);
    debounceTimers.current[sideAtClick] = setTimeout(() => void sendPendingTarget(queryClient, sideAtClick), DEBOUNCE_MS);
  };

  const isInAwayMode = settings?.[side].awayMode;
  if (isInAwayMode) return null;

  const borderColor = theme.palette.grey[800];
  const iconColor = theme.palette.grey[500];

  const handleClick = (change: number) => {
    const next = Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, targetTemperatureF + change));
    if (next === targetTemperatureF) return;
    setPendingTarget(side, next);
    scheduleUpdate();
  };

  const buttonStyle = {
    borderWidth: '2px',
    borderColor,
    width: 50,
    height: 50,
    borderRadius: '50%',
    minWidth: 0,
    padding: 0,
  };

  return (
    <Box
      sx={ {
        top: '75%',
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '100px',
        width: '100%',
        marginLeft: 'auto',
        marginRight: 'auto',
      } }
    >
      <Button
        variant="outlined"
        color="primary"
        sx={ buttonStyle }
        onClick={ () => handleClick(-1) }
        aria-label="Decrease temperature"
        disabled={ targetTemperatureF <= MIN_TEMP_F }
      >
        <Remove sx={ { color: iconColor } }/>
      </Button>
      <Button
        variant="outlined"
        sx={ buttonStyle }

        onClick={ () => handleClick(1) }
        aria-label="Increase temperature"
        disabled={ targetTemperatureF >= MAX_TEMP_F }
      >
        <Add sx={ { color: iconColor } }/>
      </Button>
    </Box>
  );
}
