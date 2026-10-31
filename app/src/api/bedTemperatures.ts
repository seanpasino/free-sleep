import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { BedTemperatureRecord } from '../../../server/src/db/bedTemperatureSchema.ts';
export type { BedTemperatureRecord };

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
