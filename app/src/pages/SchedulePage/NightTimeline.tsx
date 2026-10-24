import React, { useRef } from 'react';
import { Box } from '@mui/material';

import { COLORS } from '../../theme.ts';
import { DailySchedule } from '@api/schedulesSchema.ts';
import { formatDegrees, MAX_TEMP_F, MIN_TEMP_F } from '@lib/temperatureConversions.ts';

// The power-on point (its temperature is power.onTemperature) vs a temperature step
export const START_POINT = 'start';

const WIDTH = 334;
const HEIGHT = 170;
const LEFT = 34;
const RIGHT = 318;
const TOP = 14;
const BOTTOM = 140;
const HIT_RADIUS = 18;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Minutes after power-on, wrapping past midnight
export const minutesIntoNight = (power: DailySchedule['power'], hhmm: string) =>
  (toMinutes(hhmm) - toMinutes(power.on) + 1440) % 1440;

export const nightLength = (power: DailySchedule['power']) => minutesIntoNight(power, power.off) || 1440;

const xAt = (minutes: number, total: number) => LEFT + minutes / total * (RIGHT - LEFT);
const yAt = (temperatureF: number) => BOTTOM - (temperatureF - MIN_TEMP_F) / (MAX_TEMP_F - MIN_TEMP_F) * (BOTTOM - TOP);
const temperatureAt = (y: number) => Math.round(MIN_TEMP_F + (BOTTOM - y) / (BOTTOM - TOP) * (MAX_TEMP_F - MIN_TEMP_F));

const formatHour = (minutesOfDay: number) => {
  const h = Math.floor(minutesOfDay / 60) % 24;
  const m = minutesOfDay % 60;
  const suffix = h < 12 ? 'a' : 'p';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
};

type NightTimelineProps = {
  schedule: DailySchedule;
  displayCelsius: boolean;
  selected?: string;
  onSelect: (point: string) => void;
  onChangeTemperature: (point: string, temperatureF: number) => void;
};

// Step chart of the night's temperatures; drag a point up or down to change it
export default function NightTimeline({ schedule, displayCelsius, selected, onSelect, onChangeTemperature }: NightTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const { power, temperatures, alarm } = schedule;
  const total = nightLength(power);

  const steps = Object.entries(temperatures)
    .map(([time, temperatureF]) => ({ id: time, minutes: minutesIntoNight(power, time), temperatureF }))
    .filter(({ minutes }) => minutes > 0 && minutes < total)
    .sort((a, b) => a.minutes - b.minutes);
  const points = [{ id: START_POINT, minutes: 0, temperatureF: power.onTemperature }, ...steps];

  let line = '';
  points.forEach(({ minutes, temperatureF }, index) => {
    const x = xAt(minutes, total);
    const y = yAt(temperatureF);
    line += index === 0 ? `M${x} ${y}` : `H${x}V${y}`;
  });
  line += `H${RIGHT}`;
  const area = `${line}V${BOTTOM}H${LEFT}Z`;

  // Hour labels: power-on, then each 3-hour mark that isn't crowded by it
  const onMinutes = toMinutes(power.on);
  const ticks = [{ x: LEFT, label: formatHour(onMinutes) }];
  for (let clock = 0; clock < 1440; clock += 180) {
    const m = (clock - onMinutes + 1440) % 1440;
    const x = xAt(m, total);
    // Keep clear of the power-on label and the right edge
    if (m < total && x - LEFT > 44 && RIGHT - x > 12) ticks.push({ x, label: formatHour(clock) });
  }
  ticks.sort((a, b) => a.x - b.x);

  const alarmMinutes = alarm.enabled ? minutesIntoNight(power, alarm.time) : -1;
  const showAlarm = alarmMinutes > 0 && alarmMinutes <= total;

  const yFromPointer = (event: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return Math.min(BOTTOM, Math.max(TOP, (event.clientY - rect.top) / rect.height * HEIGHT));
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const y = yFromPointer(event);
    if (y === undefined) return;
    const point = points.find(({ id }) => id === dragging.current);
    const temperatureF = temperatureAt(y);
    if (point && point.temperatureF !== temperatureF) onChangeTemperature(point.id, temperatureF);
  };

  const selectedPoint = points.find(({ id }) => id === selected);
  const pointsLabel = points
    .map(({ id, temperatureF }) => `${id === START_POINT ? power.on : id} ${formatDegrees(temperatureF, displayCelsius)}`)
    .join(', ');

  return (
    <Box sx={ { width: '100%' } }>
      <svg
        ref={ svgRef }
        viewBox={ `0 0 ${WIDTH} ${HEIGHT}` }
        role="img"
        aria-label={ `Temperature through the night: ${pointsLabel}, off at ${power.off}` }
        onPointerMove={ handlePointerMove }
        onPointerUp={ () => { dragging.current = null; } }
        onPointerCancel={ () => { dragging.current = null; } }
        style={ { width: '100%', height: 'auto', display: 'block', userSelect: 'none' } }
      >
        <g stroke={ COLORS.border } strokeWidth={ 1 }>
          { [60, 80, 100].map((t) => <path key={ t } d={ `M${LEFT} ${yAt(t)}H${RIGHT}` }/>) }
        </g>
        <g fill={ COLORS.textTertiary } fontSize={ 10 } fontFamily="inherit">
          { [60, 80, 100].map((t) => (
            <text key={ t } x={ 2 } y={ yAt(t) + 3 }>{ formatDegrees(t, displayCelsius) }</text>
          )) }
          { ticks.map(({ x, label }) => (
            <text key={ label } x={ x } y={ HEIGHT - 6 } textAnchor={ x === LEFT ? 'start' : 'middle' }>{ label }</text>
          )) }
        </g>
        { showAlarm && (
          <path d={ `M${xAt(alarmMinutes, total)} ${TOP}V${BOTTOM}` } stroke={ COLORS.warm } strokeWidth={ 1.5 } strokeDasharray="3 4"/>
        ) }
        <path d={ area } fill={ COLORS.cool } fillOpacity={ 0.12 }/>
        <path d={ line } fill="none" stroke={ COLORS.cool } strokeWidth={ 2.5 } strokeLinejoin="round"/>
        { points.map(({ id, minutes, temperatureF }) => {
          const x = xAt(minutes, total);
          const y = yAt(temperatureF);
          const isSelected = id === selected;
          return (
            <g
              key={ id }
              data-point={ id }
              onPointerDown={ (event) => {
                event.preventDefault();
                onSelect(id);
                dragging.current = id;
                svgRef.current?.setPointerCapture(event.pointerId);
              } }
              // Dragging a point must not scroll the page; the rest of the chart scrolls normally
              style={ { cursor: 'ns-resize', touchAction: 'none' } }
            >
              <circle cx={ x } cy={ y } r={ HIT_RADIUS } fill="transparent"/>
              { isSelected
                ? <circle cx={ x } cy={ y } r={ 9 } fill={ COLORS.text } stroke={ COLORS.cool } strokeWidth={ 3 }/>
                : <circle cx={ x } cy={ y } r={ 5 } fill={ COLORS.ground } stroke={ COLORS.text } strokeWidth={ 2 }/> }
            </g>
          );
        }) }
        { selectedPoint && (() => {
          const x = Math.min(RIGHT - 37, Math.max(LEFT + 37, xAt(selectedPoint.minutes, total)));
          const above = yAt(selectedPoint.temperatureF) > TOP + 36;
          const y = above ? yAt(selectedPoint.temperatureF) - 40 : yAt(selectedPoint.temperatureF) + 16;
          const time = selectedPoint.id === START_POINT ? power.on : selectedPoint.id;
          return (
            <g pointerEvents="none">
              <rect x={ x - 37 } y={ y } width={ 74 } height={ 24 } rx={ 8 } fill="#262C3D"/>
              <text x={ x } y={ y + 16 } textAnchor="middle" fill={ COLORS.text } fontSize={ 11 } fontWeight={ 500 } fontFamily="inherit">
                { formatHour(toMinutes(time)) } · { formatDegrees(selectedPoint.temperatureF, displayCelsius) }
              </text>
            </g>
          );
        })() }
      </svg>
    </Box>
  );
}
