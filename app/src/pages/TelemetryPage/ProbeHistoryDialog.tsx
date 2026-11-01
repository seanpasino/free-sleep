import { useMemo } from 'react';
import moment from 'moment-timezone';
import { Box, Dialog, IconButton, Skeleton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useLiveBedTemperatures } from '@api/bedTemperatures.ts';
import BedTemperaturePlot from '@components/BedTemperaturePlot.tsx';
import { liveWindow, seriesColor, Side } from '@lib/bedTemperature.ts';
import { COLORS } from '../../theme.ts';

export type Zone = 'out' | 'cen' | 'in';
// One probe, or all three of a side when zone is null
export type ProbeSelection = { side: Side; zone: Zone | null };

export const ZONE_LABEL: Record<Zone, string> = { out: 'Outer', cen: 'Center', in: 'Inner' };
// Across the bed as the sleeper sees it lying on their back: the Pod names its sides from the foot of
// the bed, so right outer is on the sleeper's left and left outer on their right
export const ZONES: Record<Side, Zone[]> = { right: ['out', 'cen', 'in'], left: ['in', 'cen', 'out'] };

const sessionLabel = (on: ReturnType<typeof liveWindow>['on']) => {
  if (!on) return 'Last 12 hours';
  if (on.to === null) return `On since ${moment(on.from).format('h:mm A')}`;
  return `${moment(on.from).format('h:mm A')} – ${moment(on.to).format('h:mm A')}`;
};

// A side's cover probes over its current session (its last one while it's off), with the in-bed strip
export default function ProbeHistoryDialog({ selection, onClose }: { selection: ProbeSelection; onClose: () => void }) {
  const { side, zone } = selection;
  const { data, isLoading } = useLiveBedTemperatures();
  const { rows, on } = useMemo(() => liveWindow(data ?? [], side), [data, side]);
  const zones = zone ? [zone] : ZONES[side];
  const sideName = side === 'left' ? 'Left' : 'Right';

  return (
    <Dialog
      open
      onClose={ onClose }
      fullWidth
      maxWidth="sm"
      aria-label={ `${sideName} ${zone ? ZONE_LABEL[zone] : 'side'} history` }
      slotProps={ { paper: { sx: { m: 1.5, width: 'calc(100% - 24px)', p: 2, pb: 1.5 } } } }
    >
      <Box sx={ { display: 'flex', alignItems: 'center', gap: 1 } }>
        <Box sx={ { flex: 1, minWidth: 0 } }>
          <Typography sx={ { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }>
            { sideName } · { zone ? ZONE_LABEL[zone] : 'All probes' }
          </Typography>
          <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>{ sessionLabel(on) }</Typography>
        </Box>
        <IconButton onClick={ onClose } aria-label="Close" size="small" sx={ { mr: -0.5 } }>
          <CloseIcon fontSize="small"/>
        </IconButton>
      </Box>

      { isLoading && <Skeleton variant="rounded" height={ 240 } sx={ { mt: 1.5, borderRadius: '12px', bgcolor: COLORS.surface } }/> }
      { !isLoading && rows.length < 2 && (
        <Typography sx={ { py: 6, fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' } }>
          No history for this session yet.
        </Typography>
      ) }
      { !isLoading && rows.length >= 2 && (
        <Box sx={ { mt: 1, mx: -0.5 } }>
          <BedTemperaturePlot rows={ rows } side={ side } visible={ zones } height={ 240 } compact/>
          <Box sx={ { display: 'flex', gap: 1.5, mt: 1, ml: '34px' } }>
            { zones.map((z) => (
              <Box key={ z } sx={ { display: 'flex', alignItems: 'center', gap: 0.5 } }>
                <Box component="span" sx={ { width: 7, height: 7, borderRadius: '50%', bgcolor: seriesColor(z) } }/>
                <Typography sx={ { fontSize: 11, color: COLORS.textTertiary } }>{ ZONE_LABEL[z] }</Typography>
              </Box>
            )) }
          </Box>
        </Box>
      ) }
    </Dialog>
  );
}
