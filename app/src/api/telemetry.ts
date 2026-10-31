import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { Telemetry } from '../../../server/src/db/telemetrySchema.ts';
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
