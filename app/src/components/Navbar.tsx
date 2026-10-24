import React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@state/appStore.tsx';
import { useTheme } from '@mui/material/styles';
import { PAGES } from './pages';
import freeSleepIcon from '../../public/free-sleep-icon.svg';

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

  const handleMobileNavChange = (
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
      { /* Desktop Navigation */ }
      <AppBar
        position="fixed"
        color="transparent"
        sx={ {
          display: { xs: 'none', md: 'flex' },
          borderTop: `1px solid ${theme.palette.grey[700]}`,
          backgroundColor: theme.palette.background.default,
          boxShadow: 'none',
          top: 'auto', // Push it to the bottom
          bottom: 0, // Stick it to the bottom
          left: 0,
          right: 0,
        } }
      >
        <Toolbar>
          <div style={ { flexGrow: 1 } }>
            <img src={ freeSleepIcon } alt="Join our Discord" width={ 45 } height={ 45 } />
          </div>
          <Box sx={ { display: 'flex', gap: 2 } }>
            { PAGES.map(({ title, route }) => (
              <Button
                key={ route }
                onClick={ () => handleNavigation(route) }
                sx={ { color: 'white' } }
                variant={ PAGES[activeIndex]?.route === route ? 'outlined' : 'text' }
              >
                { title }
              </Button>
            )) }
          </Box>
        </Toolbar>
      </AppBar>

      { /* Mobile Bottom Navigation */ }
      <Box
        sx={ {
          display: { xs: 'flex', md: 'none' },
          width: '100%',
          position: 'fixed',
          bottom: 0,
          height: 'calc(80px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          justifyContent: 'space-between',
          borderTop: `1px solid ${theme.palette.grey[700]}`,
          backgroundColor: theme.palette.background.default,
          zIndex: 10,
        } }
      >
        <BottomNavigation
          value={ activeIndex }
          onChange={ handleMobileNavChange }
          sx={ {
            width: '100%',
            backgroundColor: theme.palette.background.default,
            '& .Mui-selected': {
              color: theme.palette.grey[100],
            },
            '& .MuiBottomNavigationAction-root': {
              color: theme.palette.grey[500],
            },
          } }
        >
          { PAGES.map(({ title, icon }, index) => (
            <BottomNavigationAction
              key={ index }
              icon={ icon }
              aria-label={ title }
              sx={ {
                '&.Mui-selected': {
                  color: theme.palette.grey[100],
                },
              } }
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
