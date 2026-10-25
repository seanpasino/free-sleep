"""
Capacitance confirmation for bed presence: is a person-sized load on this side?

Presence is the summed SIGNED rise of the three channels (out/cen/in) over an empty-bed
baseline. A body only adds capacitance, so a reading below the baseline is never a person.

The baseline is never re-anchored to the current reading. The old dual-EMA gate copied the
current reading into the baseline every time presence cleared; if that happened while the
sleeper was getting in or shifting, part of their load became the "empty" level and the score
sat at the threshold all night (and once presence dropped, the sleeper could not come back
until they got up). Instead:

- Down: any channel reading below its baseline pulls it down within a couple of minutes, so a
  baseline learned with someone in bed, or before the bedding moved, recovers on its own.
- Up: the baseline follows a higher reading only slowly, and only while the side is not
  present, so a load is never learned as empty while someone is in bed.
- Hysteresis: a load must rise past ENTER_RISE to confirm presence and stays confirmed down to
  EXIT_RISE, so a reading near the threshold can't flap.

The baseline is saved to disk and restored on start, so a restart or the daily reboot with
someone in bed doesn't learn their load as empty.

Pod 5 (legacy integer capSense, 2 Hz), night of 2026-10-23: right side empty ~4600-5450 summed
over the three channels, drifting with bedding and temperature; the sleeper added 2816 at the
0.1th percentile, median 3552. A solo sleeper also loads the other side's inner channel: the
empty (away) side rose by up to 2331, which is why an away side never confirms (see
BiometricProcessor) and ENTER_RISE sits above the old 1500.
"""
import json
import math
import os
import time
from typing import Optional, Dict

from get_logger import get_logger

logger = get_logger()

CHANNELS = ('out', 'cen', 'in')

ENTER_RISE = 2000.0           # Summed rise over baseline to confirm a person (old gate: 1500)
EXIT_RISE = 1000.0            # Stay confirmed down to this
SMOOTHING_TAU_S = 5.0         # Reading smoothing before comparison
BASELINE_DOWN_TAU_S = 120.0   # A reading below baseline pulls it down this fast
BASELINE_UP_TAU_S = 1800.0    # Baseline follows a higher reading this slowly, only while not present
MAX_STEP_S = 5.0              # A gap in the data can't move the baseline in one step
WARMUP_S = 60.0               # Without a saved baseline, confirmation is skipped while it settles
SAVE_INTERVAL_S = 900.0
STATE_MAX_AGE_S = 7 * 24 * 3600


class CapPresence:
    def __init__(self, side: str, state_dir: Optional[str] = '/persistent/free-sleep-data'):
        self.side = side
        self.state_path = os.path.join(state_dir, f'cap-baseline-{side}.json') if state_dir else None
        self.reading: Optional[Dict[str, float]] = None
        self.baseline: Optional[Dict[str, float]] = None
        self.rise = 0.0
        self.confirmed = False
        self.last_ts: Optional[float] = None
        self.first_ts: Optional[float] = None
        self.restored = False
        self.last_save = 0.0
        self._load()

    def update(self, side_data: dict, ts: float, present: bool):
        """Feed one capSense frame for this side. `present` is the side's current presence."""
        if not side_data or side_data.get('status') != 'good':
            return
        values = {c: float(side_data.get(c, 0)) for c in CHANNELS}

        if self.reading is None:
            self.reading = dict(values)
            if self.baseline is None:
                self.baseline = dict(values)
            self.first_ts = self.last_ts = ts
            return

        dt = min(max(ts - self.last_ts, 0.0), MAX_STEP_S)
        self.last_ts = ts
        smooth = 1 - math.exp(-dt / SMOOTHING_TAU_S)
        down = 1 - math.exp(-dt / BASELINE_DOWN_TAU_S)
        up = 1 - math.exp(-dt / BASELINE_UP_TAU_S)

        for c in CHANNELS:
            self.reading[c] += (values[c] - self.reading[c]) * smooth
            if self.reading[c] < self.baseline[c]:
                self.baseline[c] += (self.reading[c] - self.baseline[c]) * down
            elif not present:
                self.baseline[c] += (self.reading[c] - self.baseline[c]) * up

        self.rise = sum(self.reading[c] - self.baseline[c] for c in CHANNELS)
        if self.confirmed:
            self.confirmed = self.rise >= EXIT_RISE
        else:
            self.confirmed = self.rise >= ENTER_RISE

        if ts - self.last_save >= SAVE_INTERVAL_S:
            self.save(ts)

    def is_confirmed(self) -> bool:
        if self.baseline is None:
            return True
        if not self.restored and (self.last_ts is None or self.last_ts - self.first_ts < WARMUP_S):
            return True
        return self.confirmed

    def save(self, ts: Optional[float] = None):
        if self.baseline is None or self.state_path is None:
            return
        self.last_save = ts if ts is not None else time.time()
        tmp = self.state_path + '.tmp'
        try:
            with open(tmp, 'w') as f:
                json.dump({'baseline': self.baseline, 'saved_at': self.last_save}, f)
            os.replace(tmp, self.state_path)
        except OSError as e:
            logger.warning(f'Could not save cap baseline for {self.side}: {e}')

    def _load(self):
        if self.state_path is None or not os.path.exists(self.state_path):
            return
        try:
            with open(self.state_path) as f:
                state = json.load(f)
            baseline = state['baseline']
            if time.time() - float(state['saved_at']) > STATE_MAX_AGE_S:
                return
            self.baseline = {c: float(baseline[c]) for c in CHANNELS}
            self.restored = True
            logger.info(f'Cap baseline restored on {self.side}: ' + ' '.join(f'{c}={self.baseline[c]:.0f}' for c in CHANNELS))
        except (OSError, ValueError, KeyError, TypeError) as e:
            logger.warning(f'Ignoring cap baseline file for {self.side}: {e}')
