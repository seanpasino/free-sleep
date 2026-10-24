import moment from 'moment-timezone';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import NotificationsOffOutlined from '@mui/icons-material/NotificationsOffOutlined';
import Pill from '@components/Pill.tsx';

import { useAppStore } from '@state/appStore.tsx';
import { useSchedules } from '@api/schedules.ts';
import { useSettings } from '@api/settings.ts';
import { useEffect, useState } from 'react';
import { DayOfWeek } from '../../../../server/src/db/schedulesSchema.ts';
import AlarmOverride from './AlarmOverride.tsx';
import AlarmDisabledDialog from './AlarmDisabledDialog.tsx';


export default function AlarmNotification() {
  const { side } = useAppStore();
  const { data: schedules } = useSchedules();
  const { data: settings } = useSettings();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [disabledOpen, setDisabledOpen] = useState(false);
  const [alarmTimeLocalOverride, setAlarmTimeLocalOverride] = useState<string>('');
  const [alarmDisabled, setAlarmDisabled] = useState(false);
  const currentDay = moment.tz(settings?.timeZone || 'UTC').subtract(12, 'hours').format('dddd').toLowerCase() as DayOfWeek;
  const alarm = schedules?.[side][currentDay].alarm;
  const power = schedules?.[side][currentDay].power;


  const [scheduledAlarmTimeAmPm, setScheduledAlarmTimeAmPm] = useState('');
  const [scheduledAlarmTimeHhMm, setScheduledAlarmTimeHhMm] = useState('');

  useEffect(() => {
    if (!settings || !schedules) return;
    const alarm = schedules[side][currentDay].alarm;

    const hhMm = moment(alarm.time, 'HH:mm').format('hh:mm');
    const amPm = moment(alarm.time, 'HH:mm').format('h:mm A');
    setScheduledAlarmTimeHhMm(hhMm);
    setScheduledAlarmTimeAmPm(amPm);
    setAlarmDisabled(false);
    const alarmScheduleOverrides = settings[side].scheduleOverrides.alarm;
    if (alarmScheduleOverrides.expiresAt) {
      const expiresAt = moment(alarmScheduleOverrides.expiresAt);

      if (expiresAt.isAfter(moment())) {
        if (alarmScheduleOverrides.disabled) {
          setAlarmDisabled(true);
          setScheduledAlarmTimeHhMm(hhMm);
          setScheduledAlarmTimeAmPm(amPm);
        } else {
          setAlarmDisabled(false);
          setScheduledAlarmTimeAmPm(moment(alarmScheduleOverrides.timeOverride, 'HH:mm').format('h:mm A'));
          setScheduledAlarmTimeHhMm(moment(alarmScheduleOverrides.timeOverride, 'HH:mm').format('hh:mm'));
        }
      }
    }
  }, [settings, schedules, side]);

  if (!power?.enabled || !alarm?.enabled || !settings) return null;

  return (
    <>
      <AlarmOverride
        open={ overrideOpen }
        setOverrideOpen={ setOverrideOpen }
        alarmTimeLocalOverride={ alarmTimeLocalOverride }
        scheduledAlarmTimeHhMm={ scheduledAlarmTimeHhMm }
        setAlarmTimeLocalOverride={ setAlarmTimeLocalOverride }
      />
      <AlarmDisabledDialog
        open={ disabledOpen }
        setOpen={ setDisabledOpen }
        scheduledAlarmTimeHhMm={ scheduledAlarmTimeHhMm }
        alarmDisabled={ alarmDisabled }
      />
      {
        alarmDisabled ? (
          <Pill
            icon={ <NotificationsOffOutlined/> }
            onClick={ () => setDisabledOpen(true) }
            ariaLabel="Alarm skipped tonight. Turn it back on"
          >
            Alarm skipped · Undo
          </Pill>
        ) : (
          <>
            <Pill
              icon={ <NotificationsNoneOutlined/> }
              tone="warm"
              onClick={ () => setOverrideOpen(!overrideOpen) }
              ariaLabel={ `Alarm at ${scheduledAlarmTimeAmPm}. Change tonight's time` }
            >
              Alarm { scheduledAlarmTimeAmPm }
            </Pill>
            <Pill onClick={ () => setDisabledOpen(true) } ariaLabel="Skip tonight's alarm">
              Skip tonight
            </Pill>
          </>
        )
      }
    </>
  );
}
