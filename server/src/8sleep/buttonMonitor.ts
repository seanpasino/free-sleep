import { execSync } from 'child_process';
import { DeepPartial } from 'ts-essentials';
import { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';
import { connectFranken } from './frankenServer.js';
import { executeFunction } from './deviceApi.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import memoryDB from '../db/memoryDB.js';
import { recordHeatStateLine } from './heatState.js';
import logger from '../logger.js';

type Side = 'left' | 'right';

const POLL_INTERVAL = 1000;
// After the last detected press, wait this long before applying. A burst of
// presses (within one poll, or spread across adjacent polls) accumulates into a
// single net temperature change instead of racing on a stale read.
const DEBOUNCE_MS = 700;
const MIN_TEMP_F = 55;
const MAX_TEMP_F = 110;
// A middle press held at least this long toggles that side's power on/off.
// The middle button is ALWAYS logged as `type: short` no matter how long it's
// held, so we gate on the firmware-reported hold duration instead of the type.
const POWER_TOGGLE_HOLD_MS = 2000;
const REGEX = /DBG:(\d+).*\[TTC\] processing \[button\] side (left|right) \{ button: (top|bottom), type: short/;
// Raw firmware line reporting how long the middle button was held (no side).
const MIDDLE_HELD_REGEX = /\[buttons\] middle button held for (\d+)ms/;
// Coalesced middle-button event (carries the side, but never a duration).
const MIDDLE_PROC_REGEX = /DBG:(\d+).*\[TTC\] processing \[button\] side (left|right) \{ button: middle, type: short/;

export class ButtonMonitor {
  private isRunning = false;
  private lastPollTime = '';
  private seen = new Set<string>();
  private pendingDelta: Record<Side, number> = { left: 0, right: 0 };
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  // Duration from the most recent "middle button held for <N>ms" line, paired
  // with the middle-press event that follows it (which carries the side).
  private lastMiddleHeldMs = 0;
  private lastMiddleHeldAt = 0;

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
        // Track physical heat actuation (set_side enabled/disabled) off the same
        // journal stream so the API can distinguish commanded (isOn) from
        // actually-running (isActive). No-op for non-set_side lines.
        recordHeatStateLine(line);

        // The "held for <N>ms" line arrives just before the middle-press event.
        // Stash its duration so the event below can decide short vs. long.
        const held = line.match(MIDDLE_HELD_REGEX);
        if (held) {
          this.lastMiddleHeldMs = parseInt(held[1], 10);
          this.lastMiddleHeldAt = Date.now();
          continue;
        }

        // Middle-press event (carries the side). If the paired hold was long
        // enough, toggle that side's power; otherwise ignore it entirely.
        const middle = line.match(MIDDLE_PROC_REGEX);
        if (middle) {
          const id = middle[1];
          if (this.seen.has(id)) continue;
          this.seen.add(id);

          const side = middle[2] as Side;
          const heldMs = this.lastMiddleHeldMs;
          const fresh = Date.now() - this.lastMiddleHeldAt < 4000;
          this.lastMiddleHeldMs = 0;
          if (fresh && heldMs >= POWER_TOGGLE_HOLD_MS) {
            logger.info(`ButtonMonitor: middle long-press (${heldMs}ms) on ${side}`);
            void this.toggleSidePower(side);
          } else {
            logger.debug(`ButtonMonitor: middle press on ${side} held ${heldMs}ms — ignoring (need >= ${POWER_TOGGLE_HOLD_MS}ms to toggle power)`);
          }
          continue;
        }

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

  // Flip a side's power on/off in response to a long middle press.
  private async toggleSidePower(side: Side) {
    try {
      const franken = await connectFranken();
      const status = await franken.getDeviceStatus(false);
      const newOn = !status[side].isOn;
      logger.info(`ButtonMonitor: middle long-press on ${side} — toggling power ${newOn ? 'ON' : 'OFF'}`);
      await updateDeviceStatus({ [side]: { isOn: newOn } } as DeepPartial<DeviceStatus>);
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

        // Never power on from a top/bottom press — accidental presses (sheets
        // shifting, pets on the bed) were waking the Pod. Power is toggled only
        // by a long (>= 2s) middle press. Drop the temp change on an off side.
        if (!status[side].isOn) {
          logger.debug(`ButtonMonitor: ${side} is off — ignoring temp press (long-press middle to power on)`);
          continue;
        }

        const currentTemp = status[side].targetTemperatureF;
        const newTemp = Math.min(MAX_TEMP_F, Math.max(MIN_TEMP_F, currentTemp + delta));
        if (newTemp === currentTemp) continue;

        logger.info(`ButtonMonitor: ${side} temp ${currentTemp} -> ${newTemp} (${delta > 0 ? '+' : ''}${delta})`);
        await updateDeviceStatus({ [side]: { targetTemperatureF: newTemp } } as DeepPartial<DeviceStatus>);
      }
    } catch (err) {
      logger.error(err);
    } finally {
      this.flushing = false;
    }
  }
}
