import schedule from 'node-schedule';
import moment from 'moment-timezone';

import { DailySchedule, DayOfWeek, Side, Time } from '../db/schedulesSchema.js';
import { getDayIndexForSchedule, logJob } from './utils.js';
import { Settings } from '../db/settingsSchema.js';
import { TimeZone } from '../db/timeZones.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import serverStatus from '../serverStatus.js';
import settingsDB from '../db/settings.js';
import logger from '../logger.js';
import { getAmbientOffset, isWakeStep, logComfortEvent, recordAppliedOffset } from './comfort.js';


const scheduleAdjustment = (timeZone: TimeZone, side: Side, day: DayOfWeek, time: Time, temperature: number) => {
  const onRule = new schedule.RecurrenceRule();

  const dayOfWeekIndex = getDayIndexForSchedule(day, time);
  const [onHour, onMinute] = time.split(':').map(Number);
  logJob('Scheduling temperature adjustment job', side, day, dayOfWeekIndex, time);

  onRule.dayOfWeek = dayOfWeekIndex;
  onRule.hour = onHour;
  onRule.minute = onMinute;
  onRule.tz = timeZone;

  schedule.scheduleJob(`${side}-${day}-${time}-${temperature}-temperature-adjustment`, onRule, async () => {
    try {
      logJob('Executing temperature adjustment job', side, day, dayOfWeekIndex, time);

      await settingsDB.read();
      if (settingsDB.data[side].scheduleOverrides.temperatureSchedules.expiresAt) {
        const expiresAt = moment(settingsDB.data[side].scheduleOverrides.temperatureSchedules.expiresAt);
        const now = moment();
        if (expiresAt.isAfter(now)) {
          logJob(`Detected temperature schedule override! Skipping temperature adjustment! Override expires at: ${expiresAt.format()}`, side, day, dayOfWeekIndex, time);
          return;
        }
      }

      const wakeStep = await isWakeStep(temperature);
      const { offsetF, roomF } = wakeStep ? { offsetF: 0, roomF: null } : await getAmbientOffset();
      const targetTemperatureF = Math.min(110, temperature + offsetF);
      if (offsetF) {
        logJob(`Room is ${roomF}°F, warming scheduled ${temperature}°F by ${offsetF}°F`, side, day, dayOfWeekIndex, time);
      }
      await updateDeviceStatus({
        [side]: {
          targetTemperatureF,
        }
      });
      recordAppliedOffset(side, wakeStep ? null : offsetF);
      logComfortEvent('schedule', { side, step: time, wakeStep, scheduledF: temperature, offsetF, appliedF: targetTemperatureF, roomF });
      serverStatus.status.temperatureSchedule.status = 'healthy';
      serverStatus.status.temperatureSchedule.message = '';
    } catch (error: unknown) {
      serverStatus.status.temperatureSchedule.status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      serverStatus.status.temperatureSchedule.message = message;
      logger.error(error);
    }
  });
};

export const scheduleTemperatures = (settingsData: Settings, side: Side, day: DayOfWeek, temperatures: DailySchedule['temperatures']) => {
  if (settingsData[side].awayMode) return;
  const { timeZone } = settingsData;
  if (timeZone === null) return;

  Object.entries(temperatures).forEach(([time, temperature]) => {
    scheduleAdjustment(timeZone, side, day, time, temperature);
  });
};
