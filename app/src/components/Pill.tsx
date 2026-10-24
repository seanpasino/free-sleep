import React from 'react';
import { ButtonBase, Box } from '@mui/material';
import { COLORS } from '../theme.ts';

type PillProps = {
  icon?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  tone?: 'default' | 'warm';
};

const pillSx = (tone: PillProps['tone']) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: 36,
  px: 1.5,
  borderRadius: 999,
  backgroundColor: COLORS.surface,
  color: COLORS.textSecondary,
  fontSize: 13,
  fontFamily: 'inherit',
  '& .MuiSvgIcon-root': { fontSize: 16, color: tone === 'warm' ? COLORS.warm : COLORS.textSecondary },
});

// Small rounded status chip; tappable when it has an onClick
export default function Pill({ icon, onClick, ariaLabel, tone = 'default', children }: React.PropsWithChildren<PillProps>) {
  if (!onClick) {
    return <Box sx={ pillSx(tone) }>{ icon }{ children }</Box>;
  }
  return (
    <ButtonBase
      onClick={ onClick }
      aria-label={ ariaLabel }
      sx={ { ...pillSx(tone), '&:hover': { backgroundColor: COLORS.raised } } }
    >
      { icon }{ children }
    </ButtonBase>
  );
}
