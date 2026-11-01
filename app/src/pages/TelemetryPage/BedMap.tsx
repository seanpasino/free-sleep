/* eslint-disable react/no-multi-comp */
import moment from 'moment-timezone';
import { useState } from 'react';
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Telemetry } from '@api/telemetry.ts';
import { formatTemp, SETPOINT_SCALE_F, setpointColor, temperatureColor } from './parts.tsx';
import { COLORS } from '../../theme.ts';
import ProbeHistoryDialog, { ProbeSelection, Zone, ZONE_LABEL, ZONES } from './ProbeHistoryDialog.tsx';

type Side = 'left' | 'right';

// Capacitance rise over the empty-bed baseline that fills a zone's load bar (a body adds ~1,000-3,000)
const FULL_LOAD = 2000;
const VITALS_FRESH_MS = 10 * 60_000;

// The bed setpoint a side's tiles are colored against; null (off or away) uses the fixed scale
const activeSetpoint = (side: Side, telemetry: Telemetry) => {
  const control = telemetry.controls.sides[side];
  return control.isOn && !control.awayMode ? control.setpointF : null;
};

const ZoneTile = ({ zone, tempF, cap, baseline, setpointF, celsius, onOpen }: {
  zone: Zone; tempF: number | null; cap: number | null; baseline: number | null; setpointF: number | null; celsius: boolean; onOpen: () => void;
}) => {
  const tint = (alpha: number) => (setpointF === null ? temperatureColor(tempF, alpha) : setpointColor(tempF, setpointF, alpha));
  const rise = cap !== null && baseline !== null ? cap - baseline : null;
  const load = rise === null ? 0 : Math.max(0, Math.min(1, rise / FULL_LOAD));
  return (
    <Tooltip
      arrow
      title={ `${ZONE_LABEL[zone]} probe ${formatTemp(tempF, celsius)} · capacitance ${cap ?? '—'}`
        + (rise !== null ? ` (${rise >= 0 ? '+' : ''}${rise} over empty)` : '') }
    >
      <ButtonBase
        onClick={ onOpen }
        aria-label={ `${ZONE_LABEL[zone]} probe history` }
        sx={ {
          flex: 1, minWidth: 0, height: 128, borderRadius: '12px', px: 0.5, py: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: tint(0.45), border: `1px solid ${tint(0.75)}`,
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
      </ButtonBase>
    </Tooltip>
  );
};

const Half = ({ side, telemetry, celsius, onOpen }: {
  side: Side; telemetry: Telemetry; celsius: boolean; onOpen: (selection: ProbeSelection) => void;
}) => {
  const cover = telemetry.cover.sides[side];
  const control = telemetry.controls.sides[side];
  const vitals = cover.vitals && Date.now() - Date.parse(cover.vitals.at) < VITALS_FRESH_MS ? cover.vitals : null;
  const present = cover.presence.present;
  const occupied = present && !control.awayMode;
  const setpointF = activeSetpoint(side, telemetry);
  return (
    <Box sx={ { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } }>
      { /* Pillow at the head of the bed, lit while the side is occupied */ }
      <Box
        sx={ {
          height: 10, mx: 2, borderRadius: '6px',
          bgcolor: occupied ? 'rgba(61, 217, 179, 0.45)' : COLORS.raised,
          border: `1px solid ${occupied ? COLORS.ok : COLORS.border}`,
          boxShadow: occupied ? '0 0 10px rgba(61, 217, 179, 0.45)' : 'none',
          transition: 'background-color 400ms ease, border-color 400ms ease, box-shadow 400ms ease',
        } }
      />
      <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', px: 0.25 } }>
        <ButtonBase
          onClick={ () => onOpen({ side, zone: null }) }
          aria-label={ `${side === 'left' ? 'Left' : 'Right'} side probe history` }
          sx={ { fontSize: 13, fontWeight: 600, borderRadius: '6px', py: 0.25, pr: 0.25, mt: -0.25 } }
        >
          { side === 'left' ? 'Left' : 'Right' }
          <ChevronRightIcon sx={ { fontSize: 15, color: COLORS.textTertiary } }/>
        </ButtonBase>
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
            setpointF={ setpointF }
            celsius={ celsius }
            onOpen={ () => onOpen({ side, zone }) }
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

const ScaleLegend = ({ low, high, colors, caption }: { low: string; high: string; colors: string[]; caption: string }) => (
  <Box sx={ { display: 'flex', alignItems: 'center', gap: 1 } }>
    <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ low }</Typography>
    <Box sx={ { flex: 1, height: 4, borderRadius: 2, background: `linear-gradient(90deg, ${colors.join(', ')})` } }/>
    <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ high }</Typography>
    <Typography sx={ { fontSize: 11, color: COLORS.textTertiary, width: 112, textAlign: 'right' } }>{ caption }</Typography>
  </Box>
);

// The cover from the sleeper's point of view (see ZONES), pillows at the top: each side's three surface probes as tiles,
// colored by distance from that side's setpoint (a fixed scale when it's off or away), with a bar for how much load the
// capacitance sensor under that zone sees
export default function BedMap({ telemetry, celsius }: { telemetry: Telemetry; celsius: boolean }) {
  const [selection, setSelection] = useState<ProbeSelection | null>(null);
  const setpoints = (['left', 'right'] as Side[]).map((side) => activeSetpoint(side, telemetry));
  const delta = celsius ? Math.round(SETPOINT_SCALE_F * 5 / 9) : SETPOINT_SCALE_F;
  return (
    <Box>
      <Box
        sx={ {
          display: 'flex', gap: 1.5, p: 1.5, borderRadius: '16px',
          border: `1px solid ${COLORS.border}`, bgcolor: 'rgba(255,255,255,0.015)',
        } }
      >
        <Half side="right" telemetry={ telemetry } celsius={ celsius } onOpen={ setSelection }/>
        <Box sx={ { width: '1px', bgcolor: COLORS.border, my: 1 } }/>
        <Half side="left" telemetry={ telemetry } celsius={ celsius } onOpen={ setSelection }/>
      </Box>
      <Box sx={ { display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1.25 } }>
        { setpoints.some((s) => s !== null) && (
          <ScaleLegend
            low={ `−${delta}°` }
            high={ `+${delta}°` }
            colors={ [temperatureColor(68), temperatureColor(76), temperatureColor(84)] }
            caption="from target"
          />
        ) }
        { setpoints.some((s) => s === null) && (
          <ScaleLegend
            low={ formatTemp(68, celsius, 0) }
            high={ formatTemp(84, celsius, 0) }
            colors={ [temperatureColor(68), temperatureColor(76), temperatureColor(84)] }
            caption="off or away side"
          />
        ) }
        <Box sx={ { display: 'flex', alignItems: 'center', gap: 1 } }>
          <Box sx={ { width: 16, height: 4, borderRadius: 2, bgcolor: COLORS.ok } }/>
          <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>Load</Typography>
        </Box>
      </Box>
      { selection && <ProbeHistoryDialog selection={ selection } onClose={ () => setSelection(null) }/> }
    </Box>
  );
}
