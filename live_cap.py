#!/usr/bin/env python3
"""
Display all capSense and piezo-dual records from the last 20 minutes of RAW files.
"""
import struct
import sys
import os
import gc
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cbor2
import numpy as np

FOLDER = '/persistent'
WINDOW_MINUTES = 20


def _read_raw_record(f):
    b = f.read(1)
    if not b:
        raise EOFError
    if b[0] != 0xa2:
        raise ValueError('Expected outer map 0xa2, got 0x%02x' % b[0])
    if f.read(4) != b'\x63\x73\x65\x71':
        raise ValueError('Expected seq key')
    hdr = f.read(1)
    if not hdr:
        raise EOFError
    if hdr[0] == 0x1a:
        seq_bytes = f.read(4)
        if len(seq_bytes) < 4:
            raise EOFError
    elif hdr[0] == 0x1b:
        seq_bytes = f.read(8)
        if len(seq_bytes) < 8:
            raise EOFError
    else:
        raise ValueError('Unexpected seq encoding: 0x%02x' % hdr[0])
    if f.read(5) != b'\x64\x64\x61\x74\x61':
        raise ValueError('Expected data key')
    bs = f.read(1)
    if not bs:
        raise EOFError
    ai = bs[0] & 0x1f
    if ai <= 23:
        length = ai
    elif ai == 24:
        lb = f.read(1)
        if not lb:
            raise EOFError
        length = lb[0]
    elif ai == 25:
        lb = f.read(2)
        if len(lb) < 2:
            raise EOFError
        length = struct.unpack('>H', lb)[0]
    elif ai == 26:
        lb = f.read(4)
        if len(lb) < 4:
            raise EOFError
        length = struct.unpack('>I', lb)[0]
    else:
        raise ValueError('Unsupported length encoding: %d' % ai)
    data = f.read(length)
    if len(data) < length:
        raise EOFError
    if not data:
        return None
    return data


def decode_file(file_path, start_time, end_time, want_types):
    records = []
    with open(file_path, 'rb') as f:
        while True:
            try:
                data_bytes = _read_raw_record(f)
                if data_bytes is None:
                    continue
                d = cbor2.loads(data_bytes)
                if d['type'] not in want_types:
                    continue
                ts = datetime.fromtimestamp(d['ts'], timezone.utc)
                if not (start_time <= ts <= end_time):
                    continue
                d['_ts_dt'] = ts
                if d['type'] == 'piezo-dual':
                    for ch in ('left1', 'left2', 'right1', 'right2'):
                        if ch in d and isinstance(d[ch], bytes):
                            d[ch] = np.frombuffer(d[ch], dtype=np.int32)
                records.append(d)
            except EOFError:
                break
            except Exception as e:
                pass
    return records


def fmt_ts(dt):
    return dt.astimezone().strftime('%H:%M:%S')


def print_cap(d):
    ts = fmt_ts(d['_ts_dt'])
    left = d.get('left', {})
    right = d.get('right', {})
    print(f"[{ts}] capSense")
    print(f"  left  out={left.get('out','?'):5}  cen={left.get('cen','?'):5}  in={left.get('in','?'):5}  status={left.get('status','?')}")
    print(f"  right out={right.get('out','?'):5}  cen={right.get('cen','?'):5}  in={right.get('in','?'):5}  status={right.get('status','?')}")


def print_piezo(d):
    ts = fmt_ts(d['_ts_dt'])
    freq = d.get('freq', '?')
    gain = d.get('gain', '?')
    adc  = d.get('adc', '?')
    print(f"[{ts}] piezo-dual  freq={freq}Hz  gain={gain}  adc={adc}")
    for ch in ('left1', 'left2', 'right1', 'right2'):
        arr = d.get(ch)
        if arr is not None and len(arr) > 0:
            rng = int(np.ptp(arr.astype(np.int64)))
            mn  = int(arr.min())
            mx  = int(arr.max())
            print(f"  {ch:7s}  n={len(arr):4d}  range={rng:10,}  min={mn:12,}  max={mx:12,}")
        else:
            print(f"  {ch:7s}  (no data)")


def main():
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=WINDOW_MINUTES)

    raw_files = sorted(
        [p for p in Path(FOLDER).glob('*.RAW') if p.name != 'SEQNO.RAW'],
        key=lambda p: p.stat().st_mtime
    )

    # Keep files that could overlap with our window (modified after window start)
    cutoff_mtime = start.timestamp()
    relevant = [str(p) for p in raw_files if p.stat().st_mtime >= cutoff_mtime - 900]

    if not relevant:
        print("No RAW files found in the last 20 minutes.")
        sys.exit(1)

    want = {'capSense', 'piezo-dual'}
    all_records = []
    for fp in relevant:
        recs = decode_file(fp, start, now, want)
        all_records.extend(recs)
        gc.collect()

    all_records.sort(key=lambda d: d['_ts_dt'])

    if not all_records:
        print(f"No capSense or piezo-dual records in the last {WINDOW_MINUTES} minutes.")
        sys.exit(0)

    print(f"=== RAW data: {start.astimezone().strftime('%H:%M:%S')} -> {now.astimezone().strftime('%H:%M:%S')} ({len(all_records)} records) ===\n")

    for d in all_records:
        if d['type'] == 'capSense':
            print_cap(d)
        elif d['type'] == 'piezo-dual':
            print_piezo(d)
        print()


if __name__ == '__main__':
    main()
