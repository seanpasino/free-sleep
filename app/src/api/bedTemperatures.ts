import { useState } from 'react';
import moment from 'moment-timezone';
import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { BedTemperatureRecord } from '../../../server/src/db/bedTemperatureSchema.ts';
export type { BedTemperatureRecord };

const LIVE_LOOKBACK_HOURS = 24;

interface BedTemperatureQueryParams {
  startTime: string; // ISO 8601
  endTime?: string; // ISO 8601, default now
}

export const useBedTemperatures = (params: BedTemperatureQueryParams, enabled = true, refetchInterval: number | false = false) => {
  return useQuery<BedTemperatureRecord[]>({
    queryKey: ['useBedTemperatures', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams({ startTime: params.startTime });
      if (params.endTime) queryParams.append('endTime', params.endTime);
      const response = await axios.get<BedTemperatureRecord[]>(`/metrics/bedTemperatures?${queryParams.toString()}`);
      return response.data;
    },
    enabled,
    refetchInterval,
  });
};

// The last day of minutes, refreshed every minute while `live`. The start is fixed when the page
// mounts so the query key stays the same between renders.
export const useLiveBedTemperatures = (live = true) => {
  const [startTime] = useState(() => moment().subtract(LIVE_LOOKBACK_HOURS, 'hours').startOf('hour').toISOString());
  return useBedTemperatures({ startTime }, true, live ? 60_000 : false);
};
