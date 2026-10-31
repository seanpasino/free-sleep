/* eslint-disable react/no-multi-comp */
import { ReactNode } from 'react';
import { Box, Card, Typography } from '@mui/material';
import { COLORS } from '../../../theme.ts';

// Temperatures arrive in °F; shown in the user's unit
export const formatTemp = (f: number | null | undefined, celsius: boolean, digits = 1) => {
  if (f === null || f === undefined) return '—';
  return celsius ? `${((f - 32) * 5 / 9).toFixed(digits)}°C` : `${f.toFixed(digits)}°`;
};

export const formatNumber = (v: number | null | undefined, suffix = '') => (
  v === null || v === undefined ? '—' : `${Math.round(v).toLocaleString()}${suffix}`
);

export const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
};

// Cool blue at or below 68°F, neutral grey at 76°F, warm orange at or above 84°F
const STOPS: [number, [number, number, number]][] = [
  [68, [90, 169, 255]],
  [76, [139, 146, 163]],
  [84, [255, 138, 76]],
];
export const temperatureColor = (f: number | null, alpha = 1) => {
  if (f === null) return `rgba(139, 146, 163, ${alpha * 0.4})`;
  const t = Math.min(STOPS[STOPS.length - 1][0], Math.max(STOPS[0][0], f));
  const i = t <= STOPS[1][0] ? 0 : 1;
  const [f0, c0] = STOPS[i];
  const [f1, c1] = STOPS[i + 1];
  const k = (t - f0) / (f1 - f0);
  const [r, g, b] = c0.map((c, j) => Math.round(c + (c1[j] - c) * k));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const Section = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <Card sx={ { p: 2 } }>
    <Box sx={ { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.5 } }>
      <Typography sx={ { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }>{ title }</Typography>
      { aside && <Box sx={ { fontSize: 12, color: COLORS.textTertiary, textAlign: 'right' } }>{ aside }</Box> }
    </Box>
    { children }
  </Card>
);

// A big number with a small label above it
export const Figure = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <Box sx={ { minWidth: 0 } }>
    <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>{ label }</Typography>
    <Typography sx={ { fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 } }>
      { value }
    </Typography>
    { note && <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ note }</Typography> }
  </Box>
);

export const FigureGrid = ({ columns = 3, children }: { columns?: number; children: ReactNode }) => (
  <Box sx={ { display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 1.5 } }>{ children }</Box>
);

// Label on the left, value on the right; for the long lists
export const Row = ({ label, children, tone }: { label: string; children: ReactNode; tone?: 'ok' | 'warn' | 'muted' }) => (
  <Box
    sx={ {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 0.75,
      borderTop: `1px solid ${COLORS.divider}`, '&:first-of-type': { borderTop: 'none' },
    } }
  >
    <Typography sx={ { fontSize: 13, color: COLORS.textSecondary } }>{ label }</Typography>
    <Typography
      sx={ {
        fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere',
        color: tone === 'ok' ? COLORS.ok : tone === 'warn' ? '#FFC46B' : tone === 'muted' ? COLORS.textTertiary : COLORS.text,
      } }
    >
      { children }
    </Typography>
  </Box>
);

// Hub output, -1 (full cooling) .. 1 (full heating), as a bar growing from the middle
export const OutputMeter = ({ output }: { output: number | null }) => {
  const value = output ?? 0;
  const pct = Math.min(100, Math.abs(value) * 100);
  const cooling = value < 0;
  const label = output === null ? '—' : pct < 1 ? 'Idle' : `${cooling ? 'Cooling' : 'Heating'} ${pct.toFixed(0)}%`;
  return (
    <Box>
      <Box sx={ { position: 'relative', height: 6, borderRadius: 3, bgcolor: COLORS.raised, overflow: 'hidden' } }>
        <Box sx={ { position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', bgcolor: COLORS.border } }/>
        <Box
          sx={ {
            position: 'absolute', top: 0, bottom: 0, borderRadius: 3,
            bgcolor: cooling ? COLORS.cool : COLORS.warm,
            ...(cooling ? { right: '50%' } : { left: '50%' }),
            width: `${pct / 2}%`,
            transition: 'width 600ms ease',
          } }
        />
      </Box>
      <Typography sx={ { mt: 0.5, fontSize: 12, color: COLORS.textSecondary, fontVariantNumeric: 'tabular-nums' } }>{ label }</Typography>
    </Box>
  );
};

export const LiveDot = ({ stale = false }: { stale?: boolean }) => (
  <Box
    component="span"
    sx={ {
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%', mr: 0.75, verticalAlign: 'middle',
      bgcolor: stale ? '#FFC46B' : COLORS.ok,
      '@media (prefers-reduced-motion: no-preference)': stale ? {} : { animation: 'telemetryPulse 2.4s ease-in-out infinite' },
      '@keyframes telemetryPulse': {
        '0%, 100%': { boxShadow: `0 0 0 0 ${COLORS.ok}66` },
        '50%': { boxShadow: `0 0 0 5px ${COLORS.ok}00` },
      },
    } }
  />
);
