// The schedule's power-off ends the heating, not the night: lying in after the side turns off
// is still time in bed. So the sleep analysis waits until the side has read empty for
// EMPTY_MINUTES, then analyzes up to that moment. The sensors keep recording with the side off.
// A pending analysis is saved to disk so the daily reboot (or a restart) doesn't lose it.
import fs from 'fs';
import moment from 'moment-timezone';
import logger from '../logger.js';
import { isPresent } from '../routes/metrics/presence.js';
import { executeAnalyzeSleep } from './analyzeSleep.js';
const PENDING_FILE = '/persistent/free-sleep-data/pending-sleep-analysis.json';
const EMPTY_MINUTES = 15; // Empty this long (by the biometrics stream's presence) ends the night
const MAX_WAIT_HOURS = 6; // Analyze anyway this long after power-off
const LOOKBACK_HOURS = 12; // Analysis window starts this long before power-off
const POLL_MS = 60 * 1000;
const waiters = {};
const readPending = () => {
    try {
        return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    }
    catch {
        return {};
    }
};
const writePending = (side, offAt) => {
    const pending = readPending();
    if (offAt === null) {
        delete pending[side];
    }
    else {
        pending[side] = { offAt: offAt.toISOString() };
    }
    try {
        fs.writeFileSync(PENDING_FILE, JSON.stringify(pending));
    }
    catch (error) {
        logger.warn(`Sleep analysis: could not write pending state: ${error instanceof Error ? error.message : String(error)}`);
    }
};
const runAnalysis = (side, offAt, endAt) => {
    const waiter = waiters[side];
    if (waiter)
        clearInterval(waiter);
    delete waiters[side];
    writePending(side, null);
    logger.info(`Sleep analysis: analyzing ${side} side up to ${endAt.toISOString()} (power-off was ${offAt.toISOString()})`);
    executeAnalyzeSleep(side, offAt.clone().subtract(LOOKBACK_HOURS, 'hours').toISOString(), endAt.toISOString());
};
const watch = (side, offAt) => {
    let emptySince = null;
    const check = () => {
        const now = moment();
        if (isPresent(side)) {
            emptySince = null;
        }
        else if (emptySince === null) {
            emptySince = now;
        }
        if (emptySince !== null && now.diff(emptySince, 'minutes', true) >= EMPTY_MINUTES) {
            runAnalysis(side, offAt, now);
        }
        else if (now.diff(offAt, 'hours', true) >= MAX_WAIT_HOURS) {
            logger.info(`Sleep analysis: ${side} side still occupied ${MAX_WAIT_HOURS} h after power-off`);
            runAnalysis(side, offAt, now);
        }
    };
    waiters[side] = setInterval(check, POLL_MS);
    check();
};
// Called at the scheduled power-off instead of analyzing right away
export const analyzeSleepWhenBedEmpty = (side) => {
    if (waiters[side]) {
        logger.info(`Sleep analysis: already waiting for the ${side} side to empty`);
        return;
    }
    const offAt = moment();
    logger.info(`Sleep analysis: waiting until the ${side} side has been empty for ${EMPTY_MINUTES} min`);
    writePending(side, offAt);
    watch(side, offAt);
};
// On startup, pick up an analysis that was still waiting when the server stopped
export const resumePendingSleepAnalysis = () => {
    const pending = readPending();
    for (const side of Object.keys(pending)) {
        const entry = pending[side];
        if (!entry || waiters[side])
            continue;
        const offAt = moment(entry.offAt);
        if (!offAt.isValid()) {
            writePending(side, null);
            continue;
        }
        const deadline = offAt.clone().add(MAX_WAIT_HOURS, 'hours');
        if (moment().isAfter(deadline)) {
            runAnalysis(side, offAt, deadline);
        }
        else {
            logger.info(`Sleep analysis: resuming wait for the ${side} side (power-off was ${offAt.toISOString()})`);
            watch(side, offAt);
        }
    }
};
//# sourceMappingURL=sleepAnalysisWait.js.map