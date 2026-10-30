// Bed (surface) temperature control. With comfortDB `surfaceControl.enabled`, the temperature the app,
// HA, the side buttons and schedules show and set is the bed surface temperature, not the water's.
// The firmware only takes a water target, so each side keeps a bed setpoint and an offset here:
// water target = setpoint + offset. A setpoint change moves the water by the same amount at once;
// every minute, the offset is nudged so the measured bed temperature holds the setpoint as the room
// and body heat drift. State: /persistent/free-sleep-data/bed-state.json.
import fs from 'fs';
import comfortDB from '../db/comfort.js';
import logger from '../logger.js';
import { readLatestSensors } from './rawSensors.js';
import { levelToF, MAX_TARGET_F, MIN_TARGET_F } from './temperatureLevels.js';
const BED_STATE = '/persistent/free-sleep-data/bed-state.json';
// Bed temperature = median of the center probe over 5 min (sheds the ~0.2°F sample jitter)
const SURFACE_WINDOW_MS = 5 * 60 * 1000;
const SURFACE_STALE_SECONDS = 10 * 60;
// Offset change per minute per °F of error. Slow next to the 15-20 min the water and then the bed
// take to respond (integral time ~50 min), so it settles instead of oscillating.
const GAIN_PER_MIN = 0.02;
// Leave it alone this close to the setpoint (one firmware level is ~0.2-0.3°F)
const DEADBAND_F = 0.3;
const MAX_OFFSET_F = 10;
const samples = { left: [], right: [] };
// Last water target the firmware reported, per side (noted by loadDeviceStatus)
const waterTarget = {};
export const bedControlEnabled = () => comfortDB.data.surfaceControl?.enabled === true;
const clampF = (f) => Math.min(MAX_TARGET_F, Math.max(MIN_TARGET_F, f));
const probeValue = (zones) => {
    switch (comfortDB.data.surfaceControl?.probe) {
        case 'avg': return (zones.out + zones.cen + zones.in) / 3;
        case 'max': return Math.max(zones.out, zones.cen, zones.in);
        case 'min': return Math.min(zones.out, zones.cen, zones.in);
        default: return zones.cen;
    }
};
// Called every minute with the latest RAW sensor snapshot
export const sampleSurface = (sensors) => {
    const now = Date.now();
    if (sensors?.surfaceF && now / 1000 - sensors.ts < SURFACE_STALE_SECONDS) {
        samples.left.push({ at: now, f: probeValue(sensors.surfaceF.left) });
        samples.right.push({ at: now, f: probeValue(sensors.surfaceF.right) });
    }
    for (const side of ['left', 'right']) {
        while (samples[side].length && now - samples[side][0].at > SURFACE_WINDOW_MS)
            samples[side].shift();
    }
};
// Current bed temperature for a side, or null when there is no fresh reading
export const bedTemperatureF = (side) => {
    if (samples[side].length === 0) {
        try {
            sampleSurface(readLatestSensors());
        }
        catch {
            return null;
        }
    }
    const sorted = samples[side].map(s => s.f).sort((a, b) => a - b);
    if (sorted.length === 0)
        return null;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.round(median * 10) / 10;
};
const readState = () => {
    try {
        return JSON.parse(fs.readFileSync(BED_STATE, 'utf8'));
    }
    catch {
        return {};
    }
};
const writeState = (state) => {
    try {
        fs.writeFileSync(BED_STATE, JSON.stringify(state));
    }
    catch (error) {
        logger.warn(`BedControl: could not write state: ${error instanceof Error ? error.message : String(error)}`);
    }
};
export const noteWaterTarget = (side, level) => {
    waterTarget[side] = { level, f: levelToF(level) };
};
export const waterTargetLevel = (side) => waterTarget[side]?.level ?? null;
// A side's setpoint and offset. The first time (bed control just switched on) it is seeded from the
// current bed temperature, with the offset that keeps the water where it is, so nothing moves.
export const bedSide = (side) => {
    const state = readState();
    const existing = state[side];
    if (existing)
        return existing;
    const bedF = bedTemperatureF(side);
    const water = waterTarget[side];
    if (bedF === null || !water)
        return null;
    const setpointF = clampF(Math.round(bedF));
    const seeded = { setpointF, offsetF: water.f - setpointF };
    state[side] = seeded;
    writeState(state);
    logger.info(`BedControl: ${side} bed setpoint seeded at ${setpointF}°F (bed ${bedF}°F, water ${water.f}°F)`);
    return seeded;
};
// New bed setpoint from the app, HA, a button or a schedule. Returns the water target to send:
// it moves by the same amount as the setpoint.
export const setBedSetpoint = (side, setpointF) => {
    const offsetF = bedSide(side)?.offsetF ?? 0;
    const state = readState();
    const updated = { setpointF: clampF(setpointF), offsetF };
    state[side] = updated;
    writeState(state);
    return clampF(updated.setpointF + offsetF);
};
// One minute of correction for a side that is on. Returns the water target to hold the bed at the
// setpoint, or null to leave the water alone.
export const correctBed = (side) => {
    const current = bedSide(side);
    const bedF = bedTemperatureF(side);
    if (!current || bedF === null)
        return null;
    const errorF = current.setpointF - bedF;
    if (Math.abs(errorF) < DEADBAND_F)
        return null;
    const offsetF = Math.max(-MAX_OFFSET_F, Math.min(MAX_OFFSET_F, current.offsetF + GAIN_PER_MIN * errorF));
    const waterF = current.setpointF + offsetF;
    // At the Pod's range limit more offset does nothing, so don't let it pile up
    if (waterF !== clampF(waterF))
        return null;
    const state = readState();
    state[side] = { setpointF: current.setpointF, offsetF };
    writeState(state);
    return { waterF, setpointF: current.setpointF, bedF, offsetF };
};
//# sourceMappingURL=bedControl.js.map