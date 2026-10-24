import { useEffect } from 'react';
import Button from '@mui/material/Button';
import { Alert, Box, CircularProgress, Skeleton } from '@mui/material';

import AlarmDismissal from './AlarmDismissal.tsx';
import AlarmNotification from './AlarmNotification.tsx';
import AwayNotification from './AwayNotification.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import PageContainer from '../PageContainer.tsx';
import PowerButton from './PowerButton.tsx';
import PrimingNotification from './PrimingNotification.tsx';
import SideControl from '../../components/SideControl.tsx';
import Slider from './Slider.tsx';
import WaterNotification from './WaterNotification.tsx';
import { useAppStore } from '@state/appStore.tsx';
import { reconcilePendingTargets } from './targetTemperature.ts';
import { useDeviceStatus } from '@api/deviceStatus';
import { useSettings } from '@api/settings.ts';
import { useTheme } from '@mui/material/styles';


export default function ControlTempPage() {
  const { isError, refetch, data: deviceStatus, dataUpdatedAt } = useDeviceStatus();
  const { data: settings } = useSettings();
  const { isUpdating, side } = useAppStore();
  const theme = useTheme();

  const sideStatus = deviceStatus?.[side];
  const isOn = sideStatus?.isOn || false;

  useEffect(() => {
    refetch();
  }, [side]);

  // dataUpdatedAt changes on every successful poll, even when the data is identical,
  // so expired pending targets are still cleared when nothing else changes
  useEffect(() => {
    if (!deviceStatus) return;
    reconcilePendingTargets(deviceStatus);
  }, [dataUpdatedAt]);

  return (
    <PageContainer
      sx={ {
        maxWidth: '500px',
        [theme.breakpoints.up('md')]: {
          maxWidth: '400px',
        },
      } }
    >
      { isError && deviceStatus && (
        <Alert severity="warning" sx={ { width: '100%' } }>
          Can't reach the Pod. Showing the last known status.
        </Alert>
      ) }

      { sideStatus ? (
        <Slider
          isOn={ isOn }
          isActive={ sideStatus.isActive }
          currentTargetTemp={ sideStatus.targetTemperatureF }
          currentTemperatureF={ sideStatus.currentTemperatureF }
          displayCelsius={ settings?.temperatureFormat === 'celsius' || false }
        />
      ) : (
        // No data yet: show a placeholder instead of a made-up 55°F
        <Skeleton variant="circular" sx={ { width: '100%', maxWidth: '400px', height: 'auto', aspectRatio: '1' } }/>
      ) }

      { isError && !deviceStatus ? (
        <Button
          variant="contained"
          onClick={ () => refetch() }
        >
          Try again
        </Button>
      ) : sideStatus && (
        <PowerButton isOn={ isOn }/>
      ) }

      <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1 } }>
        {
          deviceStatus?.isPriming && (
            <PrimingNotification/>
          )
        }
        <ErrorBoundary componentName='Alarm notification'>
          <AlarmNotification/>
        </ErrorBoundary>
        <AwayNotification settings={ settings }/>
        <WaterNotification/>
      </Box>
      <AlarmDismissal/>
      { isUpdating && <CircularProgress/> }
      <SideControl showTemp={ true }/>
    </PageContainer>
  );
}
