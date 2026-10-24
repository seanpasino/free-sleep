import _ from 'lodash';
import { create } from 'zustand';
import { Side } from '@state/appStore.tsx';


// A target the user has picked (dial or +/-) that the Pod hasn't reported back yet.
// While it exists it is shown instead of the polled value, so the 5s device-status
// poll can't snap the dial back mid-drag or overwrite a debounced +/- change.
type PendingTarget = {
  temperatureF: number;
  // Set once the change has been posted; the pending value is dropped when the Pod
  // reports it, or after PENDING_TIMEOUT_MS so a lost update can't stick forever
  sentAt?: number;
};

type ControlTempStore = {
  pendingTarget: Partial<Record<Side, PendingTarget>>;
  setPendingTarget: (side: Side, temperatureF: number) => void;
  markPendingSent: (side: Side) => void;
  clearPendingTarget: (side: Side) => void;
};

export const PENDING_TIMEOUT_MS = 15_000;

export const useControlTempStore = create<ControlTempStore>((set, get) => ({
  pendingTarget: {},
  setPendingTarget: (side, temperatureF) => set({
    pendingTarget: { ...get().pendingTarget, [side]: { temperatureF } },
  }),
  markPendingSent: (side) => {
    const pending = get().pendingTarget[side];
    if (!pending) return;
    set({ pendingTarget: { ...get().pendingTarget, [side]: { ...pending, sentAt: Date.now() } } });
  },
  clearPendingTarget: (side) => set({ pendingTarget: _.omit(get().pendingTarget, side) }),
}));
