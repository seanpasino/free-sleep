#!/usr/bin/env python3
"""Correlate bedTemp with capSense readings to investigate temperature dependency."""
import struct
import gc
from datetime import datetime, timedelta, timezone
from pathlib import Path
import cbor2

FOLDER = '/persistent'
WINDOW_HOURS = 18

def _read_raw_record(f):
    b = f.read(1)
    if not b:
        raise EOFError
    if b[0] != 0xa2:
        raise ValueError('bad map')
    if f.read(4) != b'\x63\x73\x65\x71':
        raise ValueError('bad seq')
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
        raise ValueError('bad seq enc')
    if f.read(5) != b'\x64\x64\x61\x74\x61':
        raise ValueError('bad data key')
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
        raise ValueError('bad len enc')
    data = f.read(length)
    if len(data) < length:
        raise EOFError
    if not data:
        return None
    return data


def main():
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=WINDOW_HOURS)

    raw_files = sorted(
        [p for p in Path(FOLDER).glob('*.RAW') if p.name != 'SEQNO.RAW'],
        key=lambda p: p.stat().st_mtime
    )
    cutoff_mtime = start.timestamp() - 3600
    relevant = [str(p) for p in raw_files if p.stat().st_mtime >= cutoff_mtime]

    if not relevant:
        print("No RAW files found.")
        return

    last_cap = None
    last_bed = None
    last_blanket = None
    last_print = None

    hdr = (
        f"{'Time':>10s}  "
        f"{'Lc_out':>6s} {'Lc_cen':>6s} {'Lc_in':>6s}  "
        f"{'Rc_out':>6s} {'Rc_cen':>6s} {'Rc_in':>6s}  "
        f"{'Lt_out':>6s} {'Lt_cen':>6s} {'Lt_in':>6s}  "
        f"{'Rt_out':>6s} {'Rt_cen':>6s} {'Rt_in':>6s}  "
        f"{'bl_L':>6s} {'bl_R':>6s}"
    )
    print(hdr)
    print('-' * len(hdr))

    for fp in relevant:
        with open(fp, 'rb') as f:
            while True:
                try:
                    data_bytes = _read_raw_record(f)
                    if data_bytes is None:
                        continue
                    d = cbor2.loads(data_bytes)
                    if not isinstance(d, dict):
                        continue
                    ts_val = d.get('ts')
                    if ts_val is None:
                        continue
                    ts = datetime.fromtimestamp(ts_val, timezone.utc)
                    if ts < start:
                        continue

                    t = d.get('type')
                    if t == 'capSense':
                        last_cap = d
                    elif t == 'bedTemp':
                        last_bed = d
                    elif t == 'blanketReadings':
                        last_blanket = d

                    if t == 'capSense' and last_cap and last_bed:
                        if last_print is None or (ts - last_print).total_seconds() >= 300:
                            last_print = ts
                            lc = last_cap.get('left', {})
                            rc = last_cap.get('right', {})
                            lb = last_bed.get('left', {})
                            rb = last_bed.get('right', {})
                            bl_temp = ''
                            br_temp = ''
                            if last_blanket:
                                bl_l = last_blanket.get('left', {})
                                bl_r = last_blanket.get('right', {})
                                if isinstance(bl_l, dict):
                                    bl_temp = '{:.1f}'.format(bl_l.get('temp', 0))
                                if isinstance(bl_r, dict):
                                    br_temp = '{:.1f}'.format(bl_r.get('temp', 0))

                            time_str = ts.strftime('%H:%M')
                            print(
                                '{:>10s}  '
                                '{:>6} {:>6} {:>6}  '
                                '{:>6} {:>6} {:>6}  '
                                '{:>6} {:>6} {:>6}  '
                                '{:>6} {:>6} {:>6}  '
                                '{:>6s} {:>6s}'.format(
                                    time_str,
                                    lc.get('out', '?'), lc.get('cen', '?'), lc.get('in', '?'),
                                    rc.get('out', '?'), rc.get('cen', '?'), rc.get('in', '?'),
                                    lb.get('out', '?'), lb.get('cen', '?'), lb.get('in', '?'),
                                    rb.get('out', '?'), rb.get('cen', '?'), rb.get('in', '?'),
                                    bl_temp, br_temp,
                                )
                            )
                except EOFError:
                    break
                except Exception:
                    pass
        gc.collect()


if __name__ == '__main__':
    main()
