import { Box, IconButton } from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { COLORS } from '../../theme.ts';
import { MIN_TEMP_F, MAX_TEMP_F } from '@lib/temperatureConversions.ts';

type TemperatureButtonsProps = {
  // The target currently shown on the dial (pending pick or the Pod's value)
  targetTemperatureF: number;
  onStep: (delta: number) => void;
}

const buttonSx = {
  width: 56,
  height: 56,
  pointerEvents: 'auto',
  color: COLORS.text,
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  '&:hover': { backgroundColor: COLORS.raised },
  '&.Mui-disabled': { color: '#4A5063', borderColor: COLORS.divider },
};

// Sits in the dial's bottom gap
export default function TemperatureButtons({ targetTemperatureF, onStep }: TemperatureButtonsProps) {
  return (
    <Box
      sx={ {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '2%',
        display: 'flex',
        justifyContent: 'space-between',
        px: '11%',
        pointerEvents: 'none',
      } }
    >
      <IconButton
        sx={ buttonSx }
        onClick={ () => onStep(-1) }
        disabled={ targetTemperatureF <= MIN_TEMP_F }
        aria-label="Decrease temperature"
      >
        <Remove/>
      </IconButton>
      <IconButton
        sx={ buttonSx }
        onClick={ () => onStep(1) }
        disabled={ targetTemperatureF >= MAX_TEMP_F }
        aria-label="Increase temperature"
      >
        <Add/>
      </IconButton>
    </Box>
  );
}
