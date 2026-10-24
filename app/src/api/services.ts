import axios from './api';
import { useQuery } from '@tanstack/react-query';

// WARNING! - Any changes here MUST be the same between app/src/api & server/src/db/
import { Services } from '../../../server/src/db/servicesSchema.ts';
import { DeepPartial } from 'ts-essentials';
import { closeSentry, initSentry } from '../sentry.tsx';
export * from '../../../server/src/db/servicesSchema.ts';


export const useServices = () => {
  return useQuery<Services>({
    queryKey: ['useServices'],
    queryFn: async () => {
      const response = await axios.get<Services>('/services');
      return response.data;
    },
  });
};

export const postServices = (services: DeepPartial<Services>) => {
  // Only react to the Sentry toggle itself; other feature toggles leave it alone
  if (services?.sentryLogging?.enabled === false) {
    closeSentry();
  } else if (services?.sentryLogging?.enabled === true) {
    initSentry();
  }
  return axios.post('/services', services);
};

