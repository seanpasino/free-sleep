import { createTheme } from '@mui/material/styles';

// Night palette from the approved redesign. Text colours pass 4.5:1 on both
// GROUND and SURFACE.
export const COLORS = {
  ground: '#0B0D12',
  navGround: '#0E1016',
  surface: '#151821',
  raised: '#1C2030',
  selectedSurface: '#131C2B',
  border: '#232838',
  divider: '#1F2432',
  text: '#ECEEF3',
  textSecondary: '#A3A9B8',
  textTertiary: '#8B92A3',
  cool: '#5AA9FF',
  warm: '#FF8A4C',
  ok: '#3DD9B3',
} as const;

// Toast / banner tints: [background, border, text, icon]
const TONES = {
  error: ['#2A1517', '#5A2A2E', '#FFD9D9', '#FF9C9C'],
  success: ['#10251F', '#1E4A3F', '#CFF5EA', COLORS.ok],
  warning: ['#2B2212', '#5A4520', '#FFE6BF', '#FFC46B'],
  info: ['#131C2B', '#22314A', '#CFE3FF', COLORS.cool],
} as const;

export const NAV_HEIGHT = 64;

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: COLORS.ground,
      paper: COLORS.surface,
    },
    primary: {
      main: COLORS.cool,
      contrastText: COLORS.ground,
    },
    secondary: {
      main: COLORS.warm,
      contrastText: COLORS.ground,
    },
    warning: {
      main: '#FFC46B',
      contrastText: COLORS.ground,
    },
    error: {
      main: '#FF7A7A',
      contrastText: COLORS.ground,
    },
    success: {
      main: COLORS.ok,
      contrastText: COLORS.ground,
    },
    text: {
      primary: COLORS.text,
      secondary: COLORS.textSecondary,
      disabled: '#5C6273',
    },
    divider: COLORS.divider,
    // Kept for existing components that read palette.grey directly
    grey: {
      100: COLORS.text,
      200: '#C9CEDA',
      300: COLORS.textSecondary,
      400: COLORS.textSecondary,
      500: COLORS.textTertiary,
      700: COLORS.border,
      800: COLORS.border,
      900: COLORS.surface,
    },
  },
  // MUI's default: existing sx={ { borderRadius: n } } values multiply this, so radii
  // for the new look are set per component below instead
  shape: {
    borderRadius: 4,
  },
  typography: {
    fontFamily: FONT,
    button: {
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.9375rem',
    },
    h2: { fontWeight: 300, letterSpacing: '-0.04em' },
    h3: { fontWeight: 400, letterSpacing: '-0.03em' },
    h5: { fontWeight: 600, letterSpacing: '-0.02em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: COLORS.ground },
      },
    },
    MuiPaper: {
      styleOverrides: {
        // Flat surfaces instead of MUI's elevation overlay
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: 18, border: `1px solid ${COLORS.border}` },
      },
    },
    MuiAccordion: {
      defaultProps: { elevation: 0, disableGutters: true },
      styleOverrides: {
        root: {
          borderRadius: 18,
          border: `1px solid ${COLORS.border}`,
          '&::before': { display: 'none' },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 12, minHeight: 44 },
        outlined: {
          borderColor: COLORS.border,
          color: COLORS.text,
          backgroundColor: COLORS.surface,
          '&:hover': { borderColor: '#2F3548', backgroundColor: COLORS.raised },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          border: 'none',
          borderRadius: 8,
          color: COLORS.textSecondary,
          '&.Mui-selected, &.Mui-selected:hover': {
            color: COLORS.text,
            backgroundColor: '#262C3D',
          },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 3, gap: 2 },
        grouped: { border: 'none !important', borderRadius: '8px !important' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, alignItems: 'center', fontSize: '0.875rem', lineHeight: 1.45 },
        standardError: {
          backgroundColor: TONES.error[0],
          border: `1px solid ${TONES.error[1]}`,
          color: TONES.error[2],
          '& .MuiAlert-icon': { color: TONES.error[3] },
        },
        standardSuccess: {
          backgroundColor: TONES.success[0],
          border: `1px solid ${TONES.success[1]}`,
          color: TONES.success[2],
          '& .MuiAlert-icon': { color: TONES.success[3] },
        },
        standardWarning: {
          backgroundColor: TONES.warning[0],
          border: `1px solid ${TONES.warning[1]}`,
          color: TONES.warning[2],
          '& .MuiAlert-icon': { color: TONES.warning[3] },
        },
        standardInfo: {
          backgroundColor: TONES.info[0],
          border: `1px solid ${TONES.info[1]}`,
          color: TONES.info[2],
          '& .MuiAlert-icon': { color: TONES.info[3] },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked + .MuiSwitch-track': { opacity: 1 } },
        track: { backgroundColor: '#3A4155', opacity: 1 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 20, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.raised },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 500 },
      },
    },
  },
});
