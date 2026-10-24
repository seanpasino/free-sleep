import express from 'express';
import { connectFranken } from '../../8sleep/frankenServer.js';
import { DeviceStatusSchema } from './deviceStatusSchema.js';
import logger from '../../logger.js';
import { updateDeviceStatus } from './updateDeviceStatus.js';
import { logComfortEvent } from '../../jobs/comfort.js';
const router = express.Router();
router.get('/deviceStatus', async (req, res) => {
    const franken = await connectFranken();
    const resp = await franken.getDeviceStatus();
    res.json(resp);
});
router.post('/deviceStatus', async (req, res) => {
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
    await updateDeviceStatus(body);
    for (const side of ['left', 'right']) {
        const { targetTemperatureF, isOn } = body[side] ?? {};
        if (targetTemperatureF !== undefined || isOn !== undefined) {
            logComfortEvent('manual', { side, toF: targetTemperatureF, isOn });
        }
    }
    res.status(204).end();
});
export default router;
//# sourceMappingURL=deviceStatus.js.map