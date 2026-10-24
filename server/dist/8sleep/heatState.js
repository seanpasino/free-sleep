import { execSync } from 'child_process';
import logger from '../logger.js';
// If a side has been "enabled" but we haven't seen a re-assertion in this long,
// stop confidently claiming it's running (the firmware re-asserts every ~3-4
// min while on, so silence this long means our view is stale). Fails safe to
// null -> the UI falls back to plain isOn behavior.
const ACTIVE_STALE_MS = 12 * 60 * 1000;
const SET_SIDE_REGEX = /set_side (left|right) (enabled|disabled)/;
const state = {
    left: { active: null, updatedAt: null },
    right: { active: null, updatedAt: null },
};
// Feed a single journal line in; updates state if it's a set_side event.
export const recordHeatStateLine = (line) => {
    const match = line.match(SET_SIDE_REGEX);
    if (!match)
        return;
    const side = match[1];
    state[side] = { active: match[2] === 'enabled', updatedAt: Date.now() };
};
export const getHeatActive = (side) => {
    const { active, updatedAt } = state[side];
    if (active === true && updatedAt !== null && Date.now() - updatedAt > ACTIVE_STALE_MS) {
        return null;
    }
    return active;
};
// Seed from recent journal history at startup so we don't report `null`
// (unknown) until the firmware's next periodic re-assertion.
export const seedHeatState = () => {
    try {
        const output = execSync("journalctl -u frank --since '-30 min' -o cat --no-pager | grep -E 'set_side (left|right) (enabled|disabled)' || true", { encoding: 'utf-8', timeout: 5000 });
        // Chronological order — the last match for each side wins.
        for (const line of output.split('\n'))
            recordHeatStateLine(line);
        logger.info(`HeatState seeded: left=${state.left.active}, right=${state.right.active}`);
    }
    catch (err) {
        logger.error(err);
    }
};
//# sourceMappingURL=heatState.js.map