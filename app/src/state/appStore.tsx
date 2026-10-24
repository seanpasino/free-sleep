import React, { useEffect } from 'react';
import { create } from 'zustand';
import moment from 'moment-timezone';

import { useSettings } from '@api/settings.ts';
import { useDeviceStatus } from '@api/deviceStatus.ts';

export type Side = 'left' | 'right';

export type Notice = {
  id: number;
  message: string;
  severity: 'error' | 'success';
};

type AppState = {
  isUpdating: boolean;
  setIsUpdating: (isUpdating: boolean) => void;
  side: Side;
  setSide: (side: Side) => void;

  // Toast shown by <Notices/>; the latest one replaces any previous one
  notice: Notice | undefined;
  notify: (message: string, severity?: Notice['severity']) => void;
  clearNotice: () => void;

  // Set by pages with unsaved edits (schedules) so navigation can warn first
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  confirmDiscardChanges: () => boolean;
};

const SIDE_KEY = 'side';
// Written by older builds only for error reporting (Sentry, now removed); cleared on load
const LEGACY_SENTRY_KEYS = ['user_id', 'pod_version', 'cover_version'];

// Create Zustand store
const readStoredSide = (): Side => {
  try {
    const stored = localStorage.getItem(SIDE_KEY);
    return stored === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
};

let noticeId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  isUpdating: false,
  setIsUpdating: (isUpdating: boolean) => set({ isUpdating }),
  side: readStoredSide(),
  setSide: (side: Side) => {
    if (side !== 'left' && side !== 'right') return;
    set({ side });
    try {
      localStorage.setItem(SIDE_KEY, side);
    } catch {
      // Private mode / blocked storage: the side just isn't remembered
    }
  },

  notice: undefined,
  notify: (message, severity = 'error') => set({ notice: { id: ++noticeId, message, severity } }),
  clearNotice: () => set({ notice: undefined }),

  hasUnsavedChanges: false,
  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),
  confirmDiscardChanges: () => {
    if (!get().hasUnsavedChanges) return true;
    const discard = window.confirm('You have unsaved schedule changes. Discard them?');
    if (discard) set({ hasUnsavedChanges: false });
    return discard;
  },
}));

// Logs the error and shows it to the user instead of failing silently
export const reportError = (action: string, error: unknown) => {
  console.error(error);
  useAppStore.getState().notify(`Couldn't ${action}. Check the Pod's connection and try again.`);
};

// AppStoreProvider to sync Zustand with react-query's isFetching
export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const { data: settings } = useSettings();
  // Keeps the device-status poll running on every page
  useDeviceStatus();

  useEffect(() => {
    if (!settings) return;
    moment.tz.setDefault(settings.timeZone);
  }, [settings]);

  useEffect(() => {
    try {
      LEGACY_SENTRY_KEYS.forEach(key => localStorage.removeItem(key));
    } catch {
      // Blocked storage: nothing to clear
    }
  }, []);

  return <>{ children }</>;
}
