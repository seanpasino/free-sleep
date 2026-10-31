import express from 'express';
import moment from 'moment-timezone';
import { prisma } from '../../db/prisma.js';
const router = express.Router();
// Minute rows between startTime and endTime (default: the last 12 hours), oldest first
router.get('/bedTemperatures', async (req, res) => {
    const { startTime, endTime } = req.query;
    const end = endTime ? moment(endTime) : moment();
    const start = startTime ? moment(startTime) : end.clone().subtract(12, 'hours');
    if (!start.isValid() || !end.isValid()) {
        res.status(400).json({ error: 'startTime and endTime must be ISO 8601 times' });
        return;
    }
    const rows = await prisma.bed_temperatures.findMany({
        where: { timestamp: { gte: start.unix(), lte: end.unix() } },
        orderBy: { timestamp: 'asc' },
        omit: { id: true },
    });
    const records = rows.map(({ timestamp, ...row }) => ({
        ...row,
        timestamp: timestamp * 1000,
    }));
    res.json(records);
});
export default router;
//# sourceMappingURL=bedTemperatures.js.map