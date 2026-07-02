import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { DeepPartial } from 'ts-essentials';
import { DeviceStatus } from './deviceStatusSchema';


export const getDeviceStatus = async () => {
  return axios.get<DeviceStatus>('/deviceStatus');
};

export const useDeviceStatus = () => useQuery<DeviceStatus>({
  queryKey: ['useDeviceStatus'],
  queryFn: async () => {
    const response = await getDeviceStatus();
    return response.data;
  },
  // 5s so the UI reflects out-of-band changes (physical buttons, and the
  // firmware's deferred power actuation / isActive) promptly. Each poll is a
  // ~20ms local socket read on the Pod, so this is cheap.
  refetchInterval: 5_000,
});


export const postDeviceStatus = (deviceStatus: DeepPartial<DeviceStatus>) => {
  return axios.post('/deviceStatus', deviceStatus);
};



