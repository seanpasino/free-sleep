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
const centiCToF = (centiC) => Math.round((centiC / 100 * 9 / 5 + 32) * 10) / 10;
const cToF = (c) => Math.round((c * 9 / 5 + 32) * 10) / 10;
const newestRawFiles = (count) => {
    return fs.readdirSync(RAW_FOLDER)
        .filter(name => name.endsWith('.RAW') && name !== 'SEQNO.RAW')
        .map(name => path.join(RAW_FOLDER, name))
        .map(filePath => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime)
        .slice(-count)
        .map(f => f.filePath);
};
const readTail = (filePath) => {
    const fd = fs.openSync(filePath, 'r');
    try {
        const size = fs.fstatSync(fd).size;
        const length = Math.min(size, TAIL_BYTES);
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, size - length);
        return buffer;
    }
    finally {
        fs.closeSync(fd);
    }
};
// Returns the inner `data` bytes of the record starting at `start`, or null if it is cut off.
const recordData = (buffer, start) => {
    let pos = start + RECORD_MARKER.length;
    const seqInfo = buffer[pos] & 0x1f;
    pos += 1 + (seqInfo < 24 ? 0 : 2 ** (seqInfo - 24));
    if (!buffer.subarray(pos, pos + DATA_KEY.length).equals(DATA_KEY))
        return null;
    pos += DATA_KEY.length;
    const header = buffer[pos];
    if (header === undefined || header >> 5 !== 2)
        return null;
    const info = header & 0x1f;
    pos += 1;
    let length;
    if (info < 24) {
        length = info;
    }
    else if (info === 24) {
        length = buffer.readUInt8(pos);
        pos += 1;
    }
    else if (info === 25) {
        length = buffer.readUInt16BE(pos);
        pos += 2;
    }
    else if (info === 26) {
        length = buffer.readUInt32BE(pos);
        pos += 4;
    }
    else {
        return null;
    }
    if (pos + length > buffer.length)
        return null;
    return buffer.subarray(pos, pos + length);
};
const latestRecords = () => {
    const latest = {};
    for (const filePath of newestRawFiles(2)) {
        const buffer = readTail(filePath);
        let index = buffer.indexOf(RECORD_MARKER);
        while (index !== -1) {
            const data = recordData(buffer, index);
            if (data) {
                const head = data.subarray(0, 40).toString('latin1');
                const type = WANTED_TYPES.find(t => head.includes(t));
                if (type) {
                    try {
                        latest[type] = cbor.decodeFirstSync(data);
                    }
                    catch {
                        // A record split across the tail boundary; the next one will do
                    }
                }
            }
            index = buffer.indexOf(RECORD_MARKER, index + 1);
        }
    }
    return latest;
};
export const readLatestSensors = () => {
    const { bedTemp, frzTemp, frzTherm } = latestRecords();
    if (!bedTemp)
        return null;
    const fresh = (record) => record && Date.now() / 1000 - record.ts < STALE_SECONDS;
    // Only bedTemp's ambient tracks the room (HA bedroom sensor -0.3 ± 0.5°F, idle or running).
    // frzTemp's sits in the pump unit and follows the water and heatsink: 7°F low after an idle
    // evening, 2°F high while cooling, and falling while warming.
    const roomCentiC = fresh(bedTemp) && typeof bedTemp.amb === 'number' ? bedTemp.amb : null;
    const surface = (side) => ({
        out: centiCToF(side.out),
        cen: centiCToF(side.cen),
        in: centiCToF(side.in),
    });
    return {
        ts: bedTemp.ts,
        roomF: roomCentiC === null ? null : centiCToF(roomCentiC),
        humidity: fresh(bedTemp) ? bedTemp.hu / 100 : null,
        waterF: frzTemp ? { left: centiCToF(frzTemp.left), right: centiCToF(frzTemp.right) } : null,
        waterTargetF: frzTherm ? { left: cToF(frzTherm.left.target), right: cToF(frzTherm.right.target) } : null,
        heatingEnabled: frzTherm ? { left: !!frzTherm.left.enabled, right: !!frzTherm.right.enabled } : null,
        surfaceF: { left: surface(bedTemp.left), right: surface(bedTemp.right) },
    };
};
//# sourceMappingURL=rawSensors.js.map