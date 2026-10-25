"""
Breathing rate and an HR variability index from the piezo (ballistocardiogram) signal.

Breathing rate: breathing modulates the amplitude of the heartbeat signal, so the rate is read
from the envelope of the cardiac band rather than from a direct low-frequency band (which is
dominated by drift and settled near 12 breaths/min whatever the sleeper did).

HRV index: the dominant beat interval (IBI) of each 10 s sub-window, found by autocorrelation,
then the RMS of successive differences between sub-windows. This is NOT clinical RMSSD (which
needs beat-to-beat intervals); it measures how much the heart rate wanders from one 10 s window
to the next, and runs lower than RMSSD. Beat-level peaks on a BCG depend too much on posture to
be reliable here, and heartpy's SDNN on this signal was mostly artifact.

Both functions return None when the signal does not support an estimate; a missing value is
better than a wrong one.
"""
from typing import Optional, List
import numpy as np
from scipy.signal import butter, sosfiltfilt, hilbert, find_peaks

SAMPLE_RATE = 500

# Breathing
CARDIAC_BAND_HZ = (0.8, 10.0)
ENVELOPE_RATE_HZ = 10           # Envelope is block-averaged down to this rate
RESPIRATORY_BAND_HZ = (0.08, 0.5)  # 30 breaths/min at most; above that the heartbeat itself leaks in
MIN_BREATH_INTERVAL_S = 2.0     # 30 breaths/min
BREATH_RATE_RANGE = (6, 30)

# HRV index
HRV_BAND_HZ = (0.8, 8.5)
SUB_WINDOW_S = 10
SUB_WINDOW_STEP_S = 5
IBI_RANGE_MS = (400, 1500)      # 40-150 bpm
MIN_ACF_PEAK = 0.1              # Below this the autocorrelation is noise
HARMONIC_TOLERANCE = 0.18
TRACKER_SIZE = 5
HAMPEL_RADIUS = 3
HAMPEL_K = 3.0
MAX_REJECTED_RUN = 3            # No successive difference across a longer run of rejected windows
MIN_IBIS = 10
MIN_DIFFS = 5
HRV_INDEX_RANGE_MS = (5, 100)


def _bandpass(signal: np.ndarray, band, fs: float, order: int) -> np.ndarray:
    sos = butter(order, band, btype='bandpass', fs=fs, output='sos')
    return sosfiltfilt(sos, signal)


def breathing_rate(signal: np.ndarray, fs: int = SAMPLE_RATE) -> Optional[float]:
    """Breaths per minute from >= ~30 s of piezo signal, or None."""
    x = signal.astype(np.float64)
    x -= x.mean()
    if not np.any(x):
        return None
    cardiac = _bandpass(x, CARDIAC_BAND_HZ, fs, order=4)
    envelope = np.abs(hilbert(cardiac))

    block = fs // ENVELOPE_RATE_HZ
    n = len(envelope) // block * block
    envelope = envelope[:n].reshape(-1, block).mean(axis=1)
    resp = _bandpass(envelope - envelope.mean(), RESPIRATORY_BAND_HZ, ENVELOPE_RATE_HZ, order=4)

    peaks, _ = find_peaks(
        resp,
        distance=int(MIN_BREATH_INTERVAL_S * ENVELOPE_RATE_HZ),
        prominence=0.25 * np.std(resp),
    )
    if len(peaks) < 4:
        return None
    intervals = np.diff(peaks) / ENVELOPE_RATE_HZ
    median = np.median(intervals)
    intervals = intervals[(intervals > 0.5 * median) & (intervals < 1.5 * median)]
    if len(intervals) < 3:
        return None
    rate = 60.0 / intervals.mean()
    if not BREATH_RATE_RANGE[0] <= rate <= BREATH_RATE_RANGE[1]:
        return None
    return float(rate)


def _dominant_ibi_ms(segment: np.ndarray, fs: int) -> Optional[float]:
    """Beat interval of one sub-window from its autocorrelation, or None."""
    seg = segment - segment.mean()
    n = len(seg)
    spectrum = np.fft.rfft(seg, n=2 * n)
    acf = np.fft.irfft(spectrum * np.conj(spectrum))[:n]
    if acf[0] <= 0:
        return None
    acf /= acf[0]

    lo = int(IBI_RANGE_MS[0] / 1000 * fs)
    hi = int(IBI_RANGE_MS[1] / 1000 * fs)
    peaks, _ = find_peaks(acf[lo:hi + 1])
    if len(peaks) == 0:
        return None
    peaks = peaks + lo

    # A BCG beat has several waves, so the autocorrelation also peaks at fractions of the true
    # period. The true period is the candidate whose double is also a strong peak.
    def score(lag):
        double = acf[2 * lag] if 2 * lag < n else 0.0
        return acf[lag] + 0.5 * max(double, 0.0)

    best = max(peaks, key=score)
    if acf[best] < MIN_ACF_PEAK:
        return None

    # Parabolic interpolation around the peak: one lag is 2 ms at 500 Hz, too coarse for this
    y0, y1, y2 = acf[best - 1], acf[best], acf[best + 1]
    denom = y0 - 2 * y1 + y2
    offset = 0.5 * (y0 - y2) / denom if denom != 0 else 0.0
    return float((best + offset) / fs * 1000)


def _harmonic_gate(ibis: List[Optional[float]]) -> List[Optional[float]]:
    """Corrects 2x / 0.5x / 3x / 1/3x errors against a running reference; drops the rest."""
    valid = [v for v in ibis if v is not None and IBI_RANGE_MS[0] <= v <= IBI_RANGE_MS[1]]
    if not valid:
        return [None] * len(ibis)
    recent = [float(np.median(valid))]
    out: List[Optional[float]] = []
    for ibi in ibis:
        if ibi is None:
            out.append(None)
            continue
        window = sorted(recent[-TRACKER_SIZE:])
        trimmed = window[1:-1] if len(window) >= 4 else window
        ref = float(np.mean(trimmed))
        accepted = None
        for factor in (1.0, 2.0, 0.5, 3.0, 1 / 3):
            candidate = ibi / factor
            if abs(candidate - ref) <= HARMONIC_TOLERANCE * ref:
                accepted = candidate
                break
        if accepted is not None and IBI_RANGE_MS[0] <= accepted <= IBI_RANGE_MS[1]:
            recent.append(accepted)
            out.append(accepted)
        else:
            out.append(None)
    return out


def _hampel(values: List[Optional[float]]) -> List[Optional[float]]:
    present = [i for i, v in enumerate(values) if v is not None]
    seq = np.array([values[i] for i in present])
    out = list(values)
    for j, i in enumerate(present):
        window = seq[max(0, j - HAMPEL_RADIUS): j + HAMPEL_RADIUS + 1]
        median = np.median(window)
        mad = 1.4826 * np.median(np.abs(window - median))
        if mad > 0 and abs(seq[j] - median) > HAMPEL_K * mad:
            out[i] = None
    return out


def hrv_index(signal: np.ndarray, fs: int = SAMPLE_RATE) -> Optional[float]:
    """HR variability index in ms from ~300 s of piezo signal, or None (see module docstring)."""
    hrv, _ = hrv_index_with_ibi(signal, fs)
    return hrv


def hrv_index_with_ibi(signal: np.ndarray, fs: int = SAMPLE_RATE):
    """(HRV index, median accepted IBI in ms); the IBI is a cross-check against the heart rate."""
    x = signal.astype(np.float64)
    x -= x.mean()
    if not np.any(x):
        return None, None
    x = _bandpass(x, HRV_BAND_HZ, fs, order=4)

    win = SUB_WINDOW_S * fs
    step = SUB_WINDOW_STEP_S * fs
    raw = [_dominant_ibi_ms(x[s:s + win], fs) for s in range(0, len(x) - win + 1, step)]
    ibis = _hampel(_harmonic_gate(raw))

    accepted = [v for v in ibis if v is not None]
    if len(accepted) < MIN_IBIS:
        return None, None

    diffs = []
    last_ix = None
    for i, v in enumerate(ibis):
        if v is None:
            continue
        if last_ix is not None and i - last_ix - 1 <= MAX_REJECTED_RUN:
            diffs.append(v - ibis[last_ix])
        last_ix = i
    if len(diffs) < MIN_DIFFS:
        return None, float(np.median(accepted))

    index = float(np.sqrt(np.mean(np.square(diffs))))
    if not HRV_INDEX_RANGE_MS[0] <= index <= HRV_INDEX_RANGE_MS[1]:
        return None, float(np.median(accepted))
    return index, float(np.median(accepted))
