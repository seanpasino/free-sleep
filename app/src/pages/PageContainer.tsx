import React from 'react';
import { Container, ContainerProps } from '@mui/material';
import { SxProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ErrorBoundary from '@components/ErrorBoundary.tsx';
import { pageBottomClearance } from '../theme.ts';


type PageContainerProps = {
  containerProps?: ContainerProps;
  sx?: SxProps
}

export default function PageContainer({ children, sx, containerProps }: React.PropsWithChildren<PageContainerProps>) {
  const theme = useTheme();

  return (
    <ErrorBoundary componentName='Page container'>
      <Container
        { ...containerProps }
        id='PageContainer'
        sx={ {
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          alignItems: 'center',
          gap: 2,
          margin: 0,
          justifyContent: 'center',
          // Pages may override pb (sx comes last); the media queries below only set
          // the other sides, so they can't undo it
          pb: pageBottomClearance(),
          [theme.breakpoints.up('sm')]: {
            width: '90%',
            px: 0,
            pt: 6,
            maxWidth: '700px',
          },
          [theme.breakpoints.down('sm')]: {
            width: '100%',
            px: 1,
            pt: 1,
          },
          ...sx,
        } }
      >
        { children }
      </Container>
    </ErrorBoundary>
  );
}
