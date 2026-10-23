// LowDB, stores room-temperature compensation settings in /persistent/free-sleep-data/lowdb/comfortDB.json
// Edit the file directly; it is re-read before every scheduled adjustment.
import _ from 'lodash';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import config from '../config.js';

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
};

const defaultData: Comfort = {
  ambientCompensation: {
    enabled: true,
    baseRoomF: 76,
    gain: 1,
    maxOffsetF: 10,
    wakeStepMinF: 85,
  },
};

const file = new JSONFile<Comfort>(`${config.lowDbFolder}comfortDB.json`);
const comfortDB = new Low<Comfort>(file, defaultData);
await comfortDB.read();
comfortDB.data = _.merge({}, defaultData, comfortDB.data);
await comfortDB.write();

export default comfortDB;
