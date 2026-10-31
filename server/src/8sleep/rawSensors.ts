// Reads the newest temperature records from the firmware's RAW sensor files in /persistent.
// Each file holds ~15 min of CBOR records ({seq, data}); data is itself CBOR with a `type`.
import fs from 'fs';
import path from 'path';
import cbor from 'cbor';

const RAW_FOLDER = '/persistent';
const TAIL_BYTES = 256 * 1024;
const STALE_SECONDS = 10 * 60;
const RECORD_MARKER = Buffer.from([0xa2, 0x63, 0x73, 0x65, 0x71]); // map(2), "seq"
const DATA_KEY = Buffer.from([0x64, 0x64, 0x61, 0x74, 0x61]); // "data"
const WANTED_TYPES = ['bedTemp', 'frzTemp', 'frzTherm'];

type Sides<T> = { left: T; right: T };
// out = outer edge, cen = middle of the side, in = toward the middle of the bed, side = a fourth
// probe whose spot is undocumented (on an occupied side it tracks cen)
type SurfaceTemps = { out: number; cen: number; in: number; side: number };

export type SensorSnapshot = {
  ts: number;
  // bedTemp's ambient; null when it is stale, which means no room offset
  roomF: number | null;
  humidity: number | null;
  waterF: Sides<number> | null;
  waterTargetF: Sides<number> | null;
  heatingEnabled: Sides<boolean> | null;
  // Hub output per side, negative while cooling
  power: Sides<number> | null;
  surfaceF: Sides<SurfaceTemps> | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRecord = Record<string, any>;

const centiCToF = (centiC: number) => Math.round((centiC / 100 * 9 / 5 + 32) * 10) / 10;
const cToF = (c: number) => Math.round((c * 9 / 5 + 32) * 10) / 10;

const newestRawFiles = (count: number): string[] => {
  return fs.readdirSync(RAW_FOLDER)
    .filter(name => name.endsWith('.RAW') && name !== 'SEQNO.RAW')
    .map(name => path.join(RAW_FOLDER, name))
    .map(filePath => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime)
    .slice(-count)
    .map(f => f.filePath);
};

const readTail = (filePath: string): Buffer => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
};

// Returns the inner `data` bytes of the record starting at `start`, or null if it is cut off.
const recordData = (buffer: Buffer, start: number): Buffer | null => {
  let pos = start + RECORD_MARKER.length;
  const seqInfo = buffer[pos] & 0x1f;
  pos += 1 + (seqInfo < 24 ? 0 : 2 ** (seqInfo - 24));
  if (!buffer.subarray(pos, pos + DATA_KEY.length).equals(DATA_KEY)) return null;
  pos += DATA_KEY.length;

  const header = buffer[pos];
  if (header === undefined || header >> 5 !== 2) return null;
  const info = header & 0x1f;
  pos += 1;
  let length: number;
  if (info < 24) {
    length = info;
  } else if (info === 24) {
    length = buffer.readUInt8(pos); pos += 1;
  } else if (info === 25) {
    length = buffer.readUInt16BE(pos); pos += 2;
  } else if (info === 26) {
    length = buffer.readUInt32BE(pos); pos += 4;
  } else {
    return null;
  }
  if (pos + length > buffer.length) return null;
  return buffer.subarray(pos, pos + length);
};

// Decodes only the newest complete record of each type (piezo records are large)
const latestRecords = (wantedTypes: string[] = WANTED_TYPES): Record<string, RawRecord> => {
  const candidates: Record<string, Buffer[]> = {};
  for (const filePath of newestRawFiles(2)) {
    const buffer = readTail(filePath);
    let index = buffer.indexOf(RECORD_MARKER);
    while (index !== -1) {
      const data = recordData(buffer, index);
      if (data) {
        const head = data.subarray(0, 40).toString('latin1');
        const type = wantedTypes.find(t => head.includes(t));
        if (type) (candidates[type] ??= []).push(data);
      }
      index = buffer.indexOf(RECORD_MARKER, index + 1);
    }
  }
  const latest: Record<string, RawRecord> = {};
  for (const [type, records] of Object.entries(candidates)) {
    for (let i = records.length - 1; i >= 0; i--) {
      try {
        latest[type] = cbor.decodeFirstSync(records[i]) as RawRecord;
        break;
      } catch {
        // A record split across the tail boundary; try the one before
      }
    }
  }
  return latest;
};

// The newest record of each type in the last two RAW files (for the Telemetry page)
export const readLatestRecords = (types: string[]): Record<string, RawRecord> => latestRecords(types);

export const readLatestSensors = (): SensorSnapshot | null => {
  const { bedTemp, frzTemp, frzTherm } = latestRecords();
  if (!bedTemp) return null;

  const fresh = (record?: RawRecord) => record && Date.now() / 1000 - record.ts < STALE_SECONDS;
  // Only bedTemp's ambient tracks the room (HA bedroom sensor -0.3 ± 0.5°F, idle or running).
  // frzTemp's sits in the pump unit and follows the water and heatsink: 7°F low after an idle
  // evening, 2°F high while cooling, and falling while warming.
  const roomCentiC = fresh(bedTemp) && typeof bedTemp.amb === 'number' ? bedTemp.amb : null;
  const surface = (side: RawRecord) => ({
    out: centiCToF(side.out),
    cen: centiCToF(side.cen),
    in: centiCToF(side.in),
    side: centiCToF(side.side),
  });

  return {
    ts: bedTemp.ts,
    roomF: roomCentiC === null ? null : centiCToF(roomCentiC),
    humidity: fresh(bedTemp) ? bedTemp.hu / 100 : null,
    waterF: frzTemp ? { left: centiCToF(frzTemp.left), right: centiCToF(frzTemp.right) } : null,
    waterTargetF: frzTherm ? { left: cToF(frzTherm.left.target), right: cToF(frzTherm.right.target) } : null,
    heatingEnabled: frzTherm ? { left: !!frzTherm.left.enabled, right: !!frzTherm.right.enabled } : null,
    power: frzTherm ? { left: frzTherm.left.power, right: frzTherm.right.power } : null,
    surfaceF: { left: surface(bedTemp.left), right: surface(bedTemp.right) },
  };
};
