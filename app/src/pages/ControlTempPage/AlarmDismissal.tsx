import { useEffect, useState } from 'react';
import { Box, Button, Drawer, Typography } from '@mui/material';
import { reportError, useAppStore } from '@state/appStore.tsx';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import { keyframes } from '@mui/system';
import { postDeviceStatus, useDeviceStatus } from '@api/deviceStatus.ts';
import { useQueryClient } from '@tanstack/react-query';
import { DEVICE_STATUS_QUERY_KEY } from './targetTemperature.ts';
import { COLORS, SAFE_BOTTOM } from '../../theme.ts';
import { useSettings } from '@api/settings.ts';

const pulse = keyframes`
    0% { transform: scale(1) translateX(0); }
    10% { transform: scale(1.1) translateX(-3px); }
    20% { transform: scale(1.1) translateX(3px); }
    30% { transform: scale(1.1) translateX(-3px); }
    40% { transform: scale(1.1) translateX(3px); }
    50% { transform: scale(1.2) translateX(0); }
    100% { transform: scale(1) translateX(0); }
`;


export default function AlarmDismissal() {
  const queryClient = useQueryClient();
  const { side } = useAppStore();
  const { data: deviceStatus } = useDeviceStatus();
  const isAlarmVibrating = deviceStatus?.[side]?.isAlarmVibrating || false;

  const [dismissed, setDismissed] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  // Re-arm once the alarm stops, so the next alarm (e.g. tomorrow) shows again
  // without needing a page reload
  useEffect(() => {
    if (!isAlarmVibrating) setDismissed(false);
  }, [isAlarmVibrating]);

  const { data: settings } = useSettings();


  const handleDismiss = () => {
    setIsDismissing(true);
    postDeviceStatus({
      [side]: {
        isAlarmVibrating: false,
      }
    })
      // Only hide the dialog if the Pod accepted it; on failure it stays up to retry
      .then(() => setDismissed(true))
      .catch(error => reportError('dismiss the alarm', error))
      .finally(() => {
        setIsDismissing(false);
        void queryClient.invalidateQueries({ queryKey: DEVICE_STATUS_QUERY_KEY });
      });
  };

  const name = settings?.[side]?.name || (side === 'left' ? 'Left' : 'Right');

  return (
    <Drawer
      anchor="bottom"
      open={ !dismissed && isAlarmVibrating }
      // Only the button dismisses: a stray tap on the backdrop shouldn't silence an alarm
      onClose={ () => undefined }
      PaperProps={ {
        sx: {
          maxWidth: 560,
          mx: 'auto',
          borderRadius: '20px 20px 0 0',
          border: `1px solid ${COLORS.border}`,
          borderBottom: 'none',
          backgroundColor: COLORS.raised,
          backgroundImage: 'none',
          px: 2.5,
          pt: 2.5,
          pb: `calc(20px + ${SAFE_BOTTOM})`,
        },
      } }
    >
      <Box role="alertdialog" aria-label={ `${name} side alarm` } sx={ { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' } }>
        <Box
          sx={ {
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: '#2E2116',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          } }>
          <NotificationsActiveOutlined sx={ { color: COLORS.warm, fontSize: 26, animation: `${pulse} 2s infinite` } }/>
        </Box>
        <Box sx={ { flexGrow: 1, minWidth: 140 } }>
          <Typography sx={ { fontSize: 17, fontWeight: 600 } }>{ name } side alarm</Typography>
          <Typography sx={ { fontSize: 14, color: COLORS.textSecondary } }>Vibrating now</Typography>
        </Box>
        <Button
          onClick={ handleDismiss }
          disabled={ isDismissing }
          color="secondary"
          variant="contained"
          sx={ { px: 3.5, height: 52, borderRadius: '14px' } }
        >
          Dismiss
        </Button>
      </Box>
    </Drawer>
  );
}
