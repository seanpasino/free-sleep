import schedule from 'node-schedule';
import moment from 'moment-timezone';
import { getDayIndexForSchedule, logJob } from './utils.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import serverStatus from '../serverStatus.js';
import settingsDB from '../db/settings.js';
import logger from '../logger.js';
import { getAmbientOffset, isWakeStep, logComfortEvent, recordAppliedOffset, surfaceControlEnabled } from './comfort.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { MAX_TARGET_F } from '../8sleep/temperatureLevels.js';
// The side's current target, or null when it is off or the Pod can't be read
const currentTargetF = async (side) => {
    try {
        const franken = await connectFranken();
        const status = await franken.getDeviceStatus(false);
        return status[side].isOn ? status[side].targetTemperatureF : null;
    }
    catch (error) {
        logger.warn(`Could not read the current ${side} target: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
};
const scheduleAdjustment = (timeZone, side, day, time, temperature) => {
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
            // Bed control holds the bed temperature itself, so skip the room offset.
            const surfaceOn = await surfaceControlEnabled();
            const { offsetF, roomF } = (wakeStep || surfaceOn) ? { offsetF: 0, roomF: null } : await getAmbientOffset();
            let targetTemperatureF = Math.min(MAX_TARGET_F, temperature + offsetF);
            if (offsetF) {
                logJob(`Room is ${roomF}°F, warming scheduled ${temperature}°F by ${offsetF}°F`, side, day, dayOfWeekIndex, time);
            }
            // A wake step only ever warms the bed. The room offset and re-checks can already have carried
            // the bed above it (2026-10-24: the 08:30 86°F step cooled the bed from 87°F).
            const currentF = wakeStep ? await currentTargetF(side) : null;
            if (currentF !== null && currentF > targetTemperatureF) {
                logJob(`Wake step: keeping ${currentF}°F instead of scheduled ${temperature}°F`, side, day, dayOfWeekIndex, time);
                targetTemperatureF = currentF;
            }
            await updateDeviceStatus({
                [side]: {
                    targetTemperatureF,
                }
            });
            recordAppliedOffset(side, (wakeStep || surfaceOn) ? null : offsetF);
            logComfortEvent('schedule', {
                side, step: time, wakeStep, scheduledF: temperature, offsetF, currentF, appliedF: targetTemperatureF, roomF,
            });
            serverStatus.status.temperatureSchedule.status = 'healthy';
            serverStatus.status.temperatureSchedule.message = '';
        }
        catch (error) {
            serverStatus.status.temperatureSchedule.status = 'failed';
            const message = error instanceof Error ? error.message : String(error);
            serverStatus.status.temperatureSchedule.message = message;
            logger.error(error);
        }
    });
};
export const scheduleTemperatures = (settingsData, side, day, temperatures) => {
    if (settingsData[side].awayMode)
        return;
    const { timeZone } = settingsData;
    if (timeZone === null)
        return;
    Object.entries(temperatures).forEach(([time, temperature]) => {
        scheduleAdjustment(timeZone, side, day, time, temperature);
    });
};
//# sourceMappingURL=temperatureScheduler.js.map