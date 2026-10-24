import React from 'react';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { COLORS } from '../../theme.ts';

type ScheduleRowProps = {
  icon: React.ReactNode;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  divider?: boolean;
};

// A settings row that expands in place to show its editor
export default function ScheduleRow({
  icon,
  title,
  summary,
  expanded,
  onToggle,
  disabled,
  divider,
  children,
}: React.PropsWithChildren<ScheduleRowProps>) {
  const id = `row-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <Box sx={ { borderBottom: divider ? `1px solid ${COLORS.divider}` : 'none' } }>
      <ButtonBase
        onClick={ onToggle }
        disabled={ disabled }
        aria-expanded={ expanded }
        aria-controls={ id }
        sx={ {
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.75,
          textAlign: 'left',
          fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
          '& > .MuiSvgIcon-root:first-of-type': { fontSize: 18, color: COLORS.textSecondary },
        } }
      >
        { icon }
        <Typography sx={ { flexGrow: 1, fontSize: 15 } }>{ title }</Typography>
        <Typography sx={ { fontSize: 14, color: COLORS.textSecondary, textAlign: 'right' } }>{ summary }</Typography>
        <ChevronRight
          sx={ {
            fontSize: 18,
            color: COLORS.textTertiary,
            transition: 'transform 150ms',
            transform: expanded ? 'rotate(90deg)' : 'none',
          } }/>
      </ButtonBase>
      <Collapse in={ expanded && !disabled } id={ id } unmountOnExit>
        <Box sx={ { px: 2, pb: 2 } }>{ children }</Box>
      </Collapse>
    </Box>
  );
}
