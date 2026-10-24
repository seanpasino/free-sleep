import React from 'react';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
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
  { title: 'Data', route: '/data', icon: <BarChartOutlined/> },
  { title: 'Status', route: '/status', icon: <MonitorHeartOutlined/> },
  { title: 'Settings', route: '/settings', icon: <TuneOutlined/> },
];
