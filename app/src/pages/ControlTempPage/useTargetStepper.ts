import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Side } from '@state/appStore.tsx';
import { MAX_TEMP_F, MIN_TEMP_F } from '@lib/temperatureConversions.ts';
import { useControlTempStore } from './controlTempStore.tsx';
import { sendPendingTarget } from './targetTemperature.ts';

const DEBOUNCE_MS = 2000;

// +/- buttons and the dial's arrow keys: nudge the pending target and send it once
// the taps stop. One timer per side, so switching sides mid-debounce can't cancel
// the other side's send; not cleared on unmount, so a tap just before leaving the
// page still gets sent.
export function useTargetStepper(side: Side, targetTemperatureF: number) {
  const queryClient = useQueryClient();
  const setPendingTarget = useControlTempStore(state => state.setPendingTarget);
  const debounceTimers = useRef<Partial<Record<Side, ReturnType<typeof setTimeout>>>>({});

  return (delta: number) => {
    const next = Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, targetTemperatureF + delta));
    if (next === targetTemperatureF) return;
    setPendingTarget(side, next);
    clearTimeout(debounceTimers.current[side]);
    debounceTimers.current[side] = setTimeout(() => void sendPendingTarget(queryClient, side), DEBOUNCE_MS);
  };
}
