import { CircularSliderWithChildren } from 'react-circular-slider-svg';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@state/appStore';
import styles from './Slider.module.scss';
import TemperatureLabel from './TemperatureLabel.tsx';
import TemperatureButtons from './TemperatureButtons.tsx';
import { useControlTempStore } from './controlTempStore.tsx';
import { sendPendingTarget } from './targetTemperature.ts';
import { useTheme } from '@mui/material/styles';
import { useResizeDetector } from 'react-resize-detector';
import { useSettings } from '@api/settings.ts';
import { MAX_TEMP_F, MIN_TEMP_F, getTemperatureColor } from '@lib/temperatureConversions.ts';

type SliderProps = {
  isOn: boolean;
  isActive?: boolean | null;
  currentTargetTemp: number;
  currentTemperatureF: number;
  displayCelsius: boolean;
}

export default function Slider({ isOn, isActive, currentTargetTemp, currentTemperatureF, displayCelsius }: SliderProps) {
  const queryClient = useQueryClient();
  const { side } = useAppStore();
  const pendingTemperatureF = useControlTempStore(state => state.pendingTarget[side]?.temperatureF);
  const setPendingTarget = useControlTempStore(state => state.setPendingTarget);
  const { data: settings } = useSettings();
  const isInAwayMode = settings?.[side].awayMode;
  // Not disabled while a save is in flight: a newer value simply supersedes the pending one
  const disabled = isInAwayMode || !isOn;
  const { width, ref } = useResizeDetector();
  const theme = useTheme();

  // What the dial shows: the user's not-yet-confirmed pick, else what the Pod reports
  const targetTemperatureF = pendingTemperatureF ?? currentTargetTemp;
  const sliderColor = getTemperatureColor(targetTemperatureF);

  const handleControlFinished = () => {
    if (disabled) return;
    void sendPendingTarget(queryClient, side);
  };

  const handleChange = (value: number) => {
    if (disabled) return;
    const rounded = Math.round(value);
    if (rounded !== targetTemperatureF) setPendingTarget(side, rounded);
  };

  const arcBackgroundColor = theme.palette.grey[700];

  const minTemp = Math.min(currentTemperatureF, targetTemperatureF);
  const maxTemp = Math.max(currentTemperatureF, targetTemperatureF);
  const isHeating = currentTemperatureF < targetTemperatureF;

  return (
    <div
      ref={ ref }
      style={ { position: 'relative', display: 'inline-block', width: '100%', maxWidth: '400px' } }
    >
      { /* Circular Slider */ }
      <div className={ `${styles.Slider} ${disabled && styles.Disabled} ${isHeating && styles.Heating}` }>
        <CircularSliderWithChildren
          disabled={ disabled }
          onControlFinished={ handleControlFinished }
          size={ width }
          trackWidth={ 6 }
          minValue={ MIN_TEMP_F }
          maxValue={ MAX_TEMP_F }
          startAngle={ 60 }
          endAngle={ 300 }
          angleType={ {
            direction: 'cw',
            axis: '-y'
          } }
          handle1={ {
            value: minTemp,
            onChange: handleChange,

          } }
          arcColor={ isOn ? sliderColor : arcBackgroundColor }
          arcBackgroundColor={ arcBackgroundColor }
          handle2={ {
            value: maxTemp,
            onChange: handleChange,
          } }
          handleSize={ 8 }
        >
          <TemperatureLabel
            isOn={ isOn }
            isActive={ isActive }
            sliderTemp={ targetTemperatureF }
            sliderColor={ sliderColor }
            currentTargetTemp={ currentTargetTemp }
            currentTemperatureF={ currentTemperatureF }
            displayCelsius={ displayCelsius }
          />
        </CircularSliderWithChildren>
      </div>
      {
        isOn && (
          <TemperatureButtons targetTemperatureF={ targetTemperatureF }/>
        ) }
    </div>
  );
};
