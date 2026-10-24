import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogActions,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { reportError, useAppStore } from '@state/appStore.tsx';
import AlarmIcon from '@mui/icons-material/Alarm';
import { keyframes } from '@mui/system';
import { postDeviceStatus, useDeviceStatus } from '@api/deviceStatus.ts';
import { useQueryClient } from '@tanstack/react-query';
import { DEVICE_STATUS_QUERY_KEY } from './targetTemperature.ts';

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

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));


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

  return (
    <Dialog
      open={ !dismissed && isAlarmVibrating }
      fullScreen={ isSmallScreen }
      PaperProps={ {
        sx: isSmallScreen
          ? {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            maxWidth: '85vw',
            maxHeight: '35vh',
            borderRadius: '10px',
            margin: 0,
          }
          : {
            width: '50%',
            height: '200px'
          },
      } }
    >
      <DialogActions
        sx={ {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        } }
      >
        <AlarmIcon fontSize="large" sx={ { mb: 4,animation: `${pulse} 2s infinite`, } }/>
        <Button
          onClick={ handleDismiss }
          disabled={ isDismissing }
          color="error"
          variant="contained"
        >
          Dismiss Alarm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
