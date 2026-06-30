import { execSync } from 'child_process';
import { DeepPartial } from 'ts-essentials';
import { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';
import { connectFranken } from './frankenServer.js';
import { executeFunction } from './deviceApi.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import memoryDB from '../db/memoryDB.js';
import logger from '../logger.js';

type Side = 'left' | 'right';

const POLL_INTERVAL = 1000;
// After the last detected press, wait this long before applying. A burst of
// presses (within one poll, or spread across adjacent polls) accumulates into a
// single net temperature change instead of racing on a stale read.
const DEBOUNCE_MS = 700;
const MIN_TEMP_F = 55;
const MAX_TEMP_F = 110;
const REGEX = /DBG:(\d+).*\[TTC\] processing \[button\] side (left|right) \{ button: (top|bottom), type: short/;

export class ButtonMonitor {
  private isRunning = false;
  private lastPollTime = '';
  private seen = new Set<string>();
  private pendingDelta: Record<Side, number> = { left: 0, right: 0 };
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastPollTime = this.now();
    this.poll();
    logger.info('ButtonMonitor started');
  }

  stop() {
    this.isRunning = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private now(): string {
    return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }

  private poll() {
    if (!this.isRunning) return;

    try {
      const since = this.lastPollTime;
      this.lastPollTime = this.now();
      const output = execSync(
        `journalctl -u frank --since '${since}' -o cat --no-pager`,
        { encoding: 'utf-8', timeout: 5000 },
      );

      for (const line of output.split('\n')) {
        const match = line.match(REGEX);
        if (!match) continue;

        const id = match[1];
        if (this.seen.has(id)) continue;
        this.seen.add(id);

        const side = match[2] as Side;
        const button = match[3] as 'top' | 'bottom';
        this.registerPress(button, side);
      }

      // Keep seen set from growing forever
      if (this.seen.size > 100) this.seen.clear();
    } catch (err) {
      logger.error(err);
    }

    setTimeout(() => this.poll(), POLL_INTERVAL);
  }

  // Accumulate a press and (re)arm the debounce timer. Presses are summed as a
  // net delta (top = +1F, bottom = -1F) so rapid presses stack correctly
  // (e.g. up x3 = +3F) instead of each doing a concurrent read-modify-write
  // against the same stale temperature.
  private registerPress(button: 'top' | 'bottom', side: Side) {
    this.pendingDelta[side] += button === 'top' ? 1 : -1;
    logger.debug(`ButtonMonitor: ${button} press on ${side}, pending delta ${this.pendingDelta[side]}`);

    // Dismiss a vibrating alarm immediately on any press, regardless of debounce.
    void this.dismissAlarmIfVibrating(side);

    this.armFlush();
  }

  private armFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private async dismissAlarmIfVibrating(side: Side) {
    try {
      await memoryDB.read();
      if (memoryDB.data[side].isAlarmVibrating) {
        logger.info(`ButtonMonitor: dismissing alarm for ${side} via button press`);
        await executeFunction('ALARM_CLEAR', 'empty');
        memoryDB.data[side].isAlarmVibrating = false;
        await memoryDB.write();
      }
    } catch (err) {
      logger.error(err);
    }
  }

  // Apply the accumulated delta for each side as a single read-modify-write.
  private async flush() {
    // If a flush is already in flight, let it finish and re-arm so any presses
    // that arrived in the meantime get applied next.
    if (this.flushing) {
      this.armFlush();
      return;
    }
    this.flushing = true;
    try {
      const franken = await connectFranken();
      const status = await franken.getDeviceStatus(false);

      for (const side of ['left', 'right'] as Side[]) {
        const delta = this.pendingDelta[side];
        if (delta === 0) continue;
        // Reset before the await so presses during the write accumulate fresh.
        this.pendingDelta[side] = 0;

        const currentTemp = status[side].targetTemperatureF;
        const newTemp = Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, currentTemp + delta));

        const update: { targetTemperatureF: number; isOn?: boolean } = { targetTemperatureF: newTemp };
        if (!status[side].isOn) {
          // A press on an off side powers it on and applies the change, so
          // presses are never silently dropped.
          update.isOn = true;
          logger.info(`ButtonMonitor: ${side} was off — powering on, temp -> ${newTemp} (${delta > 0 ? '+' : ''}${delta})`);
        } else {
          if (newTemp === currentTemp) continue;
          logger.info(`ButtonMonitor: ${side} temp ${currentTemp} -> ${newTemp} (${delta > 0 ? '+' : ''}${delta})`);
        }
        await updateDeviceStatus({ [side]: update } as DeepPartial<DeviceStatus>);
      }
    } catch (err) {
      logger.error(err);
    } finally {
      this.flushing = false;
    }
  }
}
