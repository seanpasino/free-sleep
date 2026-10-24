import Button from '@mui/material/Button';
import { postDeviceStatus } from '@api/deviceStatus.ts';
import { reportError, useAppStore } from '@state/appStore.tsx';

type PrimeButtonProps = {
  refetch: any;
}

export default function PrimeButton({ refetch }: PrimeButtonProps) {
  const { setIsUpdating, isUpdating } = useAppStore();

  const handleClick = () => {
    setIsUpdating(true);
    postDeviceStatus({
      isPriming: true,
    })
      .then(() => {
        // Wait 1 second before refreshing the device status
        return new Promise((resolve) => setTimeout(resolve, 1_000));
      })
      .then(() => refetch())
      .catch(error => reportError('start priming', error))
      .finally(() => setIsUpdating(false));
  };

  return (
    <Button variant="contained" onClick={ handleClick } disabled={ isUpdating }>
      Prime now
    </Button>
  );
}
