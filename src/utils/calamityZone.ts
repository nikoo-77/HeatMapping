import { ALL_ISLAND_LOCATIONS, PHILIPPINE_REGIONS } from '../data_islands';
import type { CalamityType } from './calamityRadius';
import { parseMagnitudeNumber } from './calamityRadius';

export type EarthquakeImpactScope = 'local' | 'region' | 'island';

export type GeoPoint = { lat: number; lng: number };

export type ResolvedGeo = {
  islandGroup: 'Luzon' | 'Visayas' | 'Mindanao';
  region: string;
  city: string;
  label: string;
};

export type CalamityZoneInput = {
  type: CalamityType;
  lat: number;
  lng: number;
  radiusKm: number;
  magnitude?: string;
  signalLevel?: string;
  impactScope?: EarthquakeImpactScope;
  islandGroup?: string | null;
  region?: string | null;
  trackPoints?: GeoPoint[];
  corridorKm?: number;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearest known workforce location → island group + region for the pinned epicenter. */
export function resolveGeoAt(lat: number, lng: number): ResolvedGeo {
  let best = ALL_ISLAND_LOCATIONS[0];
  let bestD = Infinity;
  for (const loc of ALL_ISLAND_LOCATIONS) {
    const d = haversineKm(lat, lng, loc.gpsLat, loc.gpsLng);
    if (d < bestD) {
      bestD = d;
      best = loc;
    }
  }

  // Prefer region whose bounds contain the pin when available.
  const containing = PHILIPPINE_REGIONS.find((r) => {
    const [swLat, swLng, neLat, neLng] = r.bounds;
    return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
  });

  const region = containing?.code ?? best.region;
  const islandGroup = (containing?.islandGroup ?? best.islandGroup) as ResolvedGeo['islandGroup'];
  const regionName = containing?.name ?? REGION_LABEL[region] ?? region;

  return {
    islandGroup,
    region,
    city: best.city,
    label: `${best.city} · ${regionName} · ${islandGroup}`,
  };
}

const REGION_LABEL: Record<string, string> = Object.fromEntries(
  PHILIPPINE_REGIONS.map((r) => [r.code, r.name])
);

export function impactScopeForMagnitude(magnitude: string | undefined | null): EarthquakeImpactScope {
  const preset = EARTHQUAKE_SCOPE_PRESETS.find((p) => p.value === magnitude?.trim());
  if (preset) return preset.scope;

  const n = parseMagnitudeNumber(magnitude);
  if (n == null) return 'region';
  if (n < 5) return 'local';
  if (n < 6) return 'region';
  return 'island';
}

/** Magnitude chips: weak = local city, moderate = whole region, strong = whole island group. */
export const EARTHQUAKE_SCOPE_PRESETS = [
  { label: 'M4.5', value: 'M4.5', scope: 'local' as const, blurb: 'City / metro feel' },
  { label: 'M5.5', value: 'M5.5', scope: 'region' as const, blurb: 'Whole region (e.g. VII)' },
  { label: 'M6.5', value: 'M6.5', scope: 'island' as const, blurb: 'Island-wide shake' },
  { label: 'M7.5', value: 'M7.5', scope: 'island' as const, blurb: 'Island group–wide' },
] as const;

/** Approximate display radius so map rings still render for region/island scopes. */
export function displayRadiusKmForEarthquake(
  scope: EarthquakeImpactScope,
  magnitude?: string | null
): number {
  if (scope === 'local') {
    const n = parseMagnitudeNumber(magnitude);
    if (n != null && n < 5) return 35;
    return 50;
  }
  if (scope === 'region') return 180;
  return 350; // island group (Visayas end-to-end scale)
}

/** Typhoon corridor full width (km) by PAGASA signal — path, not a circle. */
export function corridorKmForTyphoonSignal(signalLevel: string | undefined | null): number {
  const map: Record<string, number> = {
    'Signal No. 1': 80,
    'Signal No. 2': 120,
    'Signal No. 3': 160,
    'Signal No. 4': 200,
    'Signal No. 5': 250,
  };
  if (!signalLevel) return 120;
  return map[signalLevel] ?? 120;
}

/** Shortest distance from a point to a polyline path (km). */
export function distanceToTrackKm(lat: number, lng: number, track: GeoPoint[]): number {
  if (track.length === 0) return Infinity;
  if (track.length === 1) return haversineKm(lat, lng, track[0].lat, track[0].lng);

  let minD = Infinity;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    minD = Math.min(minD, distanceToSegmentKm(lat, lng, a, b));
  }
  return minD;
}

function distanceToSegmentKm(lat: number, lng: number, a: GeoPoint, b: GeoPoint): number {
  // Equirectangular projection around point A for local segment math
  const x = ((lng - a.lng) * Math.PI) / 180 * Math.cos((((lat + a.lat) / 2) * Math.PI) / 180);
  const y = ((lat - a.lat) * Math.PI) / 180;
  const x2 = ((b.lng - a.lng) * Math.PI) / 180 * Math.cos((((b.lat + a.lat) / 2) * Math.PI) / 180);
  const y2 = ((b.lat - a.lat) * Math.PI) / 180;
  const segLen2 = x2 * x2 + y2 * y2;
  if (segLen2 < 1e-12) return haversineKm(lat, lng, a.lat, a.lng);
  let t = (x * x2 + y * y2) / segLen2;
  t = Math.max(0, Math.min(1, t));
  const projLat = a.lat + t * (b.lat - a.lat);
  const projLng = a.lng + t * (b.lng - a.lng);
  return haversineKm(lat, lng, projLat, projLng);
}

export function isEmployeeInCalamityZone(
  emp: { gpsLat?: number; gpsLng?: number; lat: number; lng: number; islandGroup?: string; region?: string },
  zone: CalamityZoneInput
): boolean {
  const lat = emp.gpsLat ?? emp.lat;
  const lng = emp.gpsLng ?? emp.lng;

  if (zone.type === 'Earthquake') {
    const scope = zone.impactScope ?? impactScopeForMagnitude(zone.magnitude);
    if (scope === 'island' && zone.islandGroup) {
      return (emp.islandGroup ?? '').toLowerCase() === zone.islandGroup.toLowerCase();
    }
    if (scope === 'region' && zone.region) {
      return (emp.region ?? '').toUpperCase() === zone.region.toUpperCase();
    }
    return haversineKm(zone.lat, zone.lng, lat, lng) <= zone.radiusKm;
  }

  if (zone.type === 'Typhoon') {
    const track = zone.trackPoints?.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) ?? [];
    const corridor = zone.corridorKm ?? corridorKmForTyphoonSignal(zone.signalLevel);
    if (track.length >= 2) {
      return distanceToTrackKm(lat, lng, track) <= corridor / 2;
    }
    // Fallback before a full path is drawn: corridor around the first pin
    if (track.length === 1 || (zone.lat && zone.lng)) {
      const origin = track[0] ?? { lat: zone.lat, lng: zone.lng };
      return haversineKm(origin.lat, origin.lng, lat, lng) <= corridor / 2;
    }
    return false;
  }

  // Fire / Other — classic radius
  return haversineKm(zone.lat, zone.lng, lat, lng) <= zone.radiusKm;
}

export function scopeLabel(scope: EarthquakeImpactScope): string {
  if (scope === 'local') return 'Local (city)';
  if (scope === 'region') return 'Whole region';
  return 'Whole island group';
}
