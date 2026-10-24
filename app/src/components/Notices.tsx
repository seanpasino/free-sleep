import { Alert, Snackbar } from '@mui/material';
import { useAppStore } from '@state/appStore.tsx';


export default function Notices() {
  const notice = useAppStore(state => state.notice);
  const clearNotice = useAppStore(state => state.clearNotice);

  return (
    <Snackbar
      key={ notice?.id }
      open={ !!notice }
      autoHideDuration={ notice?.severity === 'success' ? 3_000 : 6_000 }
      onClose={ (_, reason) => {
        if (reason === 'clickaway') return;
        clearNotice();
      } }
      anchorOrigin={ { vertical: 'top', horizontal: 'center' } }
    >
      <Alert
        severity={ notice?.severity || 'error' }
        variant="filled"
        onClose={ clearNotice }
        sx={ { width: '100%' } }
      >
        { notice?.message }
      </Alert>
    </Snackbar>
  );
}
