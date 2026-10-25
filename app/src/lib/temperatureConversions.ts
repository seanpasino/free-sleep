import { COLORS } from '../theme.ts';

const COOL = COLORS.cool;
const WARM = COLORS.warm;

export function farenheitToCelcius(farenheit: number): number {
  const celcius = (farenheit - 32) * 5 / 9;
  return Math.round(celcius * 2) / 2;
}

export function formatTemperature(temperature: number, celcius: boolean) {
  return celcius ? `${farenheitToCelcius(temperature)}°C` : `${temperature}°F`;
}


// Degrees without the unit, for the big dial number
export function formatDegrees(temperature: number, celcius: boolean) {
  return `${celcius ? farenheitToCelcius(temperature) : temperature}°`;
}

// The range the Pod can actually reach (server/src/8sleep/temperatureLevels.ts)
export const MIN_TEMP_F = 59;
export const MAX_TEMP_F = 108;

export const MIN_TEMP_C = farenheitToCelcius(MIN_TEMP_F);
export const MAX_TEMP_C = farenheitToCelcius(MAX_TEMP_F);


export function getTemperatureColor(tempF: number | undefined) {
  if (tempF === undefined) return '#262626';
  if (tempF <= 70) return '#2196f3';
  if (tempF <= 82) return '#5393ff';
  if (tempF <= 95) return '#db5858';
  return '#d32f2f';
}


// Blue when cooling (or holding a cool target), orange when warming
export function getDialColor(targetF: number, currentF: number) {
  if (targetF < currentF) return COOL;
  if (targetF > currentF) return WARM;
  return targetF < 82 ? COOL : WARM;
}
