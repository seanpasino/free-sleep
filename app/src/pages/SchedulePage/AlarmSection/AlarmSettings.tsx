import { Box, SxProps } from '@mui/material';
import { useScheduleStore } from '../scheduleStore.tsx';
import AlarmEnabledSwitch from './AlarmEnabledSwitch.tsx';
import AlarmTime from './AlarmTime.tsx';
import AlarmVibrationSlider from './AlarmVibrationSlider.tsx';
import AlarmDuration from './AlarmDuration.tsx';
import AlarmPattern from './AlarmPattern.tsx';
import React from 'react';
import AlarmTest from './AlarmTest.tsx';

const Row = ({ children, sx }: React.PropsWithChildren<{ sx?: SxProps }>) => (
  <Box
    sx={ {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      mb: 2,
      pl: 2,
      pr: 2,
      gap: 1,
      ...sx,
    } }
  >
    { children }
  </Box>
);

// eslint-disable-next-line react/no-multi-comp
export default function AlarmSettings() {
  const { selectedSchedule } = useScheduleStore();

  return (
    <Box sx={ { width: '100%', mx: -2 } }>
      <Row>
        <AlarmEnabledSwitch/>
        { selectedSchedule?.alarm.enabled && <AlarmTime/> }
      </Row>
      {
        selectedSchedule?.alarm.enabled &&
        (
          <>
            <Row>
              <AlarmDuration/>
              <AlarmPattern/>
            </Row>
            <Row sx={ { ml: 3, mr: 3 } }>
              <AlarmVibrationSlider/>
            </Row>
            <AlarmTest />
          </>
        )
      }
    </Box>
  );
}
