import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { Telemetry } from '../../../server/src/db/telemetrySchema.ts';
import { BedSnapshot } from '@lib/bedPhase.ts';
export type { Telemetry };

// One snapshot of every sensor and I/O value, refreshed every few seconds while the page is open
export const useTelemetry = () => useQuery<Telemetry>({
  queryKey: ['useTelemetry'],
  queryFn: async () => (await axios.get<Telemetry>('/telemetry')).data,
  refetchInterval: 5_000,
});

// Whether bed control is on (temperatures mean the bed surface, not the water); read once per page
export const useBedControlEnabled = () => useQuery<Telemetry, Error, boolean>({
  queryKey: ['useTelemetry'],
  queryFn: async () => (await axios.get<Telemetry>('/telemetry')).data,
  select: (t) => t.controls.bedControl,
  staleTime: 5 * 60_000,
});

const SNAPSHOT_MAX_AGE_MS = 60_000;

// Per-side readings for the Temperature page's wording. Null without bed control or a recent reply,
// which falls back to comparing the bed with its target.
export const useBedSnapshots = (): Record<'left' | 'right', BedSnapshot | null> => {
  const { data, dataUpdatedAt } = useQuery<Telemetry>({
    queryKey: ['useTelemetry'],
    queryFn: async () => (await axios.get<Telemetry>('/telemetry')).data,
    refetchInterval: 10_000,
  });
  const snapshot = (side: 'left' | 'right'): BedSnapshot | null => {
    if (!data?.controls.bedControl || Date.now() - dataUpdatedAt > SNAPSHOT_MAX_AGE_MS) return null;
    return {
      bedF: data.cover.sides[side].bedF,
      waterF: data.hub.sides[side].waterF,
      waterTargetF: data.hub.sides[side].targetF,
      present: data.cover.sides[side].presence.present,
    };
  };
  return { left: snapshot('left'), right: snapshot('right') };
};
