// GET /api/telemetry: every sensor and I/O value the Pod exposes that is worth showing, in one
// snapshot (the newest RAW record of each type, the firmware's status reply, free-sleep's own
// state and a few system figures). Read-only.
import express from 'express';
import fs from 'fs';
import os from 'os';
import { readLatestRecords } from '../../8sleep/rawSensors.js';
import { connectFranken } from '../../8sleep/frankenServer.js';
import { getLastRawDeviceData } from '../../8sleep/loadDeviceStatus.js';
import { bedControlEnabled, bedSide, bedTemperatureF } from '../../8sleep/bedControl.js';
import { lastButtonPress } from '../../8sleep/buttonMonitor.js';
import { getPresence } from '../metrics/presence.js';
import { prisma } from '../../db/prisma.js';
import settingsDB from '../../db/settings.js';
import comfortDB from '../../db/comfort.js';
import config from '../../config.js';
import logger from '../../logger.js';
const router = express.Router();
const SIDES = ['left', 'right'];
const RAW_TYPES = ['bedTemp', 'frzTemp', 'frzTherm', 'frzHealth', 'capSense', 'piezo-dual', 'blanketReadings'];
// Records older than this are treated as missing
const STALE_SECONDS = 10 * 60;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const centiCToF = (v) => { const n = num(v); return n === null ? null : round1(n / 100 * 9 / 5 + 32); };
const cToF = (v) => { const n = num(v); return n === null ? null : round1(n * 9 / 5 + 32); };
const fresh = (record) => (record && Date.now() / 1000 - record.ts < STALE_SECONDS ? record : undefined);
const isoFromTs = (record) => (record ? new Date(record.ts * 1000).toISOString() : null);
const readJson = (filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
};
// Raw capacitance per zone over the live presence detector's empty-bed baseline
const capBaseline = (side) => {
    const baseline = readJson(`${config.dbFolder}cap-baseline-${side}.json`)?.baseline;
    if (!baseline || ['out', 'cen', 'in'].some((z) => num(baseline[z]) === null))
        return null;
    return { out: Math.round(baseline.out), cen: Math.round(baseline.cen), in: Math.round(baseline.in) };
};
const cpuCelsius = () => {
    try {
        for (const zone of fs.readdirSync('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone'))) {
            const type = fs.readFileSync(`/sys/class/thermal/${zone}/type`, 'utf8').trim();
            if (type.includes('cpu'))
                return Math.round(Number(fs.readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf8')) / 100) / 10;
        }
    }
    catch {
        // Not on the Pod
    }
    return null;
};
const memoryAvailableMB = () => {
    try {
        const match = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+) kB/);
        return match ? Math.round(Number(match[1]) / 1024) : null;
    }
    catch {
        return null;
    }
};
const latestVitals = async (side) => {
    const row = await prisma.vitals.findFirst({ where: { side }, orderBy: { timestamp: 'desc' } });
    if (!row)
        return null;
    return { heartRate: row.heart_rate, breathingRate: row.breathing_rate, hrv: row.hrv, at: new Date(row.timestamp * 1000).toISOString() };
};
router.get('/telemetry', async (req, res) => {
    try {
        const raw = readLatestRecords(RAW_TYPES);
        const bedTemp = fresh(raw.bedTemp);
        const frzTemp = fresh(raw.frzTemp);
        const frzTherm = fresh(raw.frzTherm);
        const frzHealth = fresh(raw.frzHealth);
        const capSense = fresh(raw.capSense);
        const piezo = fresh(raw['piezo-dual']);
        const blanket = fresh(raw.blanketReadings);
        const franken = await connectFranken();
        const status = await franken.getDeviceStatus(false);
        const rawStatus = getLastRawDeviceData();
        await settingsDB.read();
        await comfortDB.read();
        const storage = await fs.promises.statfs('/persistent').catch(() => null);
        const vitals = { left: await latestVitals('left'), right: await latestVitals('right') };
        const coverSide = (side) => {
            const probes = bedTemp?.[side];
            const cap = capSense?.[side];
            const presence = getPresence(side);
            return {
                bedF: round1(bedTemperatureF(side)),
                probes: {
                    out: centiCToF(probes?.out), cen: centiCToF(probes?.cen), in: centiCToF(probes?.in), side: centiCToF(probes?.side),
                },
                capacitance: {
                    out: num(cap?.out), cen: num(cap?.cen), in: num(cap?.in),
                    status: typeof cap?.status === 'string' ? cap.status : null,
                    baseline: capBaseline(side),
                },
                presence: { present: presence.present, since: presence.changedAt },
                vitals: vitals[side],
            };
        };
        const hubSide = (side) => {
            const therm = frzTherm?.[side];
            const health = frzHealth?.[side];
            return {
                waterF: centiCToF(frzTemp?.[side]),
                targetF: cToF(therm?.target),
                output: num(therm?.power),
                enabled: typeof therm?.enabled === 'boolean' ? therm.enabled : null,
                pumpRpm: num(health?.pump?.rpm),
                pumpMode: typeof health?.pump?.mode === 'string' ? health.pump.mode : null,
                waterDetected: typeof health?.pump?.water === 'boolean' ? health.pump.water : null,
            };
        };
        const controlSide = (side) => {
            const bed = bedControlEnabled() ? bedSide(side) : null;
            return {
                isOn: status[side].isOn,
                secondsRemaining: status[side].secondsRemaining,
                awayMode: settingsDB.data[side].awayMode,
                setpointF: bed?.setpointF ?? null,
                offsetF: bed ? Math.round(bed.offsetF * 100) / 100 : null,
                waterLevel: status[side].currentTemperatureLevel,
                isAlarmVibrating: status[side].isAlarmVibrating,
                lastButton: lastButtonPress[side],
                sensorGain: num(side === 'left' ? status.settings?.gainLeft : status.settings?.gainRight),
            };
        };
        // Piezo records carry ~1 s of 500 Hz samples per channel; only the header is useful here
        const piezoHeader = piezo
            ? Object.fromEntries(Object.entries(piezo).filter(([, v]) => !Buffer.isBuffer(v) && !(v instanceof Uint8Array)))
            : null;
        const telemetry = {
            at: new Date().toISOString(),
            cover: {
                at: isoFromTs(bedTemp),
                roomF: centiCToF(bedTemp?.amb),
                humidity: num(bedTemp?.hu) === null ? null : round1(bedTemp?.hu / 100),
                boardF: centiCToF(bedTemp?.mcu),
                piezo: piezo ? { sampleRateHz: num(piezo.freq), gain: num(piezo.gain) } : null,
                sides: { left: coverSide('left'), right: coverSide('right') },
            },
            hub: {
                at: isoFromTs(frzTemp ?? frzHealth),
                airF: centiCToF(frzTemp?.amb),
                heatsinkF: centiCToF(frzTemp?.hs),
                fanTopRpm: num(frzHealth?.fan?.top?.rpm),
                fanBottomRpm: num(frzHealth?.fan?.bottom?.rpm),
                waterTankOk: status.waterLevel === 'true' ? true : status.waterLevel === 'false' ? false : null,
                priming: status.isPriming,
                needsPrime: rawStatus.needsPrime === undefined ? null : rawStatus.needsPrime !== '0',
                sides: { left: hubSide('left'), right: hubSide('right') },
            },
            controls: {
                bedControl: bedControlEnabled(),
                ledBrightness: num(status.settings?.ledBrightness),
                sides: { left: controlSide('left'), right: controlSide('right') },
            },
            accessories: {
                blanket: Object.fromEntries(SIDES.map((side) => [
                    side, typeof blanket?.[side]?.is_connected === 'boolean' ? blanket[side].is_connected : null,
                ])),
            },
            system: {
                uptimeSeconds: Math.round(os.uptime()),
                load: os.loadavg().map((l) => Math.round(l * 100) / 100),
                memoryTotalMB: Math.round(os.totalmem() / 1024 / 1024),
                memoryAvailableMB: memoryAvailableMB(),
                storageTotalGB: storage ? Math.round(storage.blocks * storage.bsize / 1e8) / 10 : null,
                storageFreeGB: storage ? Math.round(storage.bavail * storage.bsize / 1e8) / 10 : null,
                cpuC: cpuCelsius(),
                wifiStrength: status.wifiStrength,
                clockSynced: fs.existsSync('/run/systemd/timesync/synchronized'),
                freeSleepVersion: status.freeSleep.version,
                coverVersion: status.coverVersion,
                hubVersion: status.hubVersion,
                sensorLabel: rawStatus.sensorLabel ? rawStatus.sensorLabel.replace(/"/g, '') : null,
            },
            raw: {
                ...Object.fromEntries(Object.entries(raw).filter(([type]) => type !== 'piezo-dual')),
                'piezo-dual': piezoHeader,
                deviceStatus: Object.fromEntries(Object.entries(rawStatus).filter(([key]) => key !== 'settings')),
            },
        };
        res.json(telemetry);
    }
    catch (error) {
        logger.error(error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});
export default router;
//# sourceMappingURL=telemetry.js.map