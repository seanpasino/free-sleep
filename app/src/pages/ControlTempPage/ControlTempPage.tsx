import { useEffect } from 'react';
import moment from 'moment-timezone';
import NightsStayOutlined from '@mui/icons-material/NightsStayOutlined';
import { Alert, Box, Button, Skeleton, Typography } from '@mui/material';

import AlarmDismissal from './AlarmDismissal.tsx';
import AlarmNotification from './AlarmNotification.tsx';
import AwayNotification from './AwayNotification.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import PageContainer from '../PageContainer.tsx';
import Pill from '@components/Pill.tsx';
import PodStatusPill from './PodStatusPill.tsx';
import PowerButton from './PowerButton.tsx';
import PrimingNotification from './PrimingNotification.tsx';
import SideCards from '@components/SideCards.tsx';
import TonightCard from '@components/TonightCard.tsx';
import TemperatureControl from './TemperatureControl.tsx';
import TonightOverrides from './TonightOverrides.tsx';
import WaterNotification from './WaterNotification.tsx';
import { COLORS } from '../../theme.ts';
import { formatClock, getCurrentNight } from '@lib/night.ts';
import { reconcilePendingTargets } from './targetTemperature.ts';
import { useAppStore } from '@state/appStore.tsx';
import { useDeviceStatus } from '@api/deviceStatus';
import { useSchedules } from '@api/schedules.ts';
import { useSettings } from '@api/settings.ts';


export default function ControlTempPage() {
  const { isError, refetch, data: deviceStatus, dataUpdatedAt, isFetching } = useDeviceStatus();
  const { data: settings } = useSettings();
  const { data: schedules } = useSchedules();
  const { side } = useAppStore();

  const sideStatus = deviceStatus?.[side];
  const isOn = sideStatus?.isOn || false;
  const isInAwayMode = !!settings?.[side]?.awayMode;
  const power = schedules?.[side]?.[getCurrentNight(settings?.timeZone)]?.power;
  const showPowerOnTime = power?.enabled && !isInAwayMode ? formatClock(power.on) : undefined;

  useEffect(() => {
    void refetch();
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
        maxWidth: '480px',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: 2.5,
      } }
    >
      <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, mt: 1 } }>
        <Typography component="h1" sx={ { fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' } }>
          Free Sleep
        </Typography>
        { (deviceStatus || isError) && <PodStatusPill online={ !isError }/> }
      </Box>

      { isError && deviceStatus && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={ () => void refetch() } disabled={ isFetching } sx={ { minHeight: 32 } }>
              Retry
            </Button>
          }
        >
          <Box component="span" sx={ { display: 'block', fontWeight: 500 } }>Can't reach the Pod</Box>
          Showing the last status, from { moment(dataUpdatedAt).fromNow() }
        </Alert>
      ) }

      <SideCards/>

      { sideStatus ? (
        <TemperatureControl
          isOn={ isOn }
          isActive={ sideStatus.isActive }
          isInAwayMode={ isInAwayMode }
          currentTargetTemp={ sideStatus.targetTemperatureF }
          currentTemperatureF={ sideStatus.currentTemperatureF }
          displayCelsius={ settings?.temperatureFormat === 'celsius' || false }
          powerOnTime={ showPowerOnTime }
        />
      ) : (
        // No data yet: show a placeholder instead of a made-up 55°F
        <Skeleton
          variant="circular"
          aria-label="Loading"
          sx={ { width: '100%', maxWidth: 320, height: 'auto', aspectRatio: '1', alignSelf: 'center', bgcolor: COLORS.surface } }
        />
      ) }

      { isError && !deviceStatus ? (
        <Button variant="contained" onClick={ () => void refetch() }>
          Try again
        </Button>
      ) : sideStatus && (
        <>
          <Box sx={ { display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' } }>
            { isOn && power?.enabled && (
              <Pill icon={ <NightsStayOutlined/> }>Off at { formatClock(power.off) }</Pill>
            ) }
            <ErrorBoundary componentName='Alarm notification'>
              <AlarmNotification/>
            </ErrorBoundary>
          </Box>
          { !isInAwayMode && <PowerButton isOn={ isOn }/> }
          { !isInAwayMode && (
            <ErrorBoundary componentName="Tonight overrides">
              <TonightOverrides isOn={ isOn }/>
            </ErrorBoundary>
          ) }
          { !isInAwayMode && (
            <ErrorBoundary componentName="Tonight card">
              <TonightCard
                side={ side }
                isOn={ isOn }
                setpointF={ sideStatus.targetTemperatureF }
                displayCelsius={ settings?.temperatureFormat === 'celsius' || false }
              />
            </ErrorBoundary>
          ) }
        </>
      ) }

      <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1 } }>
        { deviceStatus?.isPriming && <PrimingNotification/> }
        <AwayNotification settings={ settings }/>
        <WaterNotification/>
      </Box>
      <AlarmDismissal/>
    </PageContainer>
  );
}
