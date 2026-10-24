import PowerSettingsNew from '@mui/icons-material/PowerSettingsNew';
import SearchIcon from '@mui/icons-material/Search';
import { Button, Box } from '@mui/material';
import { postDeviceStatus } from '@api/deviceStatus.ts';
import { DeviceStatus } from '@api/deviceStatusSchema.ts';
import { DeepPartial } from 'ts-essentials';
import { reportError, useAppStore } from '@state/appStore.tsx';
import { useSettings } from '@api/settings.ts';
import { useState } from 'react';
import { useServices } from '@api/services.ts';
import { Job, postJobs } from '@api/jobs.ts';
import AnalyzeSleepNotification from './AnalyzeSleepNotification.tsx';
import { useQueryClient } from '@tanstack/react-query';
import { DEVICE_STATUS_QUERY_KEY } from './targetTemperature.ts';


type PowerButtonProps = {
  isOn: boolean;
}

export default function PowerButton({ isOn }: PowerButtonProps) {
  const queryClient = useQueryClient();
  const { side } = useAppStore();
  const { data: settings } = useSettings();
  const { data: services } = useServices();
  // Busy state is local, so toggling power doesn't lock unrelated controls
  const [isSwitching, setIsSwitching] = useState(false);
  const isInAwayMode = settings?.[side].awayMode;
  const disabled = isSwitching || isInAwayMode;
  const [showAnalyzeSleep, setShowAnalyzeSleep] = useState(false);
  const [showAnalyzeNotification, setShowAnalyzeNotification] = useState(false);

  const handleOnClick = (powerOn: boolean) => {
    const deviceStatus: DeepPartial<DeviceStatus> = {
      [side]: {
        isOn: powerOn
      }
    };
    if (powerOn) {
      setShowAnalyzeSleep(false);
    } else {
      setShowAnalyzeSleep(true);
      setTimeout(() => setShowAnalyzeSleep(false), 20_000);
    }

    setIsSwitching(true);
    // Optimistic: flip the cached status (as a new object, never mutating the cache)
    queryClient.setQueryData<DeviceStatus>(DEVICE_STATUS_QUERY_KEY, (current) => current && ({
      ...current,
      [side]: { ...current[side], isOn: powerOn },
    }));
    postDeviceStatus(deviceStatus)
      .catch(error => {
        if (!powerOn) setShowAnalyzeSleep(false);
        reportError(powerOn ? 'turn the side on' : 'turn the side off', error);
      })
      .finally(() => {
        // Either confirms the new state or rolls the optimistic flip back
        void queryClient.invalidateQueries({ queryKey: DEVICE_STATUS_QUERY_KEY });
        setIsSwitching(false);
      });
  };

  const handleAnalyzeSleep = () => {
    const capitalized = side.charAt(0).toUpperCase() + side.slice(1) as Job;
    setShowAnalyzeNotification(true);
    // @ts-expect-error
    postJobs([`analyzeSleep${capitalized}`])
      .catch(error => {
        setShowAnalyzeNotification(false);
        reportError('start the sleep analysis', error);
      });
    setTimeout(() => setShowAnalyzeNotification(false), 120_000);
  };
  if (isInAwayMode) return null;

  const name = settings?.[side]?.name || side;
  // Default names read as "Turn off right side"; custom names as "Turn off Sean"
  const sideLabel = ['left', 'right'].includes(name.toLowerCase()) ? `${name.toLowerCase()} side` : name;

  return (
    <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' } }>
      <Button
        variant="outlined"
        disabled={ disabled }
        onClick={ () => handleOnClick(!isOn) }
        startIcon={ <PowerSettingsNew/> }
        sx={ { height: 52, borderRadius: '14px', fontWeight: 500 } }
        fullWidth
      >
        { isOn ? `Turn off ${sideLabel}` : `Turn on ${sideLabel}` }
      </Button>
      {
        showAnalyzeSleep && !isSwitching && services?.biometrics?.enabled && (
          <Button
            variant="contained"
            disabled={ disabled }
            onClick={ handleAnalyzeSleep }
            startIcon={ <SearchIcon /> }
            fullWidth
          >
            Analyze sleep
          </Button>
        )
      }
      {
        showAnalyzeNotification && (
          <AnalyzeSleepNotification />
        )
      }
    </Box>
  );
}
