import _ from 'lodash';
import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { DeepPartial } from 'ts-essentials';
import moment from 'moment-timezone';

import AlarmAccordion from './AlarmSection/AlarmAccordion.tsx';
import ApplyToOtherDaysAccordion from './ApplyToOtherDaysAccordion.tsx';
import DayTabs from './DayTabs.tsx';
import EnabledSwitch from './EnabledSwitch.tsx';
import PageContainer from '../PageContainer.tsx';
import SaveButton from './SaveButton.tsx';
import SideControl from '../../components/SideControl.tsx';
import PowerScheduleSection from './PowerScheduleSection.tsx';
import TemperatureAdjustmentsAccordion from './TemperatureAdjustmentsAccordion.tsx';
import { DayOfWeek, Schedules } from '@api/schedulesSchema.ts';
import { postSchedules } from '@api/schedules';
import { reportError, useAppStore } from '@state/appStore.tsx';
import { useSchedules } from '@api/schedules';
import { useScheduleStore } from './scheduleStore.tsx';
import { useSettings } from '@api/settings';
import { LOWERCASE_DAYS } from './days.ts';
import TemperatureScheduleChart from './ScheduleChart.tsx';
import ErrorBoundary from '@components/ErrorBoundary.tsx';


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
  } = useScheduleStore();
  const hasPickedInitialDay = useRef(false);
  const { data: settings } = useSettings();
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

  const isShowingLastNight = moment().hour() < 12 && selectedDay === getAdjustedDayOfWeek();

  return (
    <PageContainer
      sx={ {
        width: '100%',
        maxWidth: { xs: '100%', sm: '800px' },
        mx: 'auto',
        mb: 15,
      } }
    >
      <SideControl/>

      <DayTabs/>
      { isShowingLastNight && (
        <Typography variant="caption" color="text.secondary" sx={ { mt: -1 } }>
          Before noon this opens on last night's schedule ({ _.capitalize(selectedDay) }).
        </Typography>
      ) }
      <ErrorBoundary componentName='Scheduling chart'>
        <TemperatureScheduleChart />
      </ErrorBoundary>

      <PowerScheduleSection displayCelsius={ displayCelsius }/>
      <Box sx={ { mt: 2, display: 'flex', justifyContent: 'space-between', width: '100%', mb: 2 } }>
        <EnabledSwitch/>
        <SaveButton onSave={ handleSave }/>
      </Box>
      <TemperatureAdjustmentsAccordion displayCelsius={ displayCelsius }/>
      <AlarmAccordion/>
      <ApplyToOtherDaysAccordion/>

    </PageContainer>
  );
}
