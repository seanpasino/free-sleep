// LowDB, stores room-temperature compensation settings in /persistent/free-sleep-data/lowdb/comfortDB.json
// Edit the file directly; it is re-read before every scheduled adjustment.
import _ from 'lodash';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import config from '../config.js';

export type SurfaceProbe = 'cen' | 'avg' | 'max' | 'min';

export type Comfort = {
  ambientCompensation: {
    enabled: boolean;
    // Bedroom temperature the schedules were tuned in (summer overnight average)
    baseRoomF: number;
    // °F of bed warming per °F the room is below baseRoomF
    gain: number;
    maxOffsetF: number;
    // Steps this warm are the wake-up spike: applied as scheduled, and re-checks stop until the next night
    wakeStepMinF: number;
  };
  // Closed-loop surface-temperature control. When enabled it supersedes ambientCompensation's
  // re-checks: instead of feed-forward from room temp, it trims the water target until the bed's
  // measured surface temperature holds at the setpoint, removing the room/body-driven offset.
  // enabled:false reproduces the previous behavior exactly.
  surfaceControl: {
    enabled: boolean;
    // Which of the three surface probes to control on. 'cen' (center/torso zone) is recommended;
    // 'avg' is dragged low by the cold outer edge, 'max'/'min' chase body heat / the cold edge.
    probe: SurfaceProbe;
    // Desired surface = setpoint + this. A single number applies to both sides; use
    // { left, right } for per-side calibration. The two surface probes are NOT identical on this
    // Pod: with an empty bed the right reads ~1.8°F above its water (and the left tracks water),
    // so driving the right's raw reading to the setpoint runs that side cool — add a positive
    // right calibration if the side you sleep on ends up too cold.
    calibrationOffsetF: number | { left: number; right: number };
    // No correction while |surface - desired| is under this, so the bed does not flap at a rounding edge
    deadbandF: number;
    // Max water-target move per 15 min re-check (matches the ~15-20 min water settle time)
    stepF: number;
    // Clamp on the total water offset the loop may build above/below the setpoint (anti-windup)
    maxTrimF: number;
  };
};

const defaultData: Comfort = {
  ambientCompensation: {
    enabled: true,
    baseRoomF: 76,
    gain: 1,
    maxOffsetF: 10,
    wakeStepMinF: 85,
  },
  surfaceControl: {
    enabled: false,
    probe: 'cen',
    calibrationOffsetF: 0,
    deadbandF: 0.75,
    stepF: 1,
    maxTrimF: 8,
  },
};

const file = new JSONFile<Comfort>(`${config.lowDbFolder}comfortDB.json`);
const comfortDB = new Low<Comfort>(file, defaultData);
await comfortDB.read();
comfortDB.data = _.merge({}, defaultData, comfortDB.data);
await comfortDB.write();

export default comfortDB;
