"""
This module defines the `BiometricProcessor` class, which processes biometric signals
from piezoelectric sensors to extract heart rate, heart rate variability (HRV), and
breathing rate. It applies signal cleaning, filtering, and outlier detection to ensure
accurate physiological measurements.

Key functionalities:
- Detects user presence based on piezo signal range.
- Applies preprocessing steps such as outlier interpolation, scaling, and filtering.
- Extracts heart rate, HRV, and breathing rate using a sliding window approach.
- Validates heart rate values against defined thresholds to reduce false positives.
- Periodically inserts smoothed biometric data into an SQL database.
- Supports multiple sensors and handles missing or noisy signals.
- Implements garbage collection for memory efficiency.

Usage:
Instantiate `BiometricProcessor` and call `calculate_vitals(epoch, signal1, signal2)`
with sensor data to process and extract biometric metrics.
"""
import datetime
import time
import gc
from typing import Union, Tuple, TypedDict, List, Optional, Deque
import traceback
import numpy as np
import json
from collections import deque
import urllib.request
import urllib.error

from get_logger import get_logger
from heart.exceptions import BadSignalWarning
from vitals.run_data_types import RuntimeParams
from vitals.cleaning import interpolate_outliers_in_wave
from heart.preprocessing import scale_data
from heart.filtering import filter_signal, remove_baseline_wander
from heart.heartpy import process
from db import insert_vitals
from data_types import *

logger = get_logger()


class BiometricProcessor:
    heart_rates: Deque[float]   # Store last moving_avg_size heart rates (120)
    breath_rates: Deque[float]  # Store last breath rates
    hrv_rates: Deque[float]     # Store last HRV rates
    lower_bound: Optional[np.floating]  # Lower bound of HR (None if not set)
    upper_bound: Optional[np.floating]  # Upper bound of HR (None if not set)
    hr_moving_avg: Optional[np.floating]  # Current moving average heart rate
    hr_std_2: Optional[float]  # Standard deviation of heart rate
    epoch: int
    def __init__(
            self,
            side: str = 'left',
            sensor_count=1,
            runtime_params: RuntimeParams = None,
            insertion_frequency=60,
            rolling_average_size=25,
            debug=False,
            api_host='127.0.0.1',  # Added API configuration
            api_port=3000,  # Added API configuration
    ):
        self.present = False
        self.side = side
        self.sensor_count = sensor_count
        self.insertion_frequency = insertion_frequency
        self.iteration_count = 0
        self.rolling_average_size = rolling_average_size
        self.debug = debug

        # API configuration for presence updates
        self.api_host = api_host
        self.api_port = api_port
        self.presence_api_url = f'http://{api_host}:{api_port}/api/metrics/presence'

        self.heart_rate_window_seconds = 3
        self.breath_rate_window_seconds = 30
        self.breath_rate_insertion_frequency = 10

        self.hrv_window_seconds = 300
        self.hrv_insertion_frequency = 30


        if runtime_params is None:
            runtime_params: RuntimeParams = {
                'window': 3,
                'slide_by': 1,
                'moving_avg_size': 120,
                'hr_std_range': (1, 10),
                'hr_percentile': (15, 80),
                'signal_percentile': (0.2, 99.8),
                'window_size': 0.65,
            }

        self.slide_by = runtime_params['slide_by']  # Sliding window step size in seconds
        self.window = runtime_params['window']  # Window size in seconds
        self.hr_std_range = runtime_params['hr_std_range']  # Heart rate standard deviation range (lower, upper)
        self.hr_percentile = runtime_params['hr_percentile']  # Accepted percentile range for heart rate (lower, upper)
        self.moving_avg_size = runtime_params['moving_avg_size']  # Moving average window size in seconds
        self.signal_percentile = runtime_params['signal_percentile']  # Percent of outliers from raw signal to replace
        self.window_size = runtime_params['window_size']
        self.runtime_params = runtime_params
        self.init_tracking()
        self.no_presence_tolerance = 10
        self.present_tolerance = 30  # Consecutive above-threshold seconds required before declaring presence
        self.breathing_rate = 0
        self.hrv = 0
        self.not_present_for = 0
        self.present_for = 0
        self.combined_measurements: Deque[Measurement] = deque([], maxlen=100)
        self.debug_measurements: List[Measurement] = []

        # Cap-based presence gating (dual EMA to separate human from pets)
        self.CAP_FAST_ALPHA = 0.1       # Fast EMA: tracks cap changes in ~5 seconds
        self.CAP_SLOW_ALPHA = 0.002     # Slow EMA: very sticky once established
        self.CAP_STABLE_THRESHOLD = 30  # Max fast-slow deviation to allow baseline update
        self.CAP_STD = 10.0             # Fixed std for normalising the score
        self.CAP_SCORE_THRESHOLD = 150.0 # Combined score required to confirm human presence
        self.CAP_INIT_PERIOD = 120      # Samples where both EMAs use fast alpha (60s at 2Hz)
        self.CAP_MIN_SAMPLES = 120      # Gate disabled until warmup is complete
        self.cap_fast = None            # Fast EMA {out, cen, in_}
        self.cap_slow = None            # Slow EMA baseline {out, cen, in_}
        self.cap_baseline_samples = 0
        self.last_cap_score = 0.0

    def init_tracking(self):
        # Running metrics
        self.heart_rates:  Deque[float] = deque([], maxlen=self.moving_avg_size)
        self.breath_rates:  Deque[float] = deque([], maxlen=6)
        self.hrv_rates:  Deque[float] = deque([], maxlen=10)
        self.lower_bound = None
        self.upper_bound = None
        self.hr_moving_avg = None
        self.hr_std_2 = None

    def reset(self):
        self.iteration_count = 0
        self.init_tracking()

    def _update_presence_api(self, is_present: bool, retries: int = 3, retry_delay: float = 2.0):
        """
        Send presence update to the API endpoint with retry logic.

        Args:
            is_present: Boolean indicating if presence is detected
            retries: Number of attempts before giving up
            retry_delay: Seconds to wait between attempts
        """
        payload = {
            self.side: {
                "present": is_present,
            }
        }
        data = json.dumps(payload).encode('utf-8')

        for attempt in range(1, retries + 1):
            try:
                req = urllib.request.Request(
                    self.presence_api_url,
                    data=data,
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=2) as response:
                    if response.status == 200:
                        logger.debug(f'Successfully updated presence API for {self.side} side: {is_present}')
                        return
                    else:
                        response_body = response.read().decode('utf-8')
                        logger.warning(f'Presence API returned status {response.status}: {response_body}')
                        return

            except urllib.error.URLError as e:
                if isinstance(e.reason, TimeoutError):
                    logger.warning(f'Presence API timed out for {self.side} (attempt {attempt}/{retries})')
                else:
                    logger.warning(f'Could not connect to presence API for {self.side} (attempt {attempt}/{retries}): {e.reason}')
            except Exception as e:
                logger.error(f'Error updating presence API for {self.side} (attempt {attempt}/{retries}): {e}')

            if attempt < retries:
                time.sleep(retry_delay)

    def update_cap(self, cap_record: dict):
        """Update dual-EMA cap baseline and compute a human-presence score.

        Uses a fast EMA to track current cap readings and a slow EMA as a
        stable empty-bed baseline. The slow EMA only updates when the fast
        and slow EMAs are close (bed is empty / dog present), so it stays
        anchored to empty-bed values even during a full night of sleep.
        A human body causes a sustained 100-300+ count deviation across
        sensors; a dog causes essentially zero deviation.
        """
        side_data = cap_record.get(self.side, {})
        if not side_data or side_data.get('status') != 'good':
            return

        out = float(side_data.get('out', 0))
        cen = float(side_data.get('cen', 0))
        in_ = float(side_data.get('in', 0))

        self.cap_baseline_samples += 1

        if self.cap_fast is None:
            self.cap_fast = {'out': out, 'cen': cen, 'in': in_}
            self.cap_slow = {'out': out, 'cen': cen, 'in': in_}
            return

        fa = self.CAP_FAST_ALPHA
        self.cap_fast['out'] = (1 - fa) * self.cap_fast['out'] + fa * out
        self.cap_fast['cen'] = (1 - fa) * self.cap_fast['cen'] + fa * cen
        self.cap_fast['in'] = (1 - fa) * self.cap_fast['in'] + fa * in_

        dev_out = abs(self.cap_fast['out'] - self.cap_slow['out'])
        dev_cen = abs(self.cap_fast['cen'] - self.cap_slow['cen'])
        dev_in  = abs(self.cap_fast['in']  - self.cap_slow['in'])

        # During the init period both EMAs use fast alpha so they converge
        # together, preventing startup transients (e.g. animals repositioning
        # at service start) from polluting the slow baseline.
        if self.cap_baseline_samples <= self.CAP_INIT_PERIOD:
            sa = self.CAP_FAST_ALPHA
        elif dev_out < self.CAP_STABLE_THRESHOLD and dev_cen < self.CAP_STABLE_THRESHOLD and dev_in < self.CAP_STABLE_THRESHOLD:
            # Only update slow baseline when readings are stable (empty bed or pet)
            sa = self.CAP_SLOW_ALPHA
        else:
            sa = None  # Don't update slow — large deviation means someone is present

        if sa is not None:
            self.cap_slow['out'] = (1 - sa) * self.cap_slow['out'] + sa * out
            self.cap_slow['cen'] = (1 - sa) * self.cap_slow['cen'] + sa * cen
            self.cap_slow['in']  = (1 - sa) * self.cap_slow['in']  + sa * in_

        if self.cap_baseline_samples >= self.CAP_MIN_SAMPLES:
            self.last_cap_score = (dev_out + dev_cen + dev_in) / self.CAP_STD

    def detect_presence(self, signal: np.ndarray):
        signal_range = np.ptp(signal.astype(np.int64))

        # Cap gate is inactive during the 60-second warmup period.
        # The slow EMA is re-anchored to empty-bed values each time presence
        # clears, so cap_score reliably stays high while a human is present
        # and drops to ~0 within seconds of them leaving — even with pets on
        # the bed.
        cap_confirmed = (self.cap_baseline_samples < self.CAP_MIN_SAMPLES) or (self.last_cap_score >= self.CAP_SCORE_THRESHOLD)

        if signal_range > 500_000 and cap_confirmed:
            self.not_present_for = 0
            self.present_for += 1

            if not self.present and self.present_for >= self.present_tolerance:
                logger.info(f'User detected for {self.present_tolerance} consecutive seconds on {self.side} side (cap_score={self.last_cap_score:.1f}), marking present...')
                self.present = True
                self._update_presence_api(True)
        else:
            self.not_present_for += 1
            self.present_for = 0
            if self.not_present_for == self.no_presence_tolerance:
                logger.info(f'User not detected for {self.no_presence_tolerance} seconds on {self.side} side, resetting...')
                self.present = False
                # Re-anchor slow EMA to current readings so the baseline
                # reflects empty-bed (± pets) rather than stale human-sleeping
                # values that would cause false positives on the next cycle.
                if self.cap_fast is not None:
                    self.cap_slow = dict(self.cap_fast)
                    self.last_cap_score = 0.0
                    logger.info(f'Cap baseline reset on {self.side}: out={self.cap_slow["out"]:.0f} cen={self.cap_slow["cen"]:.0f} in={self.cap_slow["in"]:.0f}')
                self.reset()
                self._update_presence_api(False)

    def _calculate_vitals(self, signal: np.ndarray, epoch: int, update_breathing=False, update_hrv=False):
        try:
            # Remove outliers from signal
            data = interpolate_outliers_in_wave(
                signal,
                lower_percentile=self.signal_percentile[0],
                upper_percentile=self.signal_percentile[1],
            )

            data = scale_data(data, lower=0, upper=1024)
            data = remove_baseline_wander(data, sample_rate=500.0, cutoff=0.05)

            data = filter_signal(
                data,
                cutoff=[0.5, 20.0],
                sample_rate=500.0,
                order=2,
                filtertype='bandpass'
            )

            working_data, measurement = process(
                data,
                500,
                breathing_method='fft',
                bpmmin=40,
                bpmmax=100,
                windowsize=self.window_size,
                calculate_breathing=update_breathing,
            )
            if update_breathing:
                breathing_rate = measurement.get('breathingrate', 0) * 60
                if (8 <= breathing_rate <= 20) and not np.isnan(breathing_rate):
                    self.breath_rates.append(breathing_rate)
                    breathing_rate = sum(self.breath_rates) / len(self.breath_rates)
                    if not np.isnan(breathing_rate):
                        self.breathing_rate = breathing_rate

            if update_hrv:
                hrv = measurement['sdnn']
                if (8 <= hrv <= 200) and not np.isnan(hrv):
                    self.hrv_rates.append(hrv)
                    hrv = sum(self.hrv_rates) / len(self.hrv_rates)

                    if not np.isnan(hrv):
                        self.hrv = hrv


            if self.is_valid(measurement):
                return {
                    'side': self.side,
                    'timestamp': epoch,
                    'heart_rate': measurement['bpm'],
                    'hrv': self.hrv,
                    'breathing_rate': self.breathing_rate,
                }
        except BadSignalWarning:
            return None
        except Exception as e:
            error_message = traceback.format_exc()
            logger.error(e)
            logger.error(error_message)
            return None

    def calculate_heart_rate(self, epoch: int, signal1: np.ndarray, signal2: Union[None, np.ndarray] = None):
        self.epoch = epoch
        measurement_2 = None
        measurement_1 = self._calculate_vitals(signal1, epoch)

        if signal2 is not None:
            measurement_2 = self._calculate_vitals(signal2, epoch)

        if measurement_1 is not None and measurement_2 is not None:
            m1_heart_rate = measurement_1['heart_rate']
            m2_heart_rate = measurement_2['heart_rate']
            if self.hr_moving_avg is not None:
                heart_rate = (((m1_heart_rate + m2_heart_rate) / 2) + self.hr_moving_avg) / 2
            else:
                heart_rate = (m1_heart_rate + m2_heart_rate) / 2

            if self.hr_moving_avg is not None and abs(heart_rate - self.hr_moving_avg) > self.hr_std_2:
                if heart_rate < self.hr_moving_avg:
                    heart_rate = self.hr_moving_avg - self.hr_std_2
                else:
                    heart_rate = self.hr_moving_avg + self.hr_std_2

            self.heart_rates.append(heart_rate)

            self.combined_measurements.append({
                'side': self.side,
                'timestamp': epoch,
                'heart_rate': heart_rate,
                'hrv': self.hrv,
                'breathing_rate': self.breathing_rate,
            })

        elif measurement_1 is not None:
            m1_heart_rate = measurement_1['heart_rate']

            # If the HR differs by more than the allowable movement
            if self.hr_moving_avg is not None and abs(m1_heart_rate - self.hr_moving_avg) > self.hr_std_2:
                if m1_heart_rate < self.hr_moving_avg:
                    m1_heart_rate = self.hr_moving_avg - self.hr_std_2
                else:
                    m1_heart_rate = self.hr_moving_avg + self.hr_std_2

            self.heart_rates.append(m1_heart_rate)

            measurement_1['heart_rate'] = m1_heart_rate
            self.combined_measurements.append(measurement_1)

        elif measurement_2 is not None:
            m2_heart_rate = measurement_2['heart_rate']

            if self.hr_moving_avg is not None:
                heart_rate = (m2_heart_rate + self.hr_moving_avg) / 2
            else:
                heart_rate = m2_heart_rate

            if self.hr_moving_avg is not None and abs(heart_rate - self.hr_moving_avg) > self.hr_std_2:
                if heart_rate < self.hr_moving_avg:
                    heart_rate = self.hr_moving_avg - self.hr_std_2
                else:
                    heart_rate = self.hr_moving_avg + self.hr_std_2

            self.heart_rates.append(heart_rate)

            measurement_2['heart_rate'] = heart_rate
            self.combined_measurements.append(measurement_2)
        self.next()

    def is_valid(self, measurement) -> bool:
        if np.isnan(measurement['bpm']):
            return False

        if measurement['bpm'] > 100:
            return False
        if self.lower_bound is not None and self.upper_bound is not None:
            if self.lower_bound < measurement['bpm'] < self.upper_bound:
                return True
            else:
                return False
        return True

    def next(self):
        self.iteration_count += 1

        # Insert moving average heart rate to DB
        if self.iteration_count % self.insertion_frequency == 0 and len(self.combined_measurements) > 0:
            heart_rate = np.mean(list(self.heart_rates)[self.rolling_average_size * -1:])
            # Convert last heart rate to average
            self.combined_measurements[-1]['heart_rate'] = heart_rate
            if not self.debug:
                insert_vitals(self.combined_measurements[-1])
            else:
                last_combined_measurement = list(self.combined_measurements)[-1]
                ts = datetime.utcfromtimestamp(last_combined_measurement['timestamp']).isoformat()
                debug_measurement = {
                    **self.combined_measurements[-1],
                    'last_combined_measurement': ts,
                    'current_ts': datetime.utcfromtimestamp(self.epoch).isoformat(),
                    'heart_rate': heart_rate,
                    'last_heart_rates': list(self.heart_rates)[-25:],
                    'hr_moving_avg': self.hr_moving_avg,
                    'lower_bound': self.lower_bound,
                    'upper_bound': self.upper_bound,
                    'hr_std_2': self.hr_std_2,
                    'length': len(self.heart_rates),
                }
                self.debug_measurements.append(debug_measurement)

        # Calculate boundaries for calculations
        if len(self.heart_rates) >= self.moving_avg_size:
            self.hr_moving_avg = np.mean(self.heart_rates)

            self.lower_bound = np.percentile(self.heart_rates, self.hr_percentile[0])
            self.upper_bound = np.percentile(self.heart_rates, self.hr_percentile[1])

            if self.upper_bound - self.lower_bound < 25:
                self.upper_bound = self.hr_moving_avg + 12.5
                self.lower_bound = self.hr_moving_avg - 12.5

            self.hr_std_2 = np.std(self.heart_rates) * 2
            if self.hr_std_2 < self.hr_std_range[0]:
                self.hr_std_2 = self.hr_std_range[0]
            elif self.hr_std_2 > self.hr_std_range[1]:
                self.hr_std_2 = self.hr_std_range[1]

    def calculate_breath_rate(self, signal1: np.ndarray, epoch: int):
        self._calculate_vitals(signal1, epoch, update_breathing=True)


    def calculate_hrv(self, signal1: np.ndarray, epoch: int):
        self._calculate_vitals(signal1, epoch, update_hrv=True)
