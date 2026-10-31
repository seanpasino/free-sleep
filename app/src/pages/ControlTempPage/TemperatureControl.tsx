import { Box } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';

import TemperatureButtons from './TemperatureButtons.tsx';
import TemperatureDial from './TemperatureDial.tsx';
import TemperatureLabel from './TemperatureLabel.tsx';
import { formatTemperature, getDialColor, MAX_TEMP_F, MIN_TEMP_F } from '@lib/temperatureConversions.ts';
import { getBedPhase, isAwaitingBody } from '@lib/bedPhase.ts';
import { useBedSnapshots } from '@api/telemetry.ts';
import { sendPendingTarget } from './targetTemperature.ts';
import { useAppStore } from '@state/appStore';
import { useControlTempStore } from './controlTempStore.tsx';
import { useTargetStepper } from './useTargetStepper.ts';

type TemperatureControlProps = {
  isOn: boolean;
  isActive?: boolean | null;
  isInAwayMode: boolean;
  currentTargetTemp: number;
  currentTemperatureF: number;
  displayCelsius: boolean;
  powerOnTime?: string;
}

export default function TemperatureControl({
  isOn,
  isActive,
  isInAwayMode,
  currentTargetTemp,
  currentTemperatureF,
  displayCelsius,
  powerOnTime,
}: TemperatureControlProps) {
  const queryClient = useQueryClient();
  const { side } = useAppStore();
  const pending = useControlTempStore(state => state.pendingTarget[side]);
  const setPendingTarget = useControlTempStore(state => state.setPendingTarget);
  // Not disabled while a save is in flight: a newer value simply supersedes the pending one
  const disabled = isInAwayMode || !isOn;

  // What the dial shows: the user's not-yet-confirmed pick, else what the Pod reports
  const targetTemperatureF = pending?.temperatureF ?? currentTargetTemp;
  const step = useTargetStepper(side, targetTemperatureF);
  const bed = useBedSnapshots()[side];
  const phase = getBedPhase(currentTargetTemp, currentTemperatureF, isActive, bed);
  const awaitingBody = isAwaitingBody(phase) && targetTemperatureF === currentTargetTemp;

  return (
    <TemperatureDial
      value={ targetTemperatureF }
      current={ currentTemperatureF }
      min={ MIN_TEMP_F }
      max={ MAX_TEMP_F }
      disabled={ disabled }
      color={ awaitingBody ? getDialColor(targetTemperatureF, targetTemperatureF) : getDialColor(targetTemperatureF, currentTemperatureF) }
      awaitingBody={ awaitingBody }
      ariaValueText={
        `${formatTemperature(targetTemperatureF, displayCelsius)}, currently ${formatTemperature(currentTemperatureF, displayCelsius)}`
      }
      onChange={ (value) => setPendingTarget(side, value) }
      onChangeEnd={ () => void sendPendingTarget(queryClient, side) }
      onStep={ step }
    >
      <Box
        sx={ {
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          pb: '9%',
          pointerEvents: 'none',
          textAlign: 'center',
        } }
      >
        <TemperatureLabel
          isOn={ isOn }
          isInAwayMode={ isInAwayMode }
          targetTemperatureF={ targetTemperatureF }
          currentTargetTemp={ currentTargetTemp }
          currentTemperatureF={ currentTemperatureF }
          phase={ phase }
          waterF={ bed?.waterF }
          displayCelsius={ displayCelsius }
          isSending={ !!pending?.sentAt }
          powerOnTime={ powerOnTime }
        />
      </Box>
      { !disabled && <TemperatureButtons targetTemperatureF={ targetTemperatureF } onStep={ step }/> }
    </TemperatureDial>
  );
}
