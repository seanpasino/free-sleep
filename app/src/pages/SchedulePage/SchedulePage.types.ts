import { DayOfWeek } from '@api/schedulesSchema.ts';

export type DaysSelected = Record<
  DayOfWeek,
  boolean
>;



// Which schedule row is expanded
export type AccordionExpanded = undefined | 'power' | 'startTemp' | 'alarm' | 'applyToDays';

