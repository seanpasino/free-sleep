import moment from 'moment-timezone';
import { DayOfWeek } from '@api/schedulesSchema.ts';

// Schedules are keyed by night: "monday" runs Monday evening into Tuesday morning,
// so before noon the night in progress is yesterday's
export const getCurrentNight = (timeZone?: string): DayOfWeek => {
  const now = timeZone ? moment.tz(timeZone) : moment();
  return now.subtract(12, 'hours').format('dddd').toLowerCase() as DayOfWeek;
};

// '21:30' -> '9:30 PM'
export const formatClock = (hhmm?: string) => (hhmm ? moment(hhmm, 'HH:mm').format('h:mm A') : '');
