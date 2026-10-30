// Room-temperature compensation for scheduled temperatures, plus a comfort log
// (/persistent/free-sleep-data/comfort-log.jsonl) of adjustments and sensor snapshots
// to learn from later.
import fs from 'fs';
import moment from 'moment-timezone';
import comfortDB from '../db/comfort.js';
import settingsDB from '../db/settings.js';
import { Side } from '../db/schedulesSchema.js';
import { readLatestSensors, SensorSnapshot } from '../8sleep/rawSensors.js';
import { SurfaceProbe } from '../db/comfort.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import logger from '../logger.js';
import { MAX_TARGET_F, MIN_TARGET_F } from '../8sleep/temperatureLevels.js';

const COMFORT_LOG = '/persistent/free-sleep-data/comfort-log.jsonl';
// Outside lowdb/ on purpose: writes there make the job scheduler look for changes
const COMFORT_STATE = '/persistent/free-sleep-data/comfort-state.json';
// Separate file so closed-loop surface state stays independent of the ambient-offset bookkeeping
// (and is simply orphaned, harmless, if surface control is reverted)
const SURFACE_STATE = '/persistent/free-sleep-data/surface-state.json';
const SNAPSHOT_EVERY_MINUTES = 5;

// Surface control: median the chosen probe over this window to shed the ~0.2°F sample jitter
const SURFACE_WINDOW_MS = 15 * 60 * 1000;
const MIN_SURFACE_SAMPLES = 2;
// Ignore surface readings older than this (a stale bedTemp record means no trustworthy surface temp)
const SURFACE_STALE_SECONDS = 10 * 60;

// Winter heating cycles swing the bedroom ~1°F within the hour, so the room is a 30 min median
const ROOM_WINDOW_MS = 30 * 60 * 1000;
const MIN_ROOM_SAMPLES = 5;
// Between schedule steps, re-check every 15 min (the water settles in 15-20 min) at :00/:15/:30/:45.
// Move 1°F at a time, and only once the wanted offset is 0.75°F from the applied one so the bed
// doesn't flap at a rounding edge. A step that just ran (same minute included) is left to settle.
const RECHECK_EVERY_MINUTES = 15;
const RECHECK_AT_MINUTE = 0;
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

// ----- Closed-loop surface-temperature control -----------------------------------------------
// Rolling samples of the chosen surface probe, per side, for temporal median smoothing.
const surfaceSamples: Record<Side, { at: number; f: number }[]> = { left: [], right: [] };

const probeValue = (zones: { out: number; cen: number; in: number }, probe: SurfaceProbe): number => {
  switch (probe) {
  case 'avg': return (zones.out + zones.cen + zones.in) / 3;
  case 'max': return Math.max(zones.out, zones.cen, zones.in);
  case 'min': return Math.min(zones.out, zones.cen, zones.in);
  case 'cen':
  default: return zones.cen;
  }
};

const sampleSurface = (probe: SurfaceProbe, sensors = latestSensors()) => {
  const now = Date.now();
  if (sensors?.surfaceF && typeof sensors.ts === 'number' && now / 1000 - sensors.ts < SURFACE_STALE_SECONDS) {
    surfaceSamples.left.push({ at: now, f: probeValue(sensors.surfaceF.left, probe) });
    surfaceSamples.right.push({ at: now, f: probeValue(sensors.surfaceF.right, probe) });
  }
  for (const side of ['left', 'right'] as Side[]) {
    while (surfaceSamples[side].length && now - surfaceSamples[side][0].at > SURFACE_WINDOW_MS) surfaceSamples[side].shift();
  }
};

// Median of the chosen probe over the window; null until there are enough fresh samples
const medianSurfaceF = (side: Side): number | null => {
  const arr = surfaceSamples[side];
  if (arr.length < MIN_SURFACE_SAMPLES) return null;
  const sorted = arr.map(s => s.f).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median * 10) / 10;
};

// Per-side loop state. setpointF is the desired surface temp (what the user/schedule intends);
// trimF is the integral water offset the loop has built to reach it; lastCommandedF is the device
// target we last wrote, so a value that differs means someone else (app/button/schedule) moved it.
type SurfaceSideState = { setpointF: number; trimF: number; lastCommandedF: number; at: string };
type SurfaceState = Partial<Record<Side, SurfaceSideState>>;

const readSurfaceState = (): SurfaceState => {
  try {
    return JSON.parse(fs.readFileSync(SURFACE_STATE, 'utf8')) as SurfaceState;
  } catch {
    return {};
  }
};

const writeSurfaceState = (state: SurfaceState) => {
  try {
    fs.writeFileSync(SURFACE_STATE, JSON.stringify(state));
  } catch (error) {
    logger.warn(`Comfort: could not write surface state: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Schedule steps / power-on set the intended surface setpoint (and reset the trim); power-off and
// wake steps pass null to suspend the loop for that side until the next normal step seeds it again.
export const recordSurfaceSetpoint = (side: Side, setpointF: number | null) => {
  const state = readSurfaceState();
  if (setpointF === null) {
    delete state[side];
  } else {
    state[side] = { setpointF, trimF: 0, lastCommandedF: setpointF, at: new Date().toISOString() };
  }
  writeSurfaceState(state);
};

export const surfaceControlEnabled = async (): Promise<boolean> => {
  try {
    await comfortDB.read();
    return comfortDB.data.surfaceControl?.enabled === true;
  } catch (error) {
    logger.error(error);
    return false;
  }
};

// ---------------------------------------------------------------------------------------------

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

export const isWakeStep = async (temperatureF: number): Promise<boolean> => {
  try {
    await comfortDB.read();
    return temperatureF >= comfortDB.data.ambientCompensation.wakeStepMinF;
  } catch (error) {
    logger.error(error);
    return false;
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
  if (Math.abs(driftF) < RECHECK_DEADBAND_F) {
    logger.debug(`Comfort: re-check ${side}: room ${roomF}°F wants +${exactOffsetF}, applied +${sideState.appliedOffsetF}, no change`);
    return;
  }

  const franken = await connectFranken();
  const status = await franken.getDeviceStatus(false);
  if (!status[side].isOn) {
    logger.debug(`Comfort: re-check ${side}: side is off, no change`);
    return;
  }

  const stepF = Math.sign(driftF);
  const offsetF = sideState.appliedOffsetF + stepF;
  const fromF = status[side].targetTemperatureF;
  const toF = Math.min(MAX_TARGET_F, Math.max(MIN_TARGET_F, fromF + stepF));
  logger.info(`Comfort: room ${roomF}°F, ${side} ${fromF}°F -> ${toF}°F (offset ${sideState.appliedOffsetF} -> ${offsetF})`);
  await updateDeviceStatus({ [side]: { targetTemperatureF: toF } });
  recordAppliedOffset(side, offsetF);
  logComfortEvent('recheck', { side, roomF, exactOffsetF, offsetF, fromF, toF });
};

// One re-check tick for a side: trim the water target toward holding the surface at the setpoint.
// No schedule-override check here, unlike recheckSide: a manual temperature (which sets the
// override) is exactly the setpoint this loop should hold; the override only pauses schedule steps.
const recheckSideSurface = async (side: Side): Promise<void> => {
  await settingsDB.read();
  if (settingsDB.data[side].awayMode) return;

  const cfg = comfortDB.data.surfaceControl;
  const franken = await connectFranken();
  const status = await franken.getDeviceStatus(false);
  if (!status[side].isOn) return;

  const state = readSurfaceState();
  const currentTargetF = status[side].targetTemperatureF;
  const sideState = state[side];
  const now = () => new Date().toISOString();

  // Seed on first run (control switched on without a schedule step yet): hold the current target,
  // then wait a settle cycle before trimming.
  if (!sideState) {
    state[side] = { setpointF: currentTargetF, trimF: 0, lastCommandedF: currentTargetF, at: now() };
    writeSurfaceState(state);
    logger.debug(`Comfort(surface): ${side} seeded setpoint ${currentTargetF}°F`);
    return;
  }

  // A target we did not command means the app, a button, or a schedule step moved it: adopt it as
  // the new setpoint and let the loop re-converge from zero trim.
  if (currentTargetF !== sideState.lastCommandedF) {
    state[side] = { setpointF: currentTargetF, trimF: 0, lastCommandedF: currentTargetF, at: now() };
    writeSurfaceState(state);
    logger.debug(`Comfort(surface): ${side} target moved to ${currentTargetF}°F externally — re-anchoring`);
    return;
  }

  const surfaceF = medianSurfaceF(side);
  if (surfaceF === null) {
    logger.debug(`Comfort(surface): ${side} no fresh surface reading — skipping`);
    return;
  }

  // calibrationOffsetF is either one number for both sides or a per-side { left, right }
  const calF = typeof cfg.calibrationOffsetF === 'number'
    ? cfg.calibrationOffsetF
    : (cfg.calibrationOffsetF?.[side] ?? 0);
  const desiredF = sideState.setpointF + calF;
  const errorF = desiredF - surfaceF;
  if (Math.abs(errorF) < cfg.deadbandF) {
    logger.debug(`Comfort(surface): ${side} surface ${surfaceF}°F vs desired ${desiredF}°F — in deadband`);
    return;
  }

  const trimF = Math.max(-cfg.maxTrimF, Math.min(cfg.maxTrimF, sideState.trimF + Math.sign(errorF) * cfg.stepF));
  const newTargetF = Math.min(MAX_TARGET_F, Math.max(MIN_TARGET_F, sideState.setpointF + trimF));

  if (newTargetF === currentTargetF) {
    // Trim saturated (maxTrimF) or clamped to the Pod's range — record it but issue no command.
    state[side] = { ...sideState, trimF, at: now() };
    writeSurfaceState(state);
    logger.debug(`Comfort(surface): ${side} surface ${surfaceF}°F vs ${desiredF}°F, water trim at limit (${trimF}°F)`);
    return;
  }

  logger.info(
    `Comfort(surface): ${side} surface ${surfaceF}°F -> ${desiredF}°F; `
    + `water ${currentTargetF}°F -> ${newTargetF}°F (trim ${sideState.trimF} -> ${trimF})`,
  );
  await updateDeviceStatus({ [side]: { targetTemperatureF: newTargetF } });
  state[side] = { setpointF: sideState.setpointF, trimF, lastCommandedF: newTargetF, at: now() };
  writeSurfaceState(state);
  logComfortEvent('surface_recheck', {
    side, surfaceF, desiredF, setpointF: sideState.setpointF, trimF, fromF: currentTargetF, toF: newTargetF,
  });
};

const recheck = async () => {
  try {
    await comfortDB.read();
    // Closed-loop surface control owns the correction when enabled, superseding ambient re-checks.
    if (comfortDB.data.surfaceControl?.enabled) {
      const sstate = readSurfaceState();
      for (const side of ['left', 'right'] as const) {
        const ss = sstate[side];
        // Let a fresh setpoint/seed settle before trimming; an unseeded side is seeded inside.
        if (ss && Date.now() - Date.parse(ss.at) < RECHECK_SETTLE_MS) continue;
        await recheckSideSurface(side);
      }
      return;
    }
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

// Runs 30s into every minute, after any schedule job due on that minute has finished;
// realigns each time so no minute is skipped
const everyMinute = (callback: () => void) => {
  const delay = () => 60_000 - ((Date.now() + 30_000) % 60_000);
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
    sampleSurface(comfortDB.data.surfaceControl?.probe ?? 'cen', sensors);
    const minute = new Date().getMinutes();
    if (minute % SNAPSHOT_EVERY_MINUTES === 0 && (sensors?.heatingEnabled?.left || sensors?.heatingEnabled?.right)) {
      logComfortEvent('snapshot', { roomMedianF: medianRoomF() }, sensors);
    }
    if (minute % RECHECK_EVERY_MINUTES === RECHECK_AT_MINUTE) void recheck();
  });
};
