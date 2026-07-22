export type CalamityType = 'Fire' | 'Earthquake' | 'Typhoon' | 'Other';

export type CalamityRadiusConfig = {
  min: number;
  max: number;
  step: number;
  defaultKm: number;
  /** Short scale label shown near the slider (barangay / city / region). */
  scaleLabel: string;
  /** Tick labels under the slider: [left, mid, right]. */
  ticks: [string, string, string];
  hint: string;
};

export const EARTHQUAKE_MAGNITUDE_PRESETS = [
  { label: 'M4.5', value: 'M4.5', radiusKm: 15 },
  { label: 'M5.5', value: 'M5.5', radiusKm: 40 },
  { label: 'M6.5', value: 'M6.5', radiusKm: 80 },
  { label: 'M7.5', value: 'M7.5', radiusKm: 150 },
] as const;

const TYPHOON_SIGNAL_RADIUS_KM: Record<string, number> = {
  'Signal No. 1': 50,
  'Signal No. 2': 100,
  'Signal No. 3': 150,
  'Signal No. 4': 220,
  'Signal No. 5': 300,
};

/** Parse a magnitude number from free text or chip value (e.g. "M6.5", "Magnitude 6.2"). */
export function parseMagnitudeNumber(magnitude: string | undefined | null): number | null {
  if (!magnitude?.trim()) return null;
  const match = magnitude.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function radiusKmForEarthquakeMagnitude(magnitude: string | undefined | null): number {
  const preset = EARTHQUAKE_MAGNITUDE_PRESETS.find((p) => p.value === magnitude?.trim());
  if (preset) return preset.radiusKm;

  const n = parseMagnitudeNumber(magnitude);
  if (n == null) return 40;
  if (n < 5) return 15;
  if (n < 6) return 40;
  if (n < 7) return 80;
  return 150;
}

export function radiusKmForTyphoonSignal(signalLevel: string | undefined | null): number {
  if (!signalLevel) return 100;
  return TYPHOON_SIGNAL_RADIUS_KM[signalLevel] ?? 100;
}

export function getCalamityRadiusConfig(
  type: CalamityType,
  opts?: { magnitude?: string; signalLevel?: string }
): CalamityRadiusConfig {
  switch (type) {
    case 'Fire':
      return {
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultKm: 0.3,
        scaleLabel: 'block',
        ticks: ['0.1 km', '0.5 km', '1 km'],
        hint: 'Fire stays small-scale (building / block). Keep under 1 km unless the fire is spreading widely.',
      };
    case 'Earthquake': {
      const recommended = radiusKmForEarthquakeMagnitude(opts?.magnitude);
      return {
        min: 10,
        max: 200,
        step: 5,
        defaultKm: recommended,
        scaleLabel: 'city–region',
        ticks: ['10 km', '100 km', '200 km'],
        hint: opts?.magnitude?.trim()
          ? `Earthquake ${opts.magnitude.trim()} ≈ city-to-region scale (~${recommended} km). Fine-tune if needed.`
          : 'Pick a magnitude to auto-size the zone, or drag the slider for city-scale coverage.',
      };
    }
    case 'Typhoon': {
      const recommended = radiusKmForTyphoonSignal(opts?.signalLevel);
      const signal = opts?.signalLevel?.trim() || 'Signal No. 2';
      return {
        min: 25,
        max: 350,
        step: 5,
        defaultKm: recommended,
        scaleLabel: 'city–province',
        ticks: ['25 km', '175 km', '350 km'],
        hint: `${signal} ≈ city-to-province scale (~${recommended} km). Widen for landfall / multiple LGUs.`,
      };
    }
    case 'Other':
    default:
      return {
        min: 1,
        max: 50,
        step: 1,
        defaultKm: 5,
        scaleLabel: 'local–city',
        ticks: ['1 km', '25 km', '50 km'],
        hint: 'Use a small radius for localized hazards; widen for city-wide events.',
      };
  }
}

/** Clamp a radius into the allowed range for the calamity type. */
export function clampCalamityRadiusKm(
  type: CalamityType,
  radiusKm: number,
  opts?: { magnitude?: string; signalLevel?: string }
): number {
  const { min, max } = getCalamityRadiusConfig(type, opts);
  if (!Number.isFinite(radiusKm)) return min;
  return Math.min(max, Math.max(min, radiusKm));
}
