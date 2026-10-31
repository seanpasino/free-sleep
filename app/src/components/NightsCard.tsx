/* eslint-disable react/no-multi-comp */
import moment from 'moment-timezone';
import { Box, Card, Tooltip, Typography } from '@mui/material';
import { NightSummary, useNights } from '@api/nights.ts';
import { COLORS } from '../theme.ts';

type Side = 'left' | 'right';

const FEEL = { [-1]: { label: 'Cold', color: COLORS.cool }, 0: { label: 'Right', color: COLORS.ok }, 1: { label: 'Warm', color: COLORS.warm } };

const fmt = (v: number | null, digits = 1) => (v === null ? '—' : `${v.toFixed(digits)}°`);

const FeelDot = ({ part, value }: { part: string; value: number | null }) => {
  const feel = value === null ? null : FEEL[value as -1 | 0 | 1];
  return (
    <Tooltip title={ `${part}: ${feel ? feel.label.toLowerCase() : 'not rated'}` } arrow>
      <Box
        sx={ {
          width: 10, height: 10, borderRadius: '50%',
          bgcolor: feel ? feel.color : 'transparent', border: feel ? 'none' : `1px solid ${COLORS.border}`,
        } }
      />
    </Tooltip>
  );
};

const NightRow = ({ n }: { n: NightSummary }) => {
  const pct = n.onTargetPercent;
  return (
    <Box sx={ { py: 1.25, borderTop: `1px solid ${COLORS.divider}`, '&:first-of-type': { borderTop: 'none', pt: 0.5 } } }>
      <Box sx={ { display: 'flex', alignItems: 'center', gap: 1.5 } }>
        <Typography sx={ { width: 64, flexShrink: 0, fontSize: 13, fontWeight: 600 } }>
          { moment(n.night, 'YYYY-MM-DD').format('ddd D') }
        </Typography>
        <Tooltip title="In-bed time within ±1°F of the setpoint" arrow>
          <Box sx={ { flex: 1, height: 6, borderRadius: 3, bgcolor: COLORS.raised, overflow: 'hidden' } }>
            <Box sx={ { width: `${pct ?? 0}%`, height: '100%', borderRadius: 3, bgcolor: COLORS.ok, opacity: 0.85 } }/>
          </Box>
        </Tooltip>
        <Typography sx={ { width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }>
          { pct === null ? '—' : `${pct}%` }
        </Typography>
        <Box sx={ { display: 'flex', gap: 0.5, width: 26, justifyContent: 'flex-end' } }>
          <FeelDot part="Early night" value={ n.rating?.early ?? null }/>
          <FeelDot part="Late night" value={ n.rating?.late ?? null }/>
        </Box>
      </Box>
      <Typography sx={ { mt: 0.5, ml: '76px', fontSize: 12, color: COLORS.textTertiary, fontVariantNumeric: 'tabular-nums' } }>
        Bed { fmt(n.bedAvgF) } (set { fmt(n.setpointAvgF) }) · room { fmt(n.roomAvgF) }
        { n.offsetAvgF !== null && ` · water ${n.offsetAvgF > 0 ? '+' : ''}${n.offsetAvgF.toFixed(1)}°` } · { n.inBedHours.toFixed(1) } h
      </Typography>
    </Box>
  );
};

// Night by night: how well the bed held its setpoint, with the room, the water offset it took and how
// it felt, so schedule changes can be judged against each other
export default function NightsCard({ side }: { side: Side }) {
  const { data: nights } = useNights(side);
  if (!nights) return null;

  return (
    <Card sx={ { mt: 2, p: 2 } }>
      <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 } }>
        <Typography variant="h6" sx={ { lineHeight: 1.2 } }>Nights</Typography>
        <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>On target · feel early / late</Typography>
      </Box>
      { nights.length === 0 ? (
        <Typography sx={ { py: 2, fontSize: 13, color: COLORS.textTertiary } }>
          Nights appear here once the bed has run for 2 hours. History starts Oct 29, 2026 and is kept 30 days.
        </Typography>
      ) : nights.map((n) => <NightRow key={ n.from } n={ n }/>) }
    </Card>
  );
}
