import { useState } from 'react';
import moment from 'moment-timezone';
import { Box, Card, Switch, Typography } from '@mui/material';
import { postSettings, useSettings } from '@api/settings.ts';
import { useSchedules } from '@api/schedules.ts';
import { getCurrentNight } from '@lib/night.ts';
import { reportError, useAppStore } from '@state/appStore.tsx';
import { COLORS } from '../../theme.ts';

type OverrideKey = 'alarm' | 'temperatureSchedules';

const isFuture = (expiresAt?: string) => !!expiresAt && moment(expiresAt).isAfter(moment());

// The night's override runs until noon: today's while the side is on in the morning (the night in
// progress), otherwise tomorrow's (the coming night)
const overrideExpiry = (timeZone: string, isOn: boolean) => {
  const now = moment.tz(timeZone);
  const noon = now.clone().hour(12).minute(0).second(0).millisecond(0);
  return (isOn && now.isBefore(noon) ? noon : noon.add(1, 'day')).format();
};

// The same two switches as Home Assistant's "Disable Alarm Tonight" / "Disable Temp Schedule Tonight"
export default function TonightOverrides({ isOn }: { isOn: boolean }) {
  const side = useAppStore(state => state.side);
  const { data: settings, refetch } = useSettings();
  const { data: schedules } = useSchedules();
  const [saving, setSaving] = useState<OverrideKey | null>(null);
  if (!settings) return null;

  const overrides = settings[side].scheduleOverrides;
  const night = getCurrentNight(settings.timeZone);
  const alarm = schedules?.[side]?.[night]?.alarm;
  // An alarm moved to another time also has an expiry, but it still rings
  const alarmDisabled = isFuture(overrides.alarm.expiresAt) && !overrides.alarm.timeOverride;
  const scheduleDisabled = isFuture(overrides.temperatureSchedules.expiresAt);

  const toggle = (key: OverrideKey, disable: boolean) => {
    const expiresAt = disable ? overrideExpiry(settings.timeZone, isOn) : '';
    const change = key === 'alarm'
      ? { alarm: { disabled: disable, timeOverride: '', expiresAt } }
      : { temperatureSchedules: { disabled: disable, expiresAt } };
    setSaving(key);
    postSettings({ [side]: { scheduleOverrides: change } })
      .then(() => refetch())
      .catch(error => reportError('change tonight\'s schedule', error))
      .finally(() => setSaving(null));
  };

  const until = (expiresAt: string) => `Off until ${moment.tz(expiresAt, settings.timeZone).calendar(null, {
    sameDay: '[noon today]',
    nextDay: '[noon tomorrow]',
    sameElse: 'ddd h:mm A',
  })}`;

  const rows: { key: OverrideKey; label: string; hint: string; checked: boolean; unavailable?: boolean }[] = [];
  rows.push({
    key: 'alarm',
    label: 'Disable alarm tonight',
    hint: alarmDisabled ? until(overrides.alarm.expiresAt) : alarm?.enabled ? 'The alarm rings as scheduled' : 'No alarm tonight',
    checked: alarmDisabled,
    unavailable: !alarm?.enabled && !alarmDisabled,
  });
  rows.push({
    key: 'temperatureSchedules',
    label: 'Disable temp schedule tonight',
    hint: scheduleDisabled ? until(overrides.temperatureSchedules.expiresAt) : 'Temperature steps run as scheduled',
    checked: scheduleDisabled,
  });

  return (
    <Card sx={ { px: 2, py: 0.5 } }>
      { rows.map(({ key, label, hint, checked, unavailable }, i) => (
        <Box
          key={ key }
          sx={ {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 1,
            borderTop: i ? `1px solid ${COLORS.divider}` : 'none',
          } }
        >
          <Box sx={ { minWidth: 0 } }>
            <Typography sx={ { fontSize: 14, fontWeight: 500 } }>{ label }</Typography>
            <Typography sx={ { fontSize: 12, color: COLORS.textSecondary } }>{ hint }</Typography>
          </Box>
          <Switch
            checked={ checked }
            disabled={ saving !== null || unavailable }
            onChange={ (event) => toggle(key, event.target.checked) }
            slotProps={ { input: { 'aria-label': label } } }
          />
        </Box>
      )) }
    </Card>
  );
}
