// Nightly summaries of the bed temperature history, morning comfort ratings, and control events
// (button presses, app/HA changes, schedule steps, power) for chart markers.
import express, { Request, Response } from 'express';
import fs from 'fs';
import moment from 'moment-timezone';
import { z } from 'zod';
import { bed_temperatures as BedRow } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import settingsDB from '../../db/settings.js';
import logger from '../../logger.js';
import { COMFORT_LOG } from '../../jobs/comfort.js';
import { BedEvent, NightSummary, SleepRating } from '../../db/bedTemperatureSchema.js';

const router = express.Router();

type Side = 'left' | 'right';
const SideSchema = z.enum(['left', 'right']);
const ON_TARGET_F = 1;
// A gap longer than this (in minutes) ends an on-period
const MAX_GAP_S = 10 * 60;
// Shorter on-periods (a test, a nap) aren't nights
const MIN_NIGHT_S = 2 * 60 * 60;

// Schedules name a night by the evening it starts, so before noon the night is yesterday's
const nightOf = (epochMs: number, timeZone: string) => moment.tz(epochMs, timeZone).subtract(12, 'hours').format('YYYY-MM-DD');

const avg = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null);

const summarize = (rows: BedRow[], side: Side, timeZone: string): Omit<NightSummary, 'rating'> => {
  const col = <K extends string>(row: BedRow, key: K) => row[`${side}_${key}` as keyof BedRow] as number | boolean | null;
  const held = rows.filter((r) => col(r, 'present') && col(r, 'setpoint') !== null && col(r, 'bed') !== null);
  const bed = held.map((r) => col(r, 'bed') as number);
  const setpoint = held.map((r) => col(r, 'setpoint') as number);
  const onTarget = held.filter((r, i) => Math.abs(bed[i] - setpoint[i]) <= ON_TARGET_F).length;
  const offsets = held.filter((r) => col(r, 'water') !== null).map((r) => (col(r, 'water') as number) - (col(r, 'setpoint') as number));
  return {
    night: nightOf(rows[0].timestamp * 1000, timeZone),
    from: rows[0].timestamp * 1000,
    to: rows[rows.length - 1].timestamp * 1000,
    inBedHours: Math.round(held.length / 6) / 10,
    onTargetPercent: held.length ? Math.round(onTarget / held.length * 100) : null,
    bedAvgF: avg(bed),
    setpointAvgF: avg(setpoint),
    offsetAvgF: avg(offsets),
    roomAvgF: avg(rows.map((r) => r.room).filter((v): v is number => v !== null)),
  };
};

// GET /nights?side=right&days=30: one summary per night the side was on, newest first
router.get('/nights', async (req: Request, res: Response) => {
  try {
    const side = SideSchema.parse(req.query.side ?? 'right');
    const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30)));
    await settingsDB.read();
    const timeZone = settingsDB.data.timeZone || 'UTC';
    const rows = await prisma.bed_temperatures.findMany({
      where: { timestamp: { gte: moment().subtract(days, 'days').unix() } },
      orderBy: { timestamp: 'asc' },
    });

    const periods: BedRow[][] = [];
    let current: BedRow[] = [];
    for (const row of rows) {
      const on = row[`${side}_on`];
      const last = current[current.length - 1];
      if (on && last && row.timestamp - last.timestamp <= MAX_GAP_S) {
        current.push(row);
      } else {
        if (current.length) periods.push(current);
        current = on ? [row] : [];
      }
    }
    if (current.length) periods.push(current);

    const nights = periods
      .filter((p) => p[p.length - 1].timestamp - p[0].timestamp >= MIN_NIGHT_S)
      .map((p) => summarize(p, side, timeZone));
    const ratings = await prisma.sleep_ratings.findMany({ where: { side, night: { in: nights.map((n) => n.night) } } });
    const result: NightSummary[] = nights.map((n) => {
      const rating = ratings.find((r) => r.night === n.night);
      return { ...n, rating: rating ? { early: rating.early, late: rating.late } : null };
    }).reverse();
    res.json(result);
  } catch (error) {
    logger.error(error);
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// GET /ratings?side=right&night=YYYY-MM-DD (one night) or without night (the last 60)
router.get('/ratings', async (req: Request, res: Response) => {
  try {
    const side = SideSchema.parse(req.query.side ?? 'right');
    const night = typeof req.query.night === 'string' ? req.query.night : undefined;
    const rows = await prisma.sleep_ratings.findMany({
      where: { side, ...(night ? { night } : {}) },
      orderBy: { night: 'desc' },
      take: 60,
    });
    const ratings: SleepRating[] = rows.map((r) => ({ side: r.side as Side, night: r.night, early: r.early, late: r.late }));
    res.json(ratings);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const Feel = z.union([z.literal(-1), z.literal(0), z.literal(1), z.null()]);
const RatingSchema = z.object({
  side: SideSchema,
  night: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  early: Feel.optional(),
  late: Feel.optional(),
});

// POST /ratings {side, night, early?, late?}: sets the given parts of a night's rating (null clears one)
router.post('/ratings', async (req: Request, res: Response) => {
  const parsed = RatingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid rating', details: parsed.error.errors });
    return;
  }
  const { side, night, early, late } = parsed.data;
  const values = { ...(early !== undefined ? { early } : {}), ...(late !== undefined ? { late } : {}), updated_at: moment().unix() };
  const row = await prisma.sleep_ratings.upsert({
    where: { side_night: { side, night } },
    create: { side, night, early: early ?? null, late: late ?? null, updated_at: values.updated_at },
    update: values,
  });
  const rating: SleepRating = { side: row.side as Side, night: row.night, early: row.early, late: row.late };
  res.json(rating);
});

const EVENT_KINDS = new Set<BedEvent['kind']>(['button', 'manual', 'schedule', 'power_on', 'power_off']);

// GET /bedEvents?side=right&startTime&endTime: control events from the comfort log, oldest first
router.get('/bedEvents', async (req: Request, res: Response) => {
  try {
    const side = SideSchema.parse(req.query.side ?? 'right');
    const end = req.query.endTime ? Date.parse(String(req.query.endTime)) : Date.now();
    const start = req.query.startTime ? Date.parse(String(req.query.startTime)) : end - 12 * 3600_000;
    const text = await fs.promises.readFile(COMFORT_LOG, 'utf8').catch(() => '');
    const events: BedEvent[] = [];
    for (const line of text.split('\n')) {
      // Snapshots are most of the file and never markers
      if (!line || line.includes('"event":"snapshot"')) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const kind = entry.event as BedEvent['kind'];
      const time = Date.parse(String(entry.time));
      if (!EVENT_KINDS.has(kind) || entry.side !== side || !(time >= start && time <= end)) continue;
      const toF = typeof entry.toF === 'number' ? entry.toF : typeof entry.appliedF === 'number' ? entry.appliedF : undefined;
      events.push({ time, kind, ...(typeof entry.fromF === 'number' ? { fromF: entry.fromF } : {}), ...(toF !== undefined ? { toF } : {}) });
    }
    res.json(events);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
