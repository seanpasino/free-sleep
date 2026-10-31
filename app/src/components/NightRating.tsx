/* eslint-disable react/no-multi-comp */
import moment from 'moment-timezone';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Feel, useRating, useSaveRating } from '@api/nights.ts';
import { COLORS } from '../theme.ts';

type Side = 'left' | 'right';

const CHOICES: { value: Feel; label: string; color: string }[] = [
  { value: -1, label: 'Cold', color: COLORS.cool },
  { value: 0, label: 'Right', color: COLORS.ok },
  { value: 1, label: 'Warm', color: COLORS.warm },
];

const Part = ({ label, value, onChange, disabled }: {
  label: string; value: Feel | null; onChange: (value: Feel | null) => void; disabled: boolean;
}) => (
  <Box sx={ { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 } }>
    <Typography sx={ { fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'nowrap' } }>{ label }</Typography>
    <ToggleButtonGroup
      size="small"
      exclusive
      value={ value }
      disabled={ disabled }
      // Tapping the chosen answer again clears it
      onChange={ (_e, next: Feel | null) => onChange(next) }
      aria-label={ label }
      sx={ { bgcolor: COLORS.raised } }
    >
      { CHOICES.map((c) => (
        <ToggleButton
          key={ c.value }
          value={ c.value }
          sx={ {
            px: 1.5, minWidth: 64, fontSize: 13,
            '&.Mui-selected, &.Mui-selected:hover': { color: COLORS.ground, bgcolor: c.color },
          } }
        >
          { c.label }
        </ToggleButton>
      )) }
    </ToggleButtonGroup>
  </Box>
);

// "How did it feel?" for one night: early and late, each too cold / just right / too warm.
// Saved with the night, so the Nights card can line it up with what the bed did.
export default function NightRating({ side, night, title = 'How did it feel?' }: { side: Side; night: string; title?: string }) {
  const { data: rating, isLoading } = useRating(side, night);
  const save = useSaveRating();
  const pending = save.isPending ? save.variables : undefined;
  const early = (pending?.early !== undefined ? pending.early : rating?.early ?? null) as Feel | null;
  const late = (pending?.late !== undefined ? pending.late : rating?.late ?? null) as Feel | null;

  return (
    <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1 } }>
      <Box sx={ { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }>
        <Typography sx={ { fontSize: 14, fontWeight: 600 } }>{ title }</Typography>
        <Typography sx={ { fontSize: 12, color: COLORS.textTertiary } }>
          { moment(night, 'YYYY-MM-DD').format('ddd MMM D') } night
          { save.isError ? ' · not saved' : '' }
        </Typography>
      </Box>
      <Part label="Early night" value={ early } disabled={ isLoading } onChange={ (v) => save.mutate({ side, night, early: v }) }/>
      <Part label="Late night" value={ late } disabled={ isLoading } onChange={ (v) => save.mutate({ side, night, late: v }) }/>
    </Box>
  );
}
