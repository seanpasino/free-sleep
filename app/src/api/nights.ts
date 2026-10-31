import axios from './api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedEvent, NightSummary, SleepRating } from '../../../server/src/db/bedTemperatureSchema.ts';
export type { BedEvent, NightSummary, SleepRating };

type Side = 'left' | 'right';
export type Feel = -1 | 0 | 1;

// One summary per night the side was on, newest first
export const useNights = (side: Side, days = 30) => useQuery<NightSummary[]>({
  queryKey: ['useNights', side, days],
  queryFn: async () => (await axios.get<NightSummary[]>(`/metrics/nights?side=${side}&days=${days}`)).data,
});

export const useRating = (side: Side, night: string | undefined) => useQuery<SleepRating | null>({
  queryKey: ['useRating', side, night],
  queryFn: async () => (await axios.get<SleepRating[]>(`/metrics/ratings?side=${side}&night=${night}`)).data[0] ?? null,
  enabled: night !== undefined,
});

export const useSaveRating = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rating: { side: Side; night: string; early?: Feel | null; late?: Feel | null }) => (
      (await axios.post<SleepRating>('/metrics/ratings', rating)).data
    ),
    onSuccess: (saved) => {
      queryClient.setQueryData(['useRating', saved.side, saved.night], saved);
      void queryClient.invalidateQueries({ queryKey: ['useNights', saved.side] });
    },
  });
};

// Button presses, app/HA changes, schedule steps and power, for chart markers
export const useBedEvents = (side: Side, startTime: string | undefined, endTime?: string, refetchInterval: number | false = false) => (
  useQuery<BedEvent[]>({
    queryKey: ['useBedEvents', side, startTime, endTime],
    queryFn: async () => {
      const params = new URLSearchParams({ side, startTime: startTime as string });
      if (endTime) params.append('endTime', endTime);
      return (await axios.get<BedEvent[]>(`/metrics/bedEvents?${params.toString()}`)).data;
    },
    enabled: startTime !== undefined,
    refetchInterval,
  })
);
