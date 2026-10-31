// A row of the bed temperature history (prisma bed_temperatures), as GET /api/metrics/bedTemperatures returns it
type SideColumns<S extends string> = {
  [K in `${S}_${'bed' | 'out' | 'cen' | 'in' | 'side' | 'water' | 'water_target' | 'setpoint' | 'power'}`]: number | null;
} & {
  [K in `${S}_${'on' | 'present'}`]: boolean | null;
};

export type BedTemperatureRecord = {
  timestamp: number; // Epoch ms, start of the minute
  room: number | null;
  humidity: number | null;
} & SideColumns<'left'> & SideColumns<'right'>;

// One night of the history, as GET /api/metrics/nights returns it (newest first)
export type NightSummary = {
  night: string; // YYYY-MM-DD the night started (local)
  from: number; // Epoch ms the side turned on
  to: number; // Epoch ms the side turned off (or the latest row, if still on)
  inBedHours: number;
  onTargetPercent: number | null; // In-bed minutes within ±1°F of setpoint
  bedAvgF: number | null; // While in bed
  setpointAvgF: number | null;
  offsetAvgF: number | null; // Water minus setpoint while in bed: what bed control needed
  roomAvgF: number | null;
  rating: { early: number | null; late: number | null } | null;
};

// A control event for the charts' markers (from the comfort log)
export type BedEvent = {
  time: number; // Epoch ms
  kind: 'button' | 'manual' | 'schedule' | 'power_on' | 'power_off';
  fromF?: number;
  toF?: number;
};

export type SleepRating = { side: 'left' | 'right'; night: string; early: number | null; late: number | null };
