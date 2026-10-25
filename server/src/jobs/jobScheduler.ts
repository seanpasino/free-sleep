import path from 'path';
import chokidar from 'chokidar';
import moment from 'moment-timezone';
import schedule from 'node-schedule';

import config from '../config.js';
import logger from '../logger.js';
import schedulesDB from '../db/schedules.js';
import serverStatus from '../serverStatus.js';
import settingsDB from '../db/settings.js';
import { DayOfWeek, Side } from '../db/schedulesSchema.js';
import { isSystemDateValid } from './isSystemDateValid.js';
import { scheduleAlarm, scheduleAlarmOverride } from './alarmScheduler.js';
import { schedulePowerOffAndSleepAnalysis, schedulePowerOn } from './powerScheduler.js';
import { schedulePrimingRebootAndCalibration } from './primeScheduler.js';
import { scheduleTemperatures } from './temperatureScheduler.js';
import { resumePendingSleepAnalysis } from './sleepAnalysisWait.js';


async function setupJobs() {
  try {
    if (serverStatus.status.jobs.status === 'started') {
      logger.debug('Job setup already running, skipping duplicate execution.');
      return;
    }
    serverStatus.status.jobs.status = 'started';


    // Clear existing jobs
    logger.info('Canceling old jobs...');
    Object.keys(schedule.scheduledJobs).forEach((jobName) => {
      schedule.cancelJob(jobName);
    });
    await schedule.gracefulShutdown();

    await settingsDB.read();
    await schedulesDB.read();

    moment.tz.setDefault(settingsDB.data.timeZone || 'UTC');

    const schedulesData = schedulesDB.data;
    const settingsData = settingsDB.data;

    logger.info('Scheduling jobs...');
    scheduleAlarmOverride(settingsData, 'left');
    scheduleAlarmOverride(settingsData, 'right');
    Object.entries(schedulesData).forEach(([side, sideSchedule]) => {
      Object.entries(sideSchedule).forEach(([day, schedule]) => {
        schedulePowerOn(settingsData, side as Side, day as DayOfWeek, schedule.power);
        schedulePowerOffAndSleepAnalysis(settingsData, side as Side, day as DayOfWeek, schedule.power);
        scheduleTemperatures(settingsData, side as Side, day as DayOfWeek, schedule.temperatures);
        scheduleAlarm(settingsData, side as Side, day as DayOfWeek, schedule);
      });
    });
    schedulePrimingRebootAndCalibration(settingsData);

    logger.info('Done scheduling jobs!');
    serverStatus.status.alarmSchedule.status = 'healthy';
    serverStatus.status.jobs.status = 'healthy';
    serverStatus.status.primeSchedule.status = 'healthy';
    serverStatus.status.powerSchedule.status = 'healthy';
    serverStatus.status.rebootSchedule.status = 'healthy';
    serverStatus.status.temperatureSchedule.status = 'healthy';
  } catch (error: unknown) {
    serverStatus.status.jobs.status = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    logger.error(error);
    serverStatus.status.jobs.message = message;
  }
}

let RETRY_COUNT = 0;

function waitForValidDateAndSetupJobs() {
  serverStatus.status.systemDate.status = 'started';

  if (isSystemDateValid()) {
    serverStatus.status.systemDate.status = 'healthy';
    serverStatus.status.systemDate.message = '';
    logger.info('System date is valid. Setting up jobs...');
    void setupJobs();
    resumePendingSleepAnalysis();
  } else if(RETRY_COUNT < 20) {
    serverStatus.status.systemDate.status = 'retrying';
    const message = `System date is invalid (year 2010). Retrying in 5 seconds... (Attempt #${RETRY_COUNT}})`;
    serverStatus.status.systemDate.message = message;
    RETRY_COUNT++;
    logger.debug(message);
    setTimeout(waitForValidDateAndSetupJobs, 5_000);
  } else {
    const message = `System date is invalid! No jobs can be scheduled! ${new Date().toISOString()} `;
    serverStatus.status.systemDate.message = message;
    logger.warn(message);
  }
}


// Only these files define jobs. lowdb saves through dot-prefixed .tmp files, and the biometrics
// heartbeat rewrites servicesDB.json every ~20s; neither should cancel and rebuild every job.
const JOB_DB_FILES = ['schedulesDB.json', 'settingsDB.json'];

// Jobs are due on whole minutes, and a reload cancels everything for about a second before
// rescheduling. A reload that straddles hh:mm:00 silently drops whatever was due then, so
// debounce bursts of writes and stay clear of the minute boundary.
let reloadTimer: NodeJS.Timeout | undefined;

function requestJobReload() {
  clearTimeout(reloadTimer);
  const seconds = new Date().getSeconds();
  const delayMs = seconds >= 50 ? (63 - seconds) * 1000 : 1000;
  reloadTimer = setTimeout(() => {
    if (serverStatus.status.systemDate.status === 'healthy') {
      void setupJobs();
    } else {
      waitForValidDateAndSetupJobs();
    }
  }, delayMs);
}

// Monitor the JSON file and refresh jobs on change
chokidar.watch(config.lowDbFolder).on('change', (changedPath) => {
  const fileName = path.basename(changedPath);
  if (!JOB_DB_FILES.includes(fileName)) return;

  logger.info(`Detected DB change, reloading... ${fileName}`);
  requestJobReload();
});

// Initial job setup
waitForValidDateAndSetupJobs();
