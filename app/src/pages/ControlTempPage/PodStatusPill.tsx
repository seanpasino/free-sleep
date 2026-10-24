import { Box } from '@mui/material';
import { COLORS } from '../../theme.ts';

export default function PodStatusPill({ online }: { online: boolean }) {
  return (
    <Box
      role="status"
      sx={ {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        px: 1.25,
        py: '5px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: online ? '#10251F' : '#2B2212',
        color: online ? '#8FE3CF' : '#FFE6BF',
      } }
    >
      <Box sx={ { width: 6, height: 6, borderRadius: '50%', backgroundColor: online ? COLORS.ok : '#FFC46B' } }/>
      { online ? 'Pod online' : 'Pod offline' }
    </Box>
  );
}
