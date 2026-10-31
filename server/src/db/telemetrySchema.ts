// GET /api/telemetry: one snapshot of every sensor and I/O value worth showing (Data → Telemetry).
// Temperatures are °F; null where the Pod hasn't reported a value recently.
type Side = 'left' | 'right';

export type TelemetryCoverSide = {
  bedF: number | null; // What the app shows: 5-min median of the bed-control probe
  probes: { out: number | null; cen: number | null; in: number | null; side: number | null };
  // Raw counts, and the empty-bed baseline the live presence detector keeps
  capacitance: {
    out: number | null; cen: number | null; in: number | null; status: string | null;
    baseline: { out: number; cen: number; in: number } | null;
  };
  presence: { present: boolean; since: string | null }; // since: last change, null if none since a restart
  vitals: { heartRate: number | null; breathingRate: number | null; hrv: number | null; at: string } | null;
};

export type TelemetryHubSide = {
  waterF: number | null;
  targetF: number | null;
  output: number | null; // -1 (full cooling) .. 1 (full heating)
  enabled: boolean | null;
  pumpRpm: number | null;
  pumpMode: string | null;
  waterDetected: boolean | null;
};

export type TelemetryControlSide = {
  isOn: boolean;
  secondsRemaining: number;
  awayMode: boolean;
  setpointF: number | null; // Bed setpoint while bed control is on
  offsetF: number | null; // Learned water offset
  waterLevel: number; // Firmware heat level, -100..100
  isAlarmVibrating: boolean;
  lastButton: { button: 'top' | 'middle' | 'bottom'; at: string; heldMs?: number } | null;
  sensorGain: number | null;
};

export type Telemetry = {
  at: string;
  cover: {
    at: string | null; // Time of the bedTemp record
    roomF: number | null;
    humidity: number | null;
    boardF: number | null;
    piezo: { sampleRateHz: number | null; gain: number | null } | null;
    sides: Record<Side, TelemetryCoverSide>;
  };
  hub: {
    at: string | null;
    airF: number | null;
    heatsinkF: number | null;
    fanTopRpm: number | null;
    fanBottomRpm: number | null;
    waterTankOk: boolean | null;
    priming: boolean;
    needsPrime: boolean | null;
    sides: Record<Side, TelemetryHubSide>;
  };
  controls: {
    bedControl: boolean;
    ledBrightness: number | null;
    sides: Record<Side, TelemetryControlSide>;
  };
  accessories: { blanket: Record<Side, boolean | null> };
  system: {
    uptimeSeconds: number;
    load: [number, number, number];
    memoryTotalMB: number;
    memoryAvailableMB: number | null;
    storageTotalGB: number | null;
    storageFreeGB: number | null;
    cpuC: number | null;
    wifiStrength: number;
    clockSynced: boolean;
    freeSleepVersion: string;
    coverVersion: string;
    hubVersion: string;
    sensorLabel: string | null;
  };
  // The newest raw record of each type (piezo without its samples) and the firmware's status reply
  raw: Record<string, unknown>;
};
