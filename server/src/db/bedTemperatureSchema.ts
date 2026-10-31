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
