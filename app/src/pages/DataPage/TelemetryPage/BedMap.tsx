/* eslint-disable react/no-multi-comp */
import moment from 'moment-timezone';
import { Box, Tooltip, Typography } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Telemetry } from '@api/telemetry.ts';
import { formatTemp, temperatureColor } from './parts.tsx';
import { COLORS } from '../../../theme.ts';

type Side = 'left' | 'right';
type Zone = 'out' | 'cen' | 'in';

const ZONE_LABEL: Record<Zone, string> = { out: 'Outer', cen: 'Center', in: 'Inner' };
// Across the bed from the left edge to the right edge, as the cover's probes are ordered
const ZONES: Record<Side, Zone[]> = { left: ['out', 'cen', 'in'], right: ['in', 'cen', 'out'] };
// Capacitance rise over the empty-bed baseline that fills a zone's load bar (a body adds ~1,000-3,000)
const FULL_LOAD = 2000;
const VITALS_FRESH_MS = 10 * 60_000;

const ZoneTile = ({ zone, tempF, cap, baseline, celsius }: {
  zone: Zone; tempF: number | null; cap: number | null; baseline: number | null; celsius: boolean;
}) => {
  const rise = cap !== null && baseline !== null ? cap - baseline : null;
  const load = rise === null ? 0 : Math.max(0, Math.min(1, rise / FULL_LOAD));
  return (
    <Tooltip
      arrow
      title={ `${ZONE_LABEL[zone]} probe ${formatTemp(tempF, celsius)} · capacitance ${cap ?? '—'}`
        + (rise !== null ? ` (${rise >= 0 ? '+' : ''}${rise} over empty)` : '') }
    >
      <Box
        sx={ {
          flex: 1, minWidth: 0, height: 128, borderRadius: '12px', px: 0.5, py: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: temperatureColor(tempF, 0.2), border: `1px solid ${temperatureColor(tempF, 0.45)}`,
          transition: 'background-color 800ms ease, border-color 800ms ease',
        } }
      >
        <Typography sx={ { fontSize: 11, color: COLORS.textSecondary } }>{ ZONE_LABEL[zone] }</Typography>
        <Typography sx={ { fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' } }>
          { formatTemp(tempF, celsius) }
        </Typography>
        <Box sx={ { width: '70%', height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.08)', overflow: 'hidden' } } aria-hidden>
          <Box sx={ { width: `${load * 100}%`, height: '100%', bgcolor: COLORS.ok, transition: 'width 600ms ease' } }/>
        </Box>
      </Box>
    </Tooltip>
  );
};

const Half = ({ side, telemetry, celsius }: { side: Side; telemetry: Telemetry; celsius: boolean }) => {
  const cover = telemetry.cover.sides[side];
  const control = telemetry.controls.sides[side];
  const vitals = cover.vitals && Date.now() - Date.parse(cover.vitals.at) < VITALS_FRESH_MS ? cover.vitals : null;
  const present = cover.presence.present;
  return (
    <Box sx={ { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } }>
      { /* Pillow at the head of the bed */ }
      <Box sx={ { height: 10, mx: 2, borderRadius: '6px', bgcolor: COLORS.raised, border: `1px solid ${COLORS.border}` } }/>
      <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', px: 0.25 } }>
        <Typography sx={ { fontSize: 13, fontWeight: 600 } }>{ side === 'left' ? 'Left' : 'Right' }</Typography>
        <Typography sx={ { fontSize: 12, color: COLORS.textTertiary, fontVariantNumeric: 'tabular-nums' } }>
          Bed { formatTemp(cover.bedF, celsius) }
        </Typography>
      </Box>
      <Box sx={ { display: 'flex', gap: 0.5 } }>
        { ZONES[side].map((zone) => (
          <ZoneTile
            key={ zone }
            zone={ zone }
            tempF={ cover.probes[zone] }
            cap={ cover.capacitance[zone] }
            baseline={ cover.capacitance.baseline?.[zone] ?? null }
            celsius={ celsius }
          />
        )) }
      </Box>
      <Typography sx={ { fontSize: 11, color: COLORS.textTertiary, px: 0.25, fontVariantNumeric: 'tabular-nums' } }>
        &ldquo;Side&rdquo; probe { formatTemp(cover.probes.side, celsius) }
      </Typography>
      <Box sx={ { display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minHeight: 24 } }>
        <Box
          sx={ {
            px: 1, py: 0.25, borderRadius: 999, fontSize: 12, fontWeight: 500,
            bgcolor: control.awayMode ? COLORS.raised : present ? 'rgba(61, 217, 179, 0.14)' : COLORS.raised,
            color: control.awayMode ? COLORS.textTertiary : present ? COLORS.ok : COLORS.textSecondary,
          } }
        >
          { control.awayMode ? 'Away' : present ? 'In bed' : 'Empty' }
        </Box>
        { !control.awayMode && cover.presence.since && (
          <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>
            since { moment(cover.presence.since).format('h:mm A') }
          </Typography>
        ) }
      </Box>
      { vitals && (
        <Box
          sx={ {
            display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: COLORS.textSecondary, fontVariantNumeric: 'tabular-nums',
          } }
        >
          <FavoriteIcon sx={ { fontSize: 13, color: '#FF7A7A' } }/>
          { vitals.heartRate ?? '—' } bpm · { vitals.breathingRate ?? '—' }/min · HRV { vitals.hrv ?? '—' }
        </Box>
      ) }
    </Box>
  );
};

// Top-down view of the cover: each side's three surface probes as tiles, colored by temperature,
// with a bar for how much load the capacitance sensor under that zone sees
export default function BedMap({ telemetry, celsius }: { telemetry: Telemetry; celsius: boolean }) {
  return (
    <Box>
      <Box
        sx={ {
          display: 'flex', gap: 1.5, p: 1.5, borderRadius: '16px',
          border: `1px solid ${COLORS.border}`, bgcolor: 'rgba(255,255,255,0.015)',
        } }
      >
        <Half side="left" telemetry={ telemetry } celsius={ celsius }/>
        <Box sx={ { width: '1px', bgcolor: COLORS.border, my: 1 } }/>
        <Half side="right" telemetry={ telemetry } celsius={ celsius }/>
      </Box>
      <Box sx={ { display: 'flex', alignItems: 'center', gap: 1, mt: 1.25 } }>
        <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ formatTemp(68, celsius, 0) }</Typography>
        <Box
          sx={ {
            flex: 1, height: 4, borderRadius: 2,
            background: `linear-gradient(90deg, ${temperatureColor(68)}, ${temperatureColor(76)}, ${temperatureColor(84)})`,
          } }
        />
        <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ formatTemp(84, celsius, 0) }</Typography>
        <Box sx={ { width: 16, height: 4, borderRadius: 2, bgcolor: COLORS.ok, ml: 1 } }/>
        <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>Load</Typography>
      </Box>
    </Box>
  );
}
