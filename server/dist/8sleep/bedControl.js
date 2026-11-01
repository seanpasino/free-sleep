// Bed (surface) temperature control. With comfortDB `surfaceControl.enabled`, the temperature the app,
// HA, the side buttons and schedules show and set is the bed surface temperature, not the water's.
// The firmware only takes a water target, so each side keeps a bed setpoint and an offset here:
// water target = setpoint + offset. A setpoint change moves the water by the same amount at once;
// every minute, the offset is nudged so the measured bed temperature holds the setpoint as the room
// and body heat drift. State: /persistent/free-sleep-data/bed-state.json.
import fs from 'fs';
import comfortDB from '../db/comfort.js';
import logger from '../logger.js';
import config from '../config.js';
import { isPresent } from '../routes/metrics/presence.js';
import { readLatestSensors } from './rawSensors.js';
import { levelToF, MAX_TARGET_F, MIN_TARGET_F } from './temperatureLevels.js';
const BED_STATE = '/persistent/free-sleep-data/bed-state.json';
// Bed temperature = median of the chosen probe over 5 min (sheds the ~0.2°F sample jitter)
const SURFACE_WINDOW_MS = 5 * 60 * 1000;
const SURFACE_STALE_SECONDS = 10 * 60;
// Offset change per minute per °F of error (integral time 25 min). With the water's ~15 min and the
// bed's ~23 min lags, a simple model puts the point of oscillation near 0.11, so this keeps a margin of
// about 2.7. Was 0.02 until 2026-11-01, doubled because the user wanted faster correction.
const GAIN_PER_MIN = 0.04;
// Leave it alone this close to the setpoint (one firmware level is ~0.2-0.3°F)
const DEADBAND_F = 0.3;
const MAX_OFFSET_F = 10;
// Faster setpoint changes (comfortDB surfaceControl.boost): the water first moves by (1 + BOOST_GAIN)
// times the change, holds for BOOST_HOLD_MS, then fades back to setpoint + offset over BOOST_FADE_MS.
// Measured 2026-10-31: the center probe follows the water with a time constant of about 23 min, so a
// short, strong push gets there sooner with less overshoot than a long, gentle one.
const BOOST_GAIN = 2;
const BOOST_MAX_F = 6;
const BOOST_MIN_CHANGE_F = 0.5;
const BOOST_HOLD_MS = 8 * 60 * 1000;
const BOOST_FADE_MS = 10 * 60 * 1000;
// Right after a change the gap between bed and setpoint is the mattress catching up, not a wrong
// offset; learning from it winds the offset past where it settles
const LEARN_PAUSE_MS = 45 * 60 * 1000;
// Probe 'body': the bed temperature is the probes weighted by where capacitance finds the sleeper.
// Below this summed rise over the empty-bed baseline there's no reliable position (the stream's
// CapPresence stays confirmed down to the same level), so the center probe is used.
const BODY_MIN_RISE = 1000;
// The stream saves the baseline every 15 min; much older means it isn't running
const CAP_BASELINE_MAX_AGE_S = 24 * 60 * 60;
// A zone just moved onto reads cool until body heat reaches it, so learning waits after a shift
const POSITION_SHIFT = 0.5; // On the position scale below
const POSITION_PAUSE_MS = 10 * 60 * 1000;
const samples = { left: [], right: [] };
// Last water target the firmware reported, per side (noted by loadDeviceStatus)
const waterTarget = {};
export const bedControlEnabled = () => comfortDB.data.surfaceControl?.enabled === true;
const boostEnabled = () => comfortDB.data.surfaceControl?.boost === true;
const clampF = (f) => Math.min(MAX_TARGET_F, Math.max(MIN_TARGET_F, f));
// Share of the body over each zone. Rises are squared because a body also raises the zones next to
// it: on 2026-10-31 lying over `in` raised it 2588 and `cen` 1154, while `in` read 3°F above `cen`.
export const bodyWeights = (cap, baseline) => {
    const rise = {
        out: Math.max(cap.out - baseline.out, 0),
        cen: Math.max(cap.cen - baseline.cen, 0),
        in: Math.max(cap.in - baseline.in, 0),
    };
    if (rise.out + rise.cen + rise.in < BODY_MIN_RISE)
        return null;
    const total = rise.out ** 2 + rise.cen ** 2 + rise.in ** 2;
    return { out: rise.out ** 2 / total, cen: rise.cen ** 2 / total, in: rise.in ** 2 / total };
};
const capBaseline = (side) => {
    try {
        const state = JSON.parse(fs.readFileSync(`${config.dbFolder}cap-baseline-${side}.json`, 'utf8'));
        if (Date.now() / 1000 - state.saved_at > CAP_BASELINE_MAX_AGE_S)
            return null;
        const { out, cen, in: inner } = state.baseline;
        return [out, cen, inner].every(Number.isFinite) ? { out, cen, in: inner } : null;
    }
    catch {
        return null;
    }
};
// Where the sleeper is, -1 (outer edge) to +1 (middle of the bed), while the side is occupied
const position = {};
const notePosition = (side, weights) => {
    const now = weights.in - weights.out;
    const last = position[side];
    if (last && Math.abs(now - last.settled) < POSITION_SHIFT)
        return;
    position[side] = { settled: now, pauseUntil: Date.now() + POSITION_PAUSE_MS };
    const percent = (w) => Math.round(w * 100);
    logger.info(`BedControl: ${side} body position out ${percent(weights.out)}% cen ${percent(weights.cen)}% in ${percent(weights.in)}%, `
        + `learning paused ${POSITION_PAUSE_MS / 60000} min`);
};
const bodyValue = (side, zones, cap) => {
    const baseline = isPresent(side) && cap ? capBaseline(side) : null;
    const weights = baseline && cap ? bodyWeights(cap, baseline) : null;
    if (!weights) {
        if (!isPresent(side))
            delete position[side];
        return zones.cen;
    }
    notePosition(side, weights);
    return weights.out * zones.out + weights.cen * zones.cen + weights.in * zones.in;
};
const probeValue = (side, zones, cap) => {
    switch (comfortDB.data.surfaceControl?.probe) {
        case 'body': return bodyValue(side, zones, cap);
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
        samples.left.push({ at: now, f: probeValue('left', sensors.surfaceF.left, sensors.capacitance?.left) });
        samples.right.push({ at: now, f: probeValue('right', sensors.surfaceF.right, sensors.capacitance?.right) });
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
export const bedSetpointF = (side) => readState()[side]?.setpointF ?? null;
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
// Extra water change still in effect from the last setpoint change
const boostF = (bed, now = Date.now()) => {
    if (!bed.boost)
        return 0;
    const age = now - bed.boost.at;
    if (age < BOOST_HOLD_MS)
        return bed.boost.extraF;
    if (age < BOOST_HOLD_MS + BOOST_FADE_MS)
        return bed.boost.extraF * (1 - (age - BOOST_HOLD_MS) / BOOST_FADE_MS);
    return 0;
};
// The water target that holds a side's bed at its setpoint, boost included
export const bedWaterF = (side) => {
    const bed = bedSide(side);
    return bed ? clampF(bed.setpointF + bed.offsetF + boostF(bed)) : null;
};
export const bedBoostF = (side) => {
    const bed = readState()[side];
    return bed ? Math.round(boostF(bed) * 100) / 100 : 0;
};
// New bed setpoint from the app, HA, a button or a schedule. Returns the water target to send: it
// moves by the same amount as the setpoint, plus a boost when `change` (a side that is already on)
// and boosting is enabled.
export const setBedSetpoint = (side, setpointF, change = false) => {
    const current = bedSide(side);
    const offsetF = current?.offsetF ?? 0;
    const state = readState();
    const updated = { setpointF: clampF(setpointF), offsetF };
    const deltaF = current ? updated.setpointF - current.setpointF : 0;
    if (change && boostEnabled() && Math.abs(deltaF) >= BOOST_MIN_CHANGE_F) {
        const extraF = Math.max(-BOOST_MAX_F, Math.min(BOOST_MAX_F, deltaF * BOOST_GAIN));
        updated.boost = { extraF, at: Date.now() };
        updated.learnAfter = Date.now() + LEARN_PAUSE_MS;
        logger.info(`BedControl: ${side} setpoint ${current?.setpointF}°F -> ${updated.setpointF}°F, boosting water ${extraF > 0 ? '+' : ''}${extraF}°F`);
    }
    else if (current?.learnAfter && current.learnAfter > Date.now()) {
        updated.learnAfter = current.learnAfter;
    }
    state[side] = updated;
    writeState(state);
    return clampF(updated.setpointF + offsetF + boostF(updated));
};
// One minute of learning for a side that is on and occupied: nudges the offset so the measured bed
// temperature holds the setpoint. Returns what it did, or null when it left the offset alone.
export const correctBed = (side) => {
    const current = bedSide(side);
    const bedF = bedTemperatureF(side);
    if (!current || bedF === null)
        return null;
    if (current.learnAfter && current.learnAfter > Date.now())
        return null;
    if ((position[side]?.pauseUntil ?? 0) > Date.now())
        return null;
    const errorF = current.setpointF - bedF;
    if (Math.abs(errorF) < DEADBAND_F)
        return null;
    const offsetF = Math.max(-MAX_OFFSET_F, Math.min(MAX_OFFSET_F, current.offsetF + GAIN_PER_MIN * errorF));
    // At the Pod's range limit more offset does nothing, so don't let it pile up
    if (current.setpointF + offsetF !== clampF(current.setpointF + offsetF))
        return null;
    const state = readState();
    state[side] = { ...current, offsetF };
    writeState(state);
    return { setpointF: current.setpointF, bedF, offsetF };
};
//# sourceMappingURL=bedControl.js.map