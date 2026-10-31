// What a side's bed is doing, in words the dial and side cards can share. With bed control the
// setpoint is the temperature under a sleeper: an empty bed sits below it on purpose, because body
// heat makes up the difference, so "bed below setpoint" alone doesn't mean the Pod is warming it.
export type BedSnapshot = {
  bedF: number | null;
  waterF: number | null;
  waterTargetF: number | null;
  present: boolean;
};

export type BedPhase = 'starting' | 'ready' | 'bodyHeat' | 'warming' | 'cooling' | 'holding';

// The bed reading settles within this of the setpoint
const ON_TARGET_F = 0.5;
// The water is on its way to a new target when it's at least this far off
const WATER_MOVING_F = 1;

export const getBedPhase = (
  targetF: number,
  currentF: number,
  isActive: boolean | null | undefined,
  bed: BedSnapshot | null,
): BedPhase => {
  // Commanded on, but the firmware defers actuation for a couple minutes (anti-short-cycle)
  if (isActive === false) return 'starting';
  if (!bed) {
    if (currentF < targetF) return 'warming';
    return currentF > targetF ? 'cooling' : 'holding';
  }
  const bedF = bed.bedF ?? currentF;
  if (bedF > targetF + ON_TARGET_F) return 'cooling';
  if (bedF >= targetF - ON_TARGET_F) return bed.present ? 'holding' : 'ready';
  const waterWarming = bed.waterF !== null && bed.waterTargetF !== null && bed.waterTargetF - bed.waterF >= WATER_MOVING_F;
  if (waterWarming) return 'warming';
  return bed.present ? 'bodyHeat' : 'ready';
};

// The bed is short of the setpoint and waiting on a body, not on the Pod
export const isAwaitingBody = (phase: BedPhase) => phase === 'ready' || phase === 'bodyHeat';
