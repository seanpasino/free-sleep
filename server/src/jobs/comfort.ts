// Room-temperature compensation for scheduled temperatures, plus a comfort log
// (/persistent/free-sleep-data/comfort-log.jsonl) of adjustments and sensor snapshots
// to learn from later.
import fs from 'fs';
import moment from 'moment-timezone';
import comfortDB from '../db/comfort.js';
import settingsDB from '../db/settings.js';
import { Side } from '../db/schedulesSchema.js';
import { readLatestSensors, SensorSnapshot } from '../8sleep/rawSensors.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import logger from '../logger.js';

const COMFORT_LOG = '/persistent/free-sleep-data/comfort-log.jsonl';
// Outside lowdb/ on purpose: writes there make the job scheduler look for changes
const COMFORT_STATE = '/persistent/free-sleep-data/comfort-state.json';
const SNAPSHOT_EVERY_MINUTES = 5;

// Winter heating cycles swing the bedroom ~1°F within the hour, so the room is a 30 min median
const ROOM_WINDOW_MS = 30 * 60 * 1000;
const MIN_ROOM_SAMPLES = 5;
// Between schedule steps, re-check every 15 min (the water settles in 15-20 min) at :07/:22/:37/:52,
// clear of steps on the hour and half hour. Move 1°F at a time, and only once the wanted offset
// is 0.75°F from the applied one so the bed doesn't flap at a rounding edge.
const RECHECK_EVERY_MINUTES = 15;
const RECHECK_AT_MINUTE = 7;
const RECHECK_DEADBAND_F = 0.75;
const RECHECK_SETTLE_MS = 5 * 60 * 1000;
const STATE_MAX_AGE_MS = 14 * 60 * 60 * 1000;

type SideState = { appliedOffsetF: number; at: string };
type ComfortState = Partial<Record<Side, SideState>>;

const roomSamples: { at: number; roomF: number }[] = [];

const latestSensors = (): SensorSnapshot | null => {
  try {
    return readLatestSensors();
  } catch (error) {
    logger.warn(`Comfort: could not read RAW sensors: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const sampleRoom = (sensors = latestSensors()) => {
  const now = Date.now();
  if (typeof sensors?.roomF === 'number') roomSamples.push({ at: now, roomF: sensors.roomF });
  while (roomSamples.length && now - roomSamples[0].at > ROOM_WINDOW_MS) roomSamples.shift();
};

// Median room temperature over the last 30 min; the latest reading until there are enough samples
const medianRoomF = (): number | null => {
  if (roomSamples.length === 0) return null;
  if (roomSamples.length < MIN_ROOM_SAMPLES) return roomSamples[roomSamples.length - 1].roomF;
  const sorted = roomSamples.map(s => s.roomF).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median * 10) / 10;
};

export type AmbientOffset = { offsetF: number; exactOffsetF: number; roomF: number | null };

export const getAmbientOffset = async (): Promise<AmbientOffset> => {
  try {
    await comfortDB.read();
    const { enabled, baseRoomF, gain, maxOffsetF } = comfortDB.data.ambientCompensation;
    sampleRoom();
    const roomF = medianRoomF();
    if (!enabled || roomF === null) return { offsetF: 0, exactOffsetF: 0, roomF };

    const exactOffsetF = Math.min(maxOffsetF, Math.max(0, gain * (baseRoomF - roomF)));
    return { offsetF: Math.round(exactOffsetF), exactOffsetF: Math.round(exactOffsetF * 100) / 100, roomF };
  } catch (error) {
    logger.error(error);
    return { offsetF: 0, exactOffsetF: 0, roomF: null };
  }
};

export const logComfortEvent = (event: string, details: Record<string, unknown> = {}, sensors = latestSensors()) => {
  const line = JSON.stringify({ ...details, time: new Date().toISOString(), event, sensors });
  fs.appendFile(COMFORT_LOG, `${line}\n`, (error) => {
    if (error) logger.warn(`Comfort: could not write log: ${error.message}`);
  });
};

const readState = (): ComfortState => {
  try {
    return JSON.parse(fs.readFileSync(COMFORT_STATE, 'utf8')) as ComfortState;
  } catch {
    return {};
  }
};

// Schedule steps and power-on record the offset they applied; power-off clears it (null)
export const recordAppliedOffset = (side: Side, appliedOffsetF: number | null) => {
  const state = readState();
  if (appliedOffsetF === null) {
    delete state[side];
  } else {
    state[side] = { appliedOffsetF, at: new Date().toISOString() };
  }
  try {
    fs.writeFileSync(COMFORT_STATE, JSON.stringify(state));
  } catch (error) {
    logger.warn(`Comfort: could not write state: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Nudge a side 1°F toward the offset the room now calls for. Applied as a change to the current
// target, so button presses and app changes since the last step are kept.
const recheckSide = async (side: Side, sideState: SideState) => {
  await settingsDB.read();
  const sideSettings = settingsDB.data[side];
  if (sideSettings.awayMode) return;
  const { expiresAt } = sideSettings.scheduleOverrides.temperatureSchedules;
  if (expiresAt && moment(expiresAt).isAfter(moment())) return;

  const { exactOffsetF, roomF } = await getAmbientOffset();
  const driftF = exactOffsetF - sideState.appliedOffsetF;
  if (Math.abs(driftF) < RECHECK_DEADBAND_F) return;

  const franken = await connectFranken();
  const status = await franken.getDeviceStatus(false);
  if (!status[side].isOn) return;

  const stepF = Math.sign(driftF);
  const offsetF = sideState.appliedOffsetF + stepF;
  const fromF = status[side].targetTemperatureF;
  const toF = Math.min(110, Math.max(55, fromF + stepF));
  logger.info(`Comfort: room ${roomF}°F, ${side} ${fromF}°F -> ${toF}°F (offset ${sideState.appliedOffsetF} -> ${offsetF})`);
  await updateDeviceStatus({ [side]: { targetTemperatureF: toF } });
  recordAppliedOffset(side, offsetF);
  logComfortEvent('recheck', { side, roomF, exactOffsetF, offsetF, fromF, toF });
};

const recheck = async () => {
  try {
    await comfortDB.read();
    if (!comfortDB.data.ambientCompensation.enabled) return;
    const state = readState();
    for (const side of ['left', 'right'] as const) {
      const sideState = state[side];
      if (!sideState) continue;
      const ageMs = Date.now() - Date.parse(sideState.at);
      if (ageMs > STATE_MAX_AGE_MS) {
        recordAppliedOffset(side, null);
      } else if (ageMs >= RECHECK_SETTLE_MS) {
        await recheckSide(side, sideState);
      }
    }
  } catch (error) {
    logger.error(error);
  }
};

// Runs a couple of seconds into every minute; realigns each time so no minute is skipped
const everyMinute = (callback: () => void) => {
  const delay = () => 60_000 - (Date.now() % 60_000) + 2_000;
  const tick = () => {
    callback();
    setTimeout(tick, delay());
  };
  setTimeout(tick, delay());
};

// Sample the room every minute; while either side is on, snapshot every 5 min and re-check
// the room offset every 15
export const startComfortMonitoring = () => {
  everyMinute(() => {
    const sensors = latestSensors();
    sampleRoom(sensors);
    const minute = new Date().getMinutes();
    if (minute % SNAPSHOT_EVERY_MINUTES === 0 && (sensors?.heatingEnabled?.left || sensors?.heatingEnabled?.right)) {
      logComfortEvent('snapshot', { roomMedianF: medianRoomF() }, sensors);
    }
    if (minute % RECHECK_EVERY_MINUTES === RECHECK_AT_MINUTE) void recheck();
  });
};
