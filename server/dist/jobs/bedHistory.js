// Minute-by-minute bed temperature history (SQLite bed_temperatures, kept RETENTION_DAYS) for the
// web app's Sleep page: every cover probe, the bed temperature the app shows, water and its target,
// room, bed setpoints, hub output, power and presence.
import { prisma } from '../db/prisma.js';
import logger from '../logger.js';
import { bedControlEnabled, bedSetpointF, bedTemperatureF } from '../8sleep/bedControl.js';
import { isPresent } from '../routes/metrics/presence.js';
const RETENTION_DAYS = 30;
const PRUNE_AT_MINUTE = 7;
const round1 = (f) => (typeof f === 'number' && Number.isFinite(f) ? Math.round(f * 10) / 10 : null);
const sideValues = (side, sensors, status) => {
    const surface = sensors.surfaceF?.[side];
    const on = status ? status[side].isOn : null;
    const power = sensors.power?.[side];
    return {
        bed: round1(bedTemperatureF(side)),
        out: round1(surface?.out),
        cen: round1(surface?.cen),
        in: round1(surface?.in),
        side: round1(surface?.side),
        water: round1(sensors.waterF?.[side]),
        waterTarget: round1(sensors.waterTargetF?.[side]),
        setpoint: on && bedControlEnabled() ? bedSetpointF(side) : null,
        power: typeof power === 'number' ? Math.round(power * 1000) / 1000 : null,
        on,
        present: isPresent(side),
    };
};
export const recordBedTemperatures = async (sensors, status) => {
    try {
        if (!sensors?.surfaceF)
            return;
        const now = new Date();
        const timestamp = Math.floor(now.getTime() / 60_000) * 60;
        const l = sideValues('left', sensors, status);
        const r = sideValues('right', sensors, status);
        const row = {
            room: round1(sensors.roomF),
            humidity: round1(sensors.humidity),
            left_bed: l.bed, left_out: l.out, left_cen: l.cen, left_in: l.in, left_side: l.side,
            left_water: l.water, left_water_target: l.waterTarget, left_setpoint: l.setpoint,
            left_power: l.power, left_on: l.on, left_present: l.present,
            right_bed: r.bed, right_out: r.out, right_cen: r.cen, right_in: r.in, right_side: r.side,
            right_water: r.water, right_water_target: r.waterTarget, right_setpoint: r.setpoint,
            right_power: r.power, right_on: r.on, right_present: r.present,
        };
        await prisma.bed_temperatures.upsert({ where: { timestamp }, create: { timestamp, ...row }, update: row });
        if (now.getMinutes() === PRUNE_AT_MINUTE) {
            const cutoff = timestamp - RETENTION_DAYS * 24 * 60 * 60;
            await prisma.bed_temperatures.deleteMany({ where: { timestamp: { lt: cutoff } } });
        }
    }
    catch (error) {
        logger.error(error);
    }
};
//# sourceMappingURL=bedHistory.js.map