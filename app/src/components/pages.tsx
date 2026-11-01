import React from 'react';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import SensorsOutlined from '@mui/icons-material/SensorsOutlined';
import ThermostatOutlined from '@mui/icons-material/ThermostatOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';

type Page = {
  title: string;
  route: string;
  icon: React.ReactElement;
};

export const PAGES: Page[] = [
  { title: 'Temperature', route: '/temperature', icon: <ThermostatOutlined/> },
  { title: 'Schedule', route: '/schedules', icon: <CalendarMonthOutlined/> },
  { title: 'Telemetry', route: '/telemetry', icon: <SensorsOutlined/> },
  { title: 'Data', route: '/data', icon: <BarChartOutlined/> },
  { title: 'Settings', route: '/settings', icon: <TuneOutlined/> },
];
