// LowDB, stores room-temperature compensation settings in /persistent/free-sleep-data/lowdb/comfortDB.json
// Edit the file directly; it is re-read before every scheduled adjustment.
import _ from 'lodash';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import config from '../config.js';
const defaultData = {
    ambientCompensation: {
        enabled: true,
        baseRoomF: 76,
        gain: 1,
        maxOffsetF: 10,
        wakeStepMinF: 85,
    },
};
const file = new JSONFile(`${config.lowDbFolder}comfortDB.json`);
const comfortDB = new Low(file, defaultData);
await comfortDB.read();
comfortDB.data = _.merge({}, defaultData, comfortDB.data);
await comfortDB.write();
export default comfortDB;
//# sourceMappingURL=comfort.js.map