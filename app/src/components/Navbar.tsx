import React from 'react';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@state/appStore.tsx';
import { useTheme } from '@mui/material/styles';
import { PAGES } from './pages';
import { COLORS, NAV_HEIGHT, SAFE_BOTTOM } from '../theme.ts';

// '/', '/left' and '/right' all render the temperature page; '/data/sleep' etc. belong to Data
const getActivePageIndex = (pathname: string) => {
  if (pathname === '/' || pathname === '/left' || pathname === '/right') return 0;
  const index = PAGES.findIndex(({ route }) => pathname === route || pathname.startsWith(`${route}/`));
  return index === -1 ? 0 : index;
};

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isUpdating, confirmDiscardChanges } = useAppStore();
  const theme = useTheme(); // Access the Material-UI theme
  // Derived from the URL on every render so it follows back/forward navigation and sub-pages
  const activeIndex = getActivePageIndex(pathname);

  // Handle navigation for both desktop and mobile
  const handleNavigation = (route: string) => {
    if (pathname === route) return;
    if (!confirmDiscardChanges()) return;
    navigate(route);
  };

  const handleNavChange = (
    _event: React.SyntheticEvent,
    newValue: number
  ) => {
    handleNavigation(PAGES[newValue].route);
  };

  const gradient = `linear-gradient(
  90deg,
  transparent,
  ${theme.palette.primary.dark},
  transparent,
  ${theme.palette.primary.dark},
  transparent
)`;
  return (
    <>
      { /* Loading Bar */ }
      <Box
        sx={ {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '4px',
          background: isUpdating ? gradient : 'transparent',
          backgroundSize: '200% 100%',
          animation: isUpdating
            ? 'slide-gradient 10s linear infinite reverse'
            : 'none',
          zIndex: 1201,
        } }
      />
      { /* One labelled bottom bar on every screen size */ }
      <Box
        component="nav"
        aria-label="Main"
        sx={ {
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          position: 'fixed',
          bottom: 0,
          left: 0,
          paddingBottom: SAFE_BOTTOM,
          borderTop: `1px solid ${COLORS.raised}`,
          backgroundColor: COLORS.navGround,
          zIndex: 10,
        } }
      >
        <BottomNavigation
          showLabels
          value={ activeIndex }
          onChange={ handleNavChange }
          sx={ {
            width: '100%',
            maxWidth: 640,
            height: NAV_HEIGHT,
            backgroundColor: 'transparent',
            '& .MuiBottomNavigationAction-root': {
              color: COLORS.textTertiary,
              minWidth: 0,
              gap: '4px',
              '& .MuiBottomNavigationAction-label': { fontSize: 11, fontWeight: 500 },
            },
            '& .MuiBottomNavigationAction-root.Mui-selected': {
              color: COLORS.text,
              '& .MuiSvgIcon-root': { color: theme.palette.primary.main },
              '& .MuiBottomNavigationAction-label': { fontSize: 11 },
            },
          } }
        >
          { PAGES.map(({ title, icon, route }) => (
            <BottomNavigationAction
              key={ route }
              label={ title }
              icon={ icon }
            />
          )) }
        </BottomNavigation>
      </Box>
      <style>
        { `
@keyframes slide-gradient {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}
        ` }
      </style>
    </>
  );
}
