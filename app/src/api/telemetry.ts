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
