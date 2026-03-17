#!/usr/bin/env python3
"""
Replay all capSense records through the dual-EMA algorithm and print
per-sensor diagnostics at every detection-relevant event.

Run on device:
/home/dac/venv/bin/python3 /home/dac/free-sleep/cap_replay.py
"""
import struct
import sys
import os
import gc
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cbor2

FOLDER = '/persistent'
# Go back far enough to capture overnight data from service start (~23:44 UTC Mar 15)
WINDOW_HOURS = 18

# Same constants as biometric_processor.py
CAP_FAST_ALPHA = 0.1
CAP_SLOW_ALPHA = 0.002
CAP_STABLE_THRESHOLD = 30
CAP_STD = 10.0
CAP_SCORE_THRESHOLD = 30.0
CAP_INIT_PERIOD = 120
CAP_MIN_SAMPLES = 120


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


def decode_cap_records(file_path, start_time, end_time):
    records = []
    with open(file_path, 'rb') as f:
        while True:
            try:
                data_bytes = _read_raw_record(f)
                if data_bytes is None:
                    continue
                d = cbor2.loads(data_bytes)
                if d.get('type') != 'capSense':
                    continue
                ts = datetime.fromtimestamp(d['ts'], timezone.utc)
                if not (start_time <= ts <= end_time):
                    continue
                d['_ts_dt'] = ts
                records.append(d)
            except EOFError:
                break
            except Exception:
                pass
    return records


def fmt_ts(dt):
    return dt.astimezone().strftime('%H:%M:%S')


def run_ema_simulation(records, side):
    """Simulate the dual-EMA algorithm for one side and print diagnostics."""
    cap_fast = None
    cap_slow = None
    n = 0
    last_score = 0.0

    # For detecting score transitions (crossing threshold)
    last_above = False
    above_count = 0

    # Print every N samples for overview, plus any threshold crossings
    PRINT_INTERVAL = 120  # every 60 seconds at 2Hz

    print(f"\n{'='*100}")
    print(f"  SIDE: {side.upper()}")
    print(f"{'='*100}")
    print(f"{'Time':>10s}  {'#':>5s}  {'raw_out':>8s} {'raw_cen':>8s} {'raw_in':>8s}  "
          f"{'f_out':>8s} {'f_cen':>8s} {'f_in':>8s}  "
          f"{'s_out':>8s} {'s_cen':>8s} {'s_in':>8s}  "
          f"{'d_out':>7s} {'d_cen':>7s} {'d_in':>7s}  "
          f"{'score':>7s}  {'note':s}")
    print('-' * 145)

    for rec in records:
        side_data = rec.get(side, {})
        if not side_data or side_data.get('status') != 'good':
            continue

        out = float(side_data.get('out', 0))
        cen = float(side_data.get('cen', 0))
        in_ = float(side_data.get('in', 0))

        n += 1

        if cap_fast is None:
            cap_fast = {'out': out, 'cen': cen, 'in': in_}
            cap_slow = {'out': out, 'cen': cen, 'in': in_}
            continue

        fa = CAP_FAST_ALPHA
        cap_fast['out'] = (1 - fa) * cap_fast['out'] + fa * out
        cap_fast['cen'] = (1 - fa) * cap_fast['cen'] + fa * cen
        cap_fast['in'] = (1 - fa) * cap_fast['in'] + fa * in_

        dev_out = abs(cap_fast['out'] - cap_slow['out'])
        dev_cen = abs(cap_fast['cen'] - cap_slow['cen'])
        dev_in = abs(cap_fast['in'] - cap_slow['in'])

        # Signed cen deviation (positive = human signal)
        signed_cen = cap_fast['cen'] - cap_slow['cen']

        if n <= CAP_INIT_PERIOD:
            sa = CAP_FAST_ALPHA
        elif dev_out < CAP_STABLE_THRESHOLD and dev_cen < CAP_STABLE_THRESHOLD and dev_in < CAP_STABLE_THRESHOLD:
            sa = CAP_SLOW_ALPHA
        else:
            sa = None

        if sa is not None:
            cap_slow['out'] = (1 - sa) * cap_slow['out'] + sa * out
            cap_slow['cen'] = (1 - sa) * cap_slow['cen'] + sa * cen
            cap_slow['in'] = (1 - sa) * cap_slow['in'] + sa * in_

        if n >= CAP_MIN_SAMPLES:
            last_score = (dev_out + dev_cen + dev_in) / CAP_STD
        else:
            last_score = 0.0

        currently_above = last_score >= CAP_SCORE_THRESHOLD
        note = ''

        if currently_above and not last_above:
            note = '>>> CROSSED ABOVE THRESHOLD'
            above_count = 0
        elif not currently_above and last_above:
            note = '<<< DROPPED BELOW THRESHOLD'
        if currently_above:
            above_count += 1
            if above_count == 60:  # 30 seconds at 2Hz
                note = '*** WOULD TRIGGER DETECTION (30s sustained) ***'

        # Print at interval, or on any threshold crossing, or at end of warmup
        should_print = (
            n % PRINT_INTERVAL == 0 or
            note != '' or
            n == CAP_INIT_PERIOD or
            n == CAP_MIN_SAMPLES
        )

        if should_print:
            warmup_note = ''
            if n <= CAP_INIT_PERIOD:
                warmup_note = ' [WARMUP]'
            elif n == CAP_MIN_SAMPLES:
                warmup_note = ' [GATE ON]'

            print(f"{fmt_ts(rec['_ts_dt']):>10s}  {n:5d}  "
                  f"{out:8.0f} {cen:8.0f} {in_:8.0f}  "
                  f"{cap_fast['out']:8.1f} {cap_fast['cen']:8.1f} {cap_fast['in']:8.1f}  "
                  f"{cap_slow['out']:8.1f} {cap_slow['cen']:8.1f} {cap_slow['in']:8.1f}  "
                  f"{dev_out:7.1f} {dev_cen:7.1f} {dev_in:7.1f}  "
                  f"{last_score:7.1f}  {note}{warmup_note}")

        last_above = currently_above

    print(f"\nTotal cap samples processed for {side}: {n}")


def main():
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=WINDOW_HOURS)

    raw_files = sorted(
        [p for p in Path(FOLDER).glob('*.RAW') if p.name != 'SEQNO.RAW'],
        key=lambda p: p.stat().st_mtime
    )

    cutoff_mtime = start.timestamp()
    relevant = [str(p) for p in raw_files if p.stat().st_mtime >= cutoff_mtime - 3600]

    if not relevant:
        print("No RAW files found.")
        sys.exit(1)

    all_records = []
    for fp in relevant:
        recs = decode_cap_records(fp, start, now)
        all_records.extend(recs)
        gc.collect()

    all_records.sort(key=lambda d: d['_ts_dt'])

    if not all_records:
        print("No capSense records found.")
        sys.exit(0)

    print(f"=== Cap EMA Replay: {start.astimezone().strftime('%H:%M:%S')} -> "
          f"{now.astimezone().strftime('%H:%M:%S')} ({len(all_records)} cap records) ===")

    for side in ('left', 'right'):
        run_ema_simulation(all_records, side)


if __name__ == '__main__':
    main()
