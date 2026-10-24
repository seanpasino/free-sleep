import { Component, ErrorInfo as ReactErrorInfo, PropsWithChildren } from 'react';
import { Alert, Typography } from '@mui/material';


type ErrorInfo = {
  error: Error;
  componentStack: string;
}

type ErrorMessageProps = {
  componentName: string;
  errorInfo?: ErrorInfo;
}


const ErrorMessage = ({ componentName, errorInfo }: ErrorMessageProps) => {
  if (errorInfo && import.meta.env.VITE_ENV === 'dev') {
    const errorMessage =
      errorInfo?.error instanceof Error
        ? errorInfo.error.message
        : typeof errorInfo?.error === 'string'
          ? errorInfo.error
          : '';

    return (
      <Alert severity='error'>

        <Typography color='text.secondary' sx={ { fontFamily: 'monospace' } }>
          ERROR: &nbsp;
          { errorMessage }
          <br />
          { errorInfo.componentStack }
        </Typography>
      </Alert>

    );
  } else {
    return (
      <Alert severity='error'>
        { componentName } failed to load
      </Alert>
    );
  }
};

type ErrorBoundaryProps = PropsWithChildren<Pick<ErrorMessageProps, 'componentName'>>;

type ErrorBoundaryState = {
  errorInfo?: ErrorInfo;
};

// Shows "<componentName> failed to load" instead of blanking the whole page when a child throws
// eslint-disable-next-line react/no-multi-comp
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { errorInfo: { error, componentStack: '' } };
  }

  componentDidCatch(error: Error, info: ReactErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ errorInfo: { error, componentStack: info.componentStack || '' } });
  }

  render() {
    const { children, componentName } = this.props;
    const { errorInfo } = this.state;
    if (errorInfo) return <ErrorMessage componentName={ componentName } errorInfo={ errorInfo }/>;
    return children;
  }
}
