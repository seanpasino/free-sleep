import { Box, ButtonBase, Typography } from '@mui/material';

import { COLORS } from '../theme.ts';
import { Side, useAppStore } from '@state/appStore.tsx';
import { formatTemperature, getDialColor } from '@lib/temperatureConversions.ts';
import { formatClock, getCurrentNight } from '@lib/night.ts';
import { useControlTempStore } from '../pages/ControlTempPage/controlTempStore.tsx';
import { useDeviceStatus } from '@api/deviceStatus.ts';
import { useSchedules } from '@api/schedules.ts';
import { useSettings } from '@api/settings.ts';

// Both sides at a glance; tapping one selects it
export default function SideCards() {
  const { side: selectedSide, setSide, confirmDiscardChanges } = useAppStore();
  const { data: deviceStatus } = useDeviceStatus();
  const { data: settings } = useSettings();
  const { data: schedules } = useSchedules();
  const pendingTarget = useControlTempStore(state => state.pendingTarget);
  const isCelsius = settings?.temperatureFormat === 'celsius';
  const night = getCurrentNight(settings?.timeZone);

  const describe = (side: Side) => {
    const status = deviceStatus?.[side];
    const power = schedules?.[side]?.[night]?.power;
    if (settings?.[side]?.awayMode) {
      return { value: 'Away', valueColor: COLORS.textTertiary, detail: 'Away mode on' };
    }
    if (!status?.isOn) {
      return {
        value: 'Off',
        valueColor: COLORS.textTertiary,
        detail: power?.enabled ? `Turns on ${formatClock(power.on)}` : 'No schedule tonight',
      };
    }
    const target = pendingTarget[side]?.temperatureF ?? status.targetTemperatureF;
    const current = status.currentTemperatureF;
    const now = `now ${formatTemperature(current, isCelsius).replace(/[FC]$/, '')}`;
    let detail: string;
    if (status.isActive === false) detail = `Starting · ${now}`;
    else if (current > target) detail = `Cooling · ${now}`;
    else if (current < target) detail = `Warming · ${now}`;
    else detail = 'At temperature';
    return { value: formatTemperature(target, isCelsius), valueColor: getDialColor(target, current), detail };
  };

  return (
    <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, width: '100%' } }>
      { (['left', 'right'] as Side[]).map((side) => {
        const selected = side === selectedSide;
        const { value, valueColor, detail } = describe(side);
        return (
          <ButtonBase
            key={ side }
            aria-pressed={ selected }
            onClick={ () => {
              if (side === selectedSide || !confirmDiscardChanges()) return;
              setSide(side);
            } }
            sx={ {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 0.5,
              p: 1.75,
              borderRadius: '16px',
              textAlign: 'left',
              fontFamily: 'inherit',
              backgroundColor: selected ? COLORS.selectedSurface : COLORS.surface,
              border: selected ? `1.5px solid ${COLORS.cool}` : `1px solid ${COLORS.border}`,
            } }
          >
            <Typography sx={ { fontSize: 13, fontWeight: 500, color: COLORS.textSecondary } }>
              { settings?.[side]?.name || (side === 'left' ? 'Left' : 'Right') }
            </Typography>
            <Typography sx={ { fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.2, color: valueColor } }>
              { deviceStatus ? value : '–' }
            </Typography>
            <Typography
              sx={ {
                fontSize: 12,
                color: COLORS.textSecondary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              } }>
              { deviceStatus ? detail : 'Loading…' }
            </Typography>
          </ButtonBase>
        );
      }) }
    </Box>
  );
}
