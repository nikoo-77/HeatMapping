import { HazardRiskLevel, HazardType, RegionHazardEntry, RegionHazardProfile } from './types';
import { HAZARD_TYPE_CONFIG, RISK_LEVEL_OPACITY } from './data_hazard_zones';

/** Map PSGC adm1 codes from ph_regions.geojson → app region codes */
export const PSGC_TO_REGION_CODE: Record<number, string> = {
  100000000: 'I',
  200000000: 'II',
  300000000: 'III',
  400000000: 'IV-A',
  500000000: 'V',
  600000000: 'VI',
  700000000: 'VII',
  800000000: 'VIII',
  900000000: 'IX',
  1000000000: 'X',
  1100000000: 'XI',
  1200000000: 'XII',
  1300000000: 'NCR',
  1400000000: 'CAR',
  1600000000: 'XIII',
  1700000000: 'IV-B',
  1900000000: 'BARMM',
};

const RISK_RANK: Record<HazardRiskLevel, number> = {
  high: 3,
  moderate: 2,
  low: 1,
};

/**
 * Region-level hazard-prone classifications for choropleth coloring.
 * Simplified workforce-awareness profiles (not official NOAH/PHIVOLCS maps).
 */
export const REGION_HAZARD_PROFILES: RegionHazardProfile[] = [
  {
    regionCode: 'NCR',
    regionName: 'National Capital Region',
    hazards: [
      { type: 'flood', riskLevel: 'high', note: 'Marikina, Pasig, and coastal barangays flood during typhoons and habagat.' },
      { type: 'earthquake', riskLevel: 'high', note: 'West Valley Fault corridor crosses Metro Manila.' },
      { type: 'storm_surge', riskLevel: 'high', note: 'Manila Bay shoreline exposed to typhoon surge.' },
      { type: 'fire', riskLevel: 'high', note: 'Dense informal settlements and industrial clusters elevate structural fire risk.' },
    ],
  },
  {
    regionCode: 'CAR',
    regionName: 'Cordillera Administrative Region',
    hazards: [
      { type: 'landslide', riskLevel: 'high', note: 'Steep mountain slopes fail during prolonged rainfall.' },
      { type: 'earthquake', riskLevel: 'moderate', note: 'Active Cordillera fault systems produce strong shaking.' },
      { type: 'flood', riskLevel: 'moderate', note: 'River valleys flood when upland rainfall is intense.' },
    ],
  },
  {
    regionCode: 'I',
    regionName: 'Ilocos Region',
    hazards: [
      { type: 'flood', riskLevel: 'moderate', note: 'Coastal plains and river basins inundate in the wet season.' },
      { type: 'tsunami', riskLevel: 'moderate', note: 'West Luzon coast faces Manila Trench tsunami potential.' },
      { type: 'earthquake', riskLevel: 'low', note: 'Periodic seismic activity along western Luzon structures.' },
    ],
  },
  {
    regionCode: 'II',
    regionName: 'Cagayan Valley',
    hazards: [
      { type: 'flood', riskLevel: 'high', note: 'Cagayan River — the country’s largest river system — has a wide floodplain.' },
      { type: 'landslide', riskLevel: 'moderate', note: 'Sierra Madre foothills are landslide-prone in heavy rain.' },
      { type: 'earthquake', riskLevel: 'moderate', note: 'Valley fault systems can generate strong ground motion.' },
    ],
  },
  {
    regionCode: 'III',
    regionName: 'Central Luzon',
    hazards: [
      { type: 'flood', riskLevel: 'high', note: 'Pampanga and Bulacan lowlands are chronically flood-prone.' },
      { type: 'volcanic', riskLevel: 'moderate', note: 'Pinatubo lahar channels remobilize during typhoons.' },
      { type: 'tsunami', riskLevel: 'moderate', note: 'Zambales west coast has offshore trench tsunami exposure.' },
      { type: 'earthquake', riskLevel: 'moderate', note: 'Central Luzon sits near major Luzon fault systems.' },
      { type: 'fire', riskLevel: 'moderate', note: 'Industrial parks and dry-season grassland raise fire risk.' },
    ],
  },
  {
    regionCode: 'IV-A',
    regionName: 'CALABARZON',
    hazards: [
      { type: 'earthquake', riskLevel: 'high', note: 'West Valley Fault south segment and Laguna fault systems.' },
      { type: 'volcanic', riskLevel: 'high', note: 'Taal Volcano ashfall and base-surge hazard.' },
      { type: 'landslide', riskLevel: 'high', note: 'Rizal mountain slopes fail during extreme rainfall.' },
      { type: 'flood', riskLevel: 'moderate', note: 'Laguna de Bay and river towns flood seasonally.' },
      { type: 'fire', riskLevel: 'moderate', note: 'Growing urban-industrial corridors elevate fire exposure.' },
    ],
  },
  {
    regionCode: 'IV-B',
    regionName: 'MIMAROPA',
    hazards: [
      { type: 'storm_surge', riskLevel: 'moderate', note: 'Exposed island coastlines face monsoon and typhoon surge.' },
      { type: 'tsunami', riskLevel: 'moderate', note: 'Western Palawan and Mindoro coasts have tsunami exposure.' },
      { type: 'flood', riskLevel: 'low', note: 'Localized river and coastal flooding during heavy rain.' },
    ],
  },
  {
    regionCode: 'V',
    regionName: 'Bicol Region',
    hazards: [
      { type: 'volcanic', riskLevel: 'high', note: 'Mayon Volcano permanent danger zone and ashfall corridors.' },
      { type: 'landslide', riskLevel: 'high', note: 'Typhoon landfall saturates ridges — Catanduanes and mainland slopes.' },
      { type: 'storm_surge', riskLevel: 'high', note: 'Pacific-facing coasts take direct typhoon surge impact.' },
      { type: 'flood', riskLevel: 'moderate', note: 'River basins flood after successive typhoon rains.' },
    ],
  },
  {
    regionCode: 'VI',
    regionName: 'Western Visayas',
    hazards: [
      { type: 'flood', riskLevel: 'moderate', note: 'Iloilo and Panay river basins flood in the wet season.' },
      { type: 'volcanic', riskLevel: 'moderate', note: 'Kanlaon Volcano ashfall and phreatic activity.' },
      { type: 'storm_surge', riskLevel: 'moderate', note: 'Coastal municipalities exposed to typhoon surge.' },
      { type: 'earthquake', riskLevel: 'low', note: 'Negros and Panay host active seismic structures.' },
    ],
  },
  {
    regionCode: 'VII',
    regionName: 'Central Visayas',
    hazards: [
      { type: 'flood', riskLevel: 'moderate', note: 'Cebu City urban drainage overload causes flash floods.' },
      { type: 'earthquake', riskLevel: 'moderate', note: 'Central Cebu and Bohol fault systems (2013 M7.2).' },
      { type: 'landslide', riskLevel: 'moderate', note: 'Central Cebu uplands erode during intense rain.' },
      { type: 'storm_surge', riskLevel: 'moderate', note: 'Mactan and eastern Cebu coasts face Camotes Sea surge.' },
      { type: 'fire', riskLevel: 'moderate', note: 'Dense urban CBD and warehouse districts elevate fire risk.' },
    ],
  },
  {
    regionCode: 'VIII',
    regionName: 'Eastern Visayas',
    hazards: [
      { type: 'storm_surge', riskLevel: 'high', note: 'Tacloban plain devastated by Yolanda-type surge scenarios.' },
      { type: 'tsunami', riskLevel: 'high', note: 'Philippine Trench proximity elevates eastern Samar tsunami risk.' },
      { type: 'landslide', riskLevel: 'high', note: 'Southern Leyte slopes have catastrophic landslide history.' },
      { type: 'flood', riskLevel: 'high', note: 'Low-lying Leyte and Samar plains flood after typhoons.' },
    ],
  },
  {
    regionCode: 'IX',
    regionName: 'Zamboanga Peninsula',
    hazards: [
      { type: 'storm_surge', riskLevel: 'moderate', note: 'Peninsula coasts exposed to southwest monsoon surge.' },
      { type: 'flood', riskLevel: 'low', note: 'Localized river flooding in coastal municipalities.' },
      { type: 'earthquake', riskLevel: 'low', note: 'Western Mindanao tectonic activity produces occasional shaking.' },
    ],
  },
  {
    regionCode: 'X',
    regionName: 'Northern Mindanao',
    hazards: [
      { type: 'landslide', riskLevel: 'moderate', note: 'Bukidnon highlands erode on volcanic slopes.' },
      { type: 'flood', riskLevel: 'moderate', note: 'Cagayan de Oro and coastal plains flood in heavy rain.' },
      { type: 'earthquake', riskLevel: 'moderate', note: 'Northern Mindanao sits near active Philippine Fault segments.' },
    ],
  },
  {
    regionCode: 'XI',
    regionName: 'Davao Region',
    hazards: [
      { type: 'earthquake', riskLevel: 'moderate', note: 'Eastern Mindanao tectonic corridor affects Davao metro.' },
      { type: 'tsunami', riskLevel: 'moderate', note: 'Davao Oriental faces the Philippine Trench.' },
      { type: 'flood', riskLevel: 'moderate', note: 'River basins flood during southwest monsoon peaks.' },
      { type: 'fire', riskLevel: 'low', note: 'Urban Davao districts carry structural fire exposure.' },
    ],
  },
  {
    regionCode: 'XII',
    regionName: 'SOCCSKSARGEN',
    hazards: [
      { type: 'flood', riskLevel: 'moderate', note: 'Cotabato basin and river systems flood seasonally.' },
      { type: 'earthquake', riskLevel: 'low', note: 'Cotabato Fault and related structures produce shaking.' },
      { type: 'landslide', riskLevel: 'low', note: 'Upland barangays face rain-triggered slope failures.' },
    ],
  },
  {
    regionCode: 'XIII',
    regionName: 'Caraga',
    hazards: [
      { type: 'tsunami', riskLevel: 'high', note: 'Surigao coast sits above the Philippine Trench subduction zone.' },
      { type: 'flood', riskLevel: 'moderate', note: 'Coastal and river communities flood after Pacific typhoons.' },
      { type: 'landslide', riskLevel: 'moderate', note: 'Mountainous Caraga terrain fails when soils saturate.' },
      { type: 'earthquake', riskLevel: 'moderate', note: 'Frequent seismic activity along the Philippine Fault.' },
    ],
  },
  {
    regionCode: 'BARMM',
    regionName: 'Bangsamoro (BARMM)',
    hazards: [
      { type: 'flood', riskLevel: 'moderate', note: 'Riverine Maguindanao and Lanao plains flood seasonally.' },
      { type: 'storm_surge', riskLevel: 'low', note: 'Island and coastal barangays face monsoon surge.' },
      { type: 'earthquake', riskLevel: 'low', note: 'Cotabato and surrounding fault systems produce occasional quakes.' },
    ],
  },
];

export const REGION_HAZARD_BY_CODE = Object.fromEntries(
  REGION_HAZARD_PROFILES.map((p) => [p.regionCode, p])
) as Record<string, RegionHazardProfile>;

export function resolveRegionCodeFromFeature(props: Record<string, unknown>): string | null {
  const psgc = Number(props.adm1_psgc);
  if (Number.isFinite(psgc) && PSGC_TO_REGION_CODE[psgc]) {
    return PSGC_TO_REGION_CODE[psgc];
  }
  const name = String(props.adm1_en ?? '').toLowerCase();
  if (name.includes('national capital') || name.includes('(ncr)')) return 'NCR';
  if (name.includes('cordillera') || name.includes('(car)')) return 'CAR';
  if (name.includes('bangsamoro') || name.includes('barmm')) return 'BARMM';
  if (name.includes('mimaropa')) return 'IV-B';
  if (name.includes('iv-a') || name.includes('calabarzon')) return 'IV-A';
  if (name.includes('region i (')) return 'I';
  if (name.includes('region ii')) return 'II';
  if (name.includes('region iii')) return 'III';
  if (name.includes('region v ')) return 'V';
  if (name.includes('region vi')) return 'VI';
  if (name.includes('region vii')) return 'VII';
  if (name.includes('region viii')) return 'VIII';
  if (name.includes('region ix')) return 'IX';
  if (name.includes('region x ')) return 'X';
  if (name.includes('region xi')) return 'XI';
  if (name.includes('region xii')) return 'XII';
  if (name.includes('region xiii') || name.includes('caraga')) return 'XIII';
  return null;
}

/** Among active hazard types, pick the highest-risk entry for a region. */
export function getDominantHazard(
  profile: RegionHazardProfile | undefined,
  activeTypes: Record<HazardType, boolean>
): RegionHazardEntry | null {
  if (!profile) return null;
  const active = profile.hazards.filter((h) => activeTypes[h.type]);
  if (active.length === 0) return null;
  return active.reduce((best, cur) =>
    RISK_RANK[cur.riskLevel] > RISK_RANK[best.riskLevel] ? cur : best
  );
}

export function getRegionFillStyle(
  profile: RegionHazardProfile | undefined,
  activeTypes: Record<HazardType, boolean>,
  isSelected: boolean
): {
  color: string;
  weight: number;
  opacity: number;
  fillColor: string;
  fillOpacity: number;
  dashArray?: string;
} {
  const dominant = getDominantHazard(profile, activeTypes);
  if (!dominant) {
    return {
      color: '#94a3b8',
      weight: 1,
      opacity: 0.5,
      fillColor: '#e2e8f0',
      fillOpacity: 0.15,
    };
  }
  const config = HAZARD_TYPE_CONFIG[dominant.type];
  return {
    color: isSelected ? '#0f172a' : config.color,
    weight: isSelected ? 2.5 : dominant.riskLevel === 'high' ? 1.8 : 1.2,
    opacity: 0.9,
    fillColor: config.color,
    fillOpacity: isSelected
      ? Math.min(0.75, RISK_LEVEL_OPACITY[dominant.riskLevel] + 0.2)
      : RISK_LEVEL_OPACITY[dominant.riskLevel],
    dashArray: dominant.riskLevel === 'low' ? '5 4' : undefined,
  };
}
