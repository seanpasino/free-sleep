import { QueryClient } from '@tanstack/react-query';

import { DeviceStatus } from '@api/deviceStatusSchema.ts';
import { postDeviceStatus } from '@api/deviceStatus.ts';
import { reportError, Side, useAppStore } from '@state/appStore.tsx';
import { PENDING_TIMEOUT_MS, useControlTempStore } from './controlTempStore.tsx';

export const DEVICE_STATUS_QUERY_KEY = ['useDeviceStatus'];


// Posts the side's pending target (read at send time, so a debounced send never
// uses a stale value) and refreshes the device status once the Pod has it
export const sendPendingTarget = async (queryClient: QueryClient, side: Side) => {
  const { pendingTarget, markPendingSent, clearPendingTarget } = useControlTempStore.getState();
  const pending = pendingTarget[side];
  if (!pending) return;

  markPendingSent(side);
  try {
    await postDeviceStatus({ [side]: { targetTemperatureF: pending.temperatureF } });
  } catch (error) {
    // Only drop the pending value if the user hasn't picked a newer one meanwhile
    if (useControlTempStore.getState().pendingTarget[side]?.temperatureF === pending.temperatureF) {
      clearPendingTarget(side);
    }
    reportError('change the temperature', error);
  }
  await queryClient.invalidateQueries({ queryKey: DEVICE_STATUS_QUERY_KEY });
};


// Called on every device-status poll: drops pending targets the Pod now reports,
// or that have waited longer than PENDING_TIMEOUT_MS
export const reconcilePendingTargets = (deviceStatus: DeviceStatus) => {
  const { pendingTarget, clearPendingTarget } = useControlTempStore.getState();
  (['left', 'right'] as Side[]).forEach((side) => {
    const pending = pendingTarget[side];
    if (!pending?.sentAt) return;
    const confirmed = deviceStatus[side]?.targetTemperatureF === pending.temperatureF;
    const expired = Date.now() - pending.sentAt > PENDING_TIMEOUT_MS;
    if (confirmed) {
      clearPendingTarget(side);
    } else if (expired) {
      clearPendingTarget(side);
      useAppStore.getState().notify('The Pod didn\'t confirm the temperature change. Showing its current setting.');
    }
  });
};
