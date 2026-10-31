import _ from 'lodash';
import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { DeepPartial } from 'ts-essentials';

import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import PowerSettingsNew from '@mui/icons-material/PowerSettingsNew';
import ThermostatOutlined from '@mui/icons-material/ThermostatOutlined';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import moment from 'moment-timezone';

import AlarmSettings from './AlarmSection/AlarmSettings.tsx';
import ApplyToOtherNights from './ApplyToOtherNights.tsx';
import DayChips from './DayChips.tsx';
import EnabledSwitch from './EnabledSwitch.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import NightTimeline, { START_POINT } from './NightTimeline.tsx';
import PageContainer from '../PageContainer.tsx';
import PowerTimes from './PowerTimes.tsx';
import ScheduleRow from './ScheduleRow.tsx';
import SideControl from '../../components/SideControl.tsx';
import StartTemperature from './StartTemperature.tsx';
import TimelinePointEditor from './TimelinePointEditor.tsx';
import UnsavedBar from './UnsavedBar.tsx';
import { COLORS, pageBottomClearance } from '../../theme.ts';
import { DayOfWeek, Schedules } from '@api/schedulesSchema.ts';
import { formatClock } from '@lib/night.ts';
import { formatTemperature } from '@lib/temperatureConversions.ts';
import { postSchedules } from '@api/schedules';
import { reportError, useAppStore } from '@state/appStore.tsx';
import { useSchedules } from '@api/schedules';
import { useScheduleStore } from './scheduleStore.tsx';
import { useSettings } from '@api/settings';
import { useBedControlEnabled } from '@api/telemetry.ts';
import { LOWERCASE_DAYS } from './days.ts';


const getAdjustedDayOfWeek = (): DayOfWeek => {
  // Get the current moment in the specified timezone
  const now = moment();
  // Extract the hour of the day in 24-hour format
  const currentHour = now.hour();

  // Determine if it's before noon (12:00 PM)
  if (currentHour < 12) {
    return now.subtract(1, 'day').format('dddd').toLocaleLowerCase() as DayOfWeek;
  } else {
    return now.format('dddd').toLocaleLowerCase() as DayOfWeek;
  }
};


export default function SchedulePage() {
  const { setIsUpdating, side, notify, setHasUnsavedChanges } = useAppStore();
  const { data: schedules, refetch } = useSchedules();
  const {
    selectedSchedule,
    setOriginalSchedules,
    selectedDays,
    selectedDay,
    reloadScheduleData,
    selectDay,
    changesPresent,
    accordionExpanded,
    setAccordionExpanded,
    updateSelectedSchedule,
    updateSelectedTemperatures,
  } = useScheduleStore();
  const [selectedPoint, setSelectedPoint] = useState<string | undefined>();
  const hasPickedInitialDay = useRef(false);
  const { data: settings } = useSettings();
  const { data: bedControl = false } = useBedControlEnabled();
  const displayCelsius = settings?.temperatureFormat === 'celsius';
  useEffect(() => {
    const day = getAdjustedDayOfWeek();
    selectDay(LOWERCASE_DAYS.indexOf(day));
    // Leaving the page (already confirmed by the navbar) drops any unsaved edits
    return () => setHasUnsavedChanges(false);
  }, []);

  useEffect(() => {
    if (!schedules) return;
    const store = useScheduleStore.getState();
    if (store.changesPresent) {
      // A background refetch (e.g. returning to the tab) must not wipe the user's
      // edits: just update the baseline they're compared against
      useScheduleStore.setState({ originalSchedules: schedules });
      store.checkForChanges();
      return;
    }
    setOriginalSchedules(schedules);
    // Only jump to "tonight" on first load, not on every refetch
    if (!hasPickedInitialDay.current) {
      hasPickedInitialDay.current = true;
      selectDay(LOWERCASE_DAYS.indexOf(getAdjustedDayOfWeek()));
    }
    reloadScheduleData();
  }, [schedules]);

  // Warn before a reload / tab close would throw away unsaved edits
  useEffect(() => {
    if (!changesPresent) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [changesPresent]);

  useEffect(() => {
    reloadScheduleData();
  }, [side]);

  // A point belongs to one night's schedule
  useEffect(() => {
    setSelectedPoint(undefined);
  }, [side, selectedDay]);

  const handleSave = async () => {
    setIsUpdating(true);

    const daysList: DayOfWeek[] = _.uniq(_.keys(_.pickBy(selectedDays, value => value))) as DayOfWeek[];
    daysList.push(selectedDay);
    const payload: DeepPartial<Schedules> = { [side]: {}, };
    daysList.forEach(day => {
      // @ts-expect-error
      payload[side][day] = selectedSchedule;
    });

    try {
      await postSchedules(payload);
      const { data: savedSchedules } = await refetch();
      if (savedSchedules) {
        setOriginalSchedules(savedSchedules);
        reloadScheduleData();
      }
      notify('Schedule saved', 'success');
    } catch (error) {
      // Edits are kept so the user can retry
      reportError('save the schedule', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const capitalize = (day: string) => day.charAt(0).toUpperCase() + day.slice(1);
  const power = selectedSchedule?.power;
  const alarm = selectedSchedule?.alarm;
  const scheduleOn = !!power?.enabled;
  const nextDay = LOWERCASE_DAYS[(LOWERCASE_DAYS.indexOf(selectedDay) + 1) % 7];
  const wraps = power ? power.off <= power.on : false;
  const isCurrentNight = selectedDay === getAdjustedDayOfWeek();
  const nightLabel = isCurrentNight ? (moment().hour() < 12 ? ' (last night)' : ' (tonight)') : '';
  const offDayLabel = wraps ? `${capitalize(nextDay).slice(0, 3)} ` : '';
  const nightCaption = power
    ? `${capitalize(selectedDay)} night${nightLabel} · ${formatClock(power.on)} → ${offDayLabel}${formatClock(power.off)}`
    : '';
  const durationLabel = (seconds: number) => (seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`);
  const otherNights = Object.values(selectedDays).filter(Boolean).length;
  const alarmSummary = alarm?.enabled
    ? `${formatClock(alarm.time)} · ${capitalize(alarm.vibrationPattern)} · ${durationLabel(alarm.duration)}`
    : 'Off';

  const handleTimelineChange = (point: string, temperatureF: number) => {
    if (!selectedSchedule) return;
    if (point === START_POINT) {
      updateSelectedSchedule({ power: { onTemperature: temperatureF } });
    } else {
      updateSelectedTemperatures({ ...selectedSchedule.temperatures, [point]: temperatureF });
    }
  };

  return (
    <PageContainer
      sx={ {
        width: '100%',
        maxWidth: { xs: '100%', sm: '560px' },
        mx: 'auto',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: 2,
        // Extra room for the unsaved-changes bar that sits above the tab bar
        pb: pageBottomClearance(changesPresent ? 84 : 0),
      } }
    >
      <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, mt: 1 } }>
        <Typography component="h1" sx={ { fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' } }>
          Schedule
        </Typography>
        <SideControl/>
      </Box>

      <DayChips/>
      <Box sx={ { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: -0.5 } }>
        <Typography sx={ { fontSize: 13, color: COLORS.textSecondary } }>{ nightCaption }</Typography>
        <EnabledSwitch/>
      </Box>

      <ErrorBoundary componentName='Night timeline'>
        <Box
          sx={ {
            backgroundColor: COLORS.surface,
            borderRadius: '18px',
            p: 1.5,
            pb: 1.25,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          } }>
          <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', px: 0.5 } }>
            <Typography sx={ { fontSize: 14, fontWeight: 500 } }>
              { bedControl ? 'Bed temperature through the night' : 'Temperature through the night' }
            </Typography>
            { scheduleOn && <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>Drag a point</Typography> }
          </Box>
          { bedControl && (
            <Typography sx={ { fontSize: 12, color: COLORS.textTertiary, px: 0.5, mt: -0.5 } }>
              What the bed surface holds. The Pod runs the water a few degrees cooler to get there.
            </Typography>
          ) }
          { selectedSchedule && scheduleOn ? (
            <>
              <NightTimeline
                schedule={ selectedSchedule }
                displayCelsius={ displayCelsius }
                selected={ selectedPoint }
                onSelect={ setSelectedPoint }
                onChangeTemperature={ handleTimelineChange }
              />
              <TimelinePointEditor displayCelsius={ displayCelsius } selected={ selectedPoint } onSelect={ setSelectedPoint }/>
            </>
          ) : (
            <Typography sx={ { fontSize: 14, color: COLORS.textTertiary, py: 4, textAlign: 'center' } }>
              The schedule is off for { capitalize(selectedDay) } night.
            </Typography>
          ) }
        </Box>
      </ErrorBoundary>

      <Box sx={ { backgroundColor: COLORS.surface, borderRadius: '18px', overflow: 'hidden' } }>
        <ScheduleRow
          icon={ <PowerSettingsNew/> }
          title="Power"
          summary={ power ? `${formatClock(power.on)} – ${formatClock(power.off)}` : '' }
          expanded={ accordionExpanded === 'power' }
          onToggle={ () => setAccordionExpanded('power') }
          disabled={ !scheduleOn }
          divider
        >
          <PowerTimes/>
        </ScheduleRow>
        <ScheduleRow
          icon={ <ThermostatOutlined/> }
          title="Starts at"
          summary={ power ? formatTemperature(power.onTemperature, displayCelsius) : '' }
          expanded={ accordionExpanded === 'startTemp' }
          onToggle={ () => setAccordionExpanded('startTemp') }
          disabled={ !scheduleOn }
          divider
        >
          <StartTemperature displayCelsius={ displayCelsius }/>
        </ScheduleRow>
        <ScheduleRow
          icon={ <NotificationsNoneOutlined/> }
          title="Alarm"
          summary={ alarmSummary }
          expanded={ accordionExpanded === 'alarm' }
          onToggle={ () => setAccordionExpanded('alarm') }
          disabled={ !scheduleOn }
          divider
        >
          <AlarmSettings/>
        </ScheduleRow>
        <ScheduleRow
          icon={ <EventRepeatOutlined/> }
          title={ `Copy to other nights` }
          summary={ otherNights ? `${otherNights} selected` : '' }
          expanded={ accordionExpanded === 'applyToDays' }
          onToggle={ () => setAccordionExpanded('applyToDays') }
          disabled={ !scheduleOn }
        >
          <ApplyToOtherNights/>
        </ScheduleRow>
      </Box>

      <UnsavedBar onSave={ handleSave }/>
    </PageContainer>
  );
}
