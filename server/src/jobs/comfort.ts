// Room-temperature compensation for scheduled temperatures, plus a comfort log
// (/persistent/free-sleep-data/comfort-log.jsonl) of adjustments and sensor snapshots
// to learn from later.
import fs from 'fs';
import comfortDB from '../db/comfort.js';
import { readLatestSensors, SensorSnapshot } from '../8sleep/rawSensors.js';
import logger from '../logger.js';

const COMFORT_LOG = '/persistent/free-sleep-data/comfort-log.jsonl';
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

const latestSensors = (): SensorSnapshot | null => {
  try {
    return readLatestSensors();
  } catch (error) {
    logger.warn(`Comfort: could not read RAW sensors: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

export type AmbientOffset = { offsetF: number; roomF: number | null };

export const getAmbientOffset = async (): Promise<AmbientOffset> => {
  try {
    await comfortDB.read();
    const { enabled, baseRoomF, gain, maxOffsetF } = comfortDB.data.ambientCompensation;
    const roomF = latestSensors()?.roomF ?? null;
    if (!enabled || roomF === null) return { offsetF: 0, roomF };

    const offsetF = Math.round(Math.min(maxOffsetF, Math.max(0, gain * (baseRoomF - roomF))));
    return { offsetF, roomF };
  } catch (error) {
    logger.error(error);
    return { offsetF: 0, roomF: null };
  }
};

export const logComfortEvent = (event: string, details: Record<string, unknown> = {}, sensors = latestSensors()) => {
  const line = JSON.stringify({ ...details, time: new Date().toISOString(), event, sensors });
  fs.appendFile(COMFORT_LOG, `${line}\n`, (error) => {
    if (error) logger.warn(`Comfort: could not write log: ${error.message}`);
  });
};

// Snapshot the sensors every few minutes while either side is heating or cooling
export const startComfortSnapshots = () => {
  setInterval(() => {
    const sensors = latestSensors();
    if (sensors?.heatingEnabled?.left || sensors?.heatingEnabled?.right) {
      logComfortEvent('snapshot', {}, sensors);
    }
  }, SNAPSHOT_INTERVAL_MS);
};
