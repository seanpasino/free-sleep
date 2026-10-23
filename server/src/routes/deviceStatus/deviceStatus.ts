import express, { Request, Response } from 'express';
import { connectFranken } from '../../8sleep/frankenServer.js';
import { DeviceStatus, DeviceStatusSchema } from './deviceStatusSchema.js';
import logger from '../../logger.js';
import { updateDeviceStatus } from './updateDeviceStatus.js';
import { DeepPartial } from 'ts-essentials';
import { logComfortEvent } from '../../jobs/comfort.js';

const router = express.Router();

router.get('/deviceStatus', async (req: Request, res: Response) => {
  const franken = await connectFranken();
  const resp = await franken.getDeviceStatus();
  res.json(resp);
});


router.post('/deviceStatus', async (req: Request, res: Response) => {
  const { body } = req;
  const validationResult = DeviceStatusSchema.deepPartial().safeParse(body);
  if (!validationResult.success) {
    logger.error('Invalid device status update:', validationResult.error);
    res.status(400).json({
      error: 'Invalid request data',
      details: validationResult?.error?.errors,
    });
    return;
  }

  await updateDeviceStatus(body as DeepPartial<DeviceStatus>);
  for (const side of ['left', 'right'] as const) {
    const { targetTemperatureF, isOn } = (body as DeepPartial<DeviceStatus>)[side] ?? {};
    if (targetTemperatureF !== undefined || isOn !== undefined) {
      logComfortEvent('manual', { side, toF: targetTemperatureF, isOn });
    }
  }
  res.status(204).end();
});


export default router;
