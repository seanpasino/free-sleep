import React, { useRef } from 'react';
import { Box } from '@mui/material';
import { COLORS } from '../../theme.ts';

// 240° arc with the gap at the bottom, in a 300×300 viewBox
const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 126;
const START_DEG = 150;
const SWEEP_DEG = 240;
const ARC_LENGTH = RADIUS * SWEEP_DEG * Math.PI / 180;
const TRACK_WIDTH = 14;
// Only presses near the ring start a drag, so tapping the label can't change the temperature
const GRAB_TOLERANCE = 34;

const pointAt = (fraction: number) => {
  const rad = (START_DEG + SWEEP_DEG * fraction) * Math.PI / 180;
  return { x: CENTER + RADIUS * Math.cos(rad), y: CENTER + RADIUS * Math.sin(rad) };
};
const ARC_START = pointAt(0);
const ARC_END = pointAt(1);
const ARC_PATH = `M${ARC_START.x} ${ARC_START.y} A${RADIUS} ${RADIUS} 0 1 1 ${ARC_END.x} ${ARC_END.y}`;

type TemperatureDialProps = {
  value: number;
  current: number;
  min: number;
  max: number;
  // Off / away: the ring is shown empty and can't be dragged
  disabled: boolean;
  color: string;
  ariaValueText: string;
  onChange: (value: number) => void;
  onChangeEnd: () => void;
  onStep: (delta: number) => void;
  // Overlay: labels, and the +/- buttons along the bottom gap
  children?: React.ReactNode;
};

export default function TemperatureDial({
  value,
  current,
  min,
  max,
  disabled,
  color,
  ariaValueText,
  onChange,
  onChangeEnd,
  onStep,
  children,
}: TemperatureDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const fractionOf = (temperature: number) => Math.min(1, Math.max(0, (temperature - min) / (max - min)));

  const valueFromPointer = (event: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * SIZE - CENTER;
    const y = (event.clientY - rect.top) / rect.height * SIZE - CENTER;
    const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const along = (deg - START_DEG + 360) % 360;
    // In the bottom gap, snap to whichever end is nearer
    const fraction = along <= SWEEP_DEG ? along / SWEEP_DEG : along < SWEEP_DEG + (360 - SWEEP_DEG) / 2 ? 1 : 0;
    return { value: Math.round(min + fraction * (max - min)), distance: Math.hypot(x, y) };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const hit = valueFromPointer(event);
    if (!hit || Math.abs(hit.distance - RADIUS) > GRAB_TOLERANCE) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit.value !== value) onChange(hit.value);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const hit = valueFromPointer(event);
    if (hit && hit.value !== value) onChange(hit.value);
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onChangeEnd();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      onStep(1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      onStep(-1);
    }
  };

  const valueFraction = fractionOf(value);
  const handle = pointAt(valueFraction);
  const marker = pointAt(fractionOf(current));

  return (
    <Box
      sx={ {
        position: 'relative',
        width: '100%',
        maxWidth: 320,
        aspectRatio: '1',
        alignSelf: 'center',
        '& > svg:focus-visible': { outline: `2px solid ${COLORS.cool}`, outlineOffset: 2, borderRadius: '50%' },
      } }
    >
      <svg
        ref={ svgRef }
        viewBox={ `0 0 ${SIZE} ${SIZE}` }
        role="slider"
        tabIndex={ disabled ? -1 : 0 }
        aria-label="Target temperature"
        aria-valuemin={ min }
        aria-valuemax={ max }
        aria-valuenow={ value }
        aria-valuetext={ ariaValueText }
        aria-disabled={ disabled }
        onPointerDown={ handlePointerDown }
        onPointerMove={ handlePointerMove }
        onPointerUp={ endDrag }
        onPointerCancel={ endDrag }
        onKeyDown={ handleKeyDown }
        style={ {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Dragging the ring must not scroll the page
          touchAction: disabled ? 'auto' : 'none',
          cursor: disabled ? 'default' : 'pointer',
        } }
      >
        <defs>
          <linearGradient id="dial-range" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ COLORS.cool }/>
            <stop offset="1" stopColor={ COLORS.warm }/>
          </linearGradient>
        </defs>
        <path
          d={ ARC_PATH }
          fill="none"
          stroke={ disabled ? COLORS.border : 'url(#dial-range)' }
          strokeOpacity={ disabled ? 1 : 0.22 }
          strokeWidth={ TRACK_WIDTH }
          strokeLinecap="round"
        />
        { !disabled && (
          <>
            <path
              d={ ARC_PATH }
              fill="none"
              stroke={ color }
              strokeWidth={ TRACK_WIDTH }
              strokeLinecap="round"
              strokeDasharray={ `${valueFraction * ARC_LENGTH} ${ARC_LENGTH + TRACK_WIDTH}` }
            />
            <circle cx={ marker.x } cy={ marker.y } r={ 5 } fill={ COLORS.ground } stroke={ COLORS.text } strokeWidth={ 2 }/>
            <circle cx={ handle.x } cy={ handle.y } r={ 13 } fill={ COLORS.text } stroke={ COLORS.ground } strokeWidth={ 3 }/>
          </>
        ) }
      </svg>
      { children }
    </Box>
  );
}
