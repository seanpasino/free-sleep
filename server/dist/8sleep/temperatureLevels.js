// Converts between °F and the firmware's heating level (-100..100), using the level -> water
// target curve measured on this Pod 5 (2026-10-25, frzTherm targets and frank's
// "set target temp" log lines; matches all 37 measured levels within 0.01°C).
// The curve is three straight segments meeting at level 0 (27°C) and level 50 (36°C).
// Level -100 is a special "cool as hard as possible" target of 10°C, so it is never sent,
// and a reported -100 reads as the -99 end.
const NEUTRAL_C = 27;
const KNEE_LEVEL = 50;
const KNEE_C = 36;
const COOL_C_PER_LEVEL = 0.12; // levels -99..0
const WARM_C_PER_LEVEL = 0.18; // levels 0..50
const HOT_C_PER_LEVEL = 0.12; // levels 50..100
const MIN_LEVEL = -99;
const MAX_LEVEL = 100;
const clampLevel = (level) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
const levelToC = (level) => {
    const clamped = clampLevel(level);
    if (clamped <= 0)
        return NEUTRAL_C + clamped * COOL_C_PER_LEVEL;
    if (clamped <= KNEE_LEVEL)
        return NEUTRAL_C + clamped * WARM_C_PER_LEVEL;
    return KNEE_C + (clamped - KNEE_LEVEL) * HOT_C_PER_LEVEL;
};
// Water temperature for a level, in whole °F (each level is under 0.33°F, so whole degrees
// round-trip through fToLevel exactly)
export const levelToF = (level) => Math.round(levelToC(level) * 9 / 5 + 32);
export const fToLevel = (temperatureF) => {
    const temperatureC = (temperatureF - 32) * 5 / 9;
    let level;
    if (temperatureC <= NEUTRAL_C) {
        level = (temperatureC - NEUTRAL_C) / COOL_C_PER_LEVEL;
    }
    else if (temperatureC <= KNEE_C) {
        level = (temperatureC - NEUTRAL_C) / WARM_C_PER_LEVEL;
    }
    else {
        level = KNEE_LEVEL + (temperatureC - KNEE_C) / HOT_C_PER_LEVEL;
    }
    return clampLevel(Math.round(level));
};
// The whole-degree range the Pod can actually be set to: 59-108°F
export const MIN_TARGET_F = levelToF(MIN_LEVEL);
export const MAX_TARGET_F = levelToF(MAX_LEVEL);
//# sourceMappingURL=temperatureLevels.js.map