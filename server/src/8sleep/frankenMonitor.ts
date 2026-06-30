import moment from 'moment-timezone';
import logger from '../logger.js';
import { connectFranken } from './frankenServer.js';
import { wait } from './promises.js';
import { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';
import serverStatus from '../serverStatus.js';



export class FrankenMonitor {
  private isRunning: boolean;
  private deviceStatus?: DeviceStatus;

  constructor() {
    this.isRunning = false;
    this.deviceStatus = undefined;
  }

  public async start() {
    if (this.isRunning) {
      logger.warn('FrankenMonitor is already running');
      return;
    }
    this.isRunning = true;
    this.frankenLoop().catch(error => {
      logger.error(error);
      serverStatus.status.frankenMonitor.status = 'failed';
      serverStatus.status.frankenMonitor.message = String(error);
      serverStatus.status.frankenMonitor.timestamp = moment.tz().format();
    });
  }

  public stop() {
    if (!this.isRunning) return;
    logger.debug('Stopping FrankenMonitor loop');
    this.isRunning = false;
  }

  // Gesture handling is intentionally disabled. Physical button presses register
  // as firmware gestures, so acting on gestures here double-reacts with
  // ButtonMonitor — it previously changed temperature and then toggled the side's
  // power underneath the buttons. ButtonMonitor owns temperature and dismisses a
  // vibrating alarm on any press, so this loop is now only a connection-health poll.
  private async frankenLoop() {
    const franken = await connectFranken();
    this.deviceStatus = await franken.getDeviceStatus(false);
    while (this.isRunning) {
      try {
        while (this.isRunning) {
          await wait(60_000);
          if (!this.isRunning) break;
          const franken = await connectFranken();
          this.deviceStatus = await franken.getDeviceStatus(false);
          serverStatus.status.frankenMonitor.status = 'healthy';
          serverStatus.status.frankenMonitor.message = '';
          serverStatus.status.frankenMonitor.timestamp = moment.tz().format();
        }
      } catch (error) {
        serverStatus.status.frankenMonitor.status = 'failed';
        serverStatus.status.frankenMonitor.message = String(error);
        serverStatus.status.frankenMonitor.timestamp = moment.tz().format();
        logger.error(error instanceof Error ? error.message : String(error), 'franken disconnected');
        await wait(60_000);
      }
    }
    logger.debug('FrankenMonitor loop exited');
  }
}
