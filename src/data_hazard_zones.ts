import { HazardTypeConfig, HazardZone } from './types';

/** Hazard layer styling — distinct colors per classification (NOAH-inspired) */
export const HAZARD_TYPE_CONFIG: Record<string, HazardTypeConfig> = {
  flood: {
    type: 'flood',
    label: 'Flood-Prone Areas',
    color: '#1d4ed8',
    fillColor: 'rgba(37, 99, 235, 0.35)',
    icon: '🌊',
    description: 'Areas susceptible to river overflow, urban flooding, and heavy-rain inundation.',
  },
  landslide: {
    type: 'landslide',
    label: 'Landslide-Prone Areas',
    color: '#78350f',
    fillColor: 'rgba(120, 53, 15, 0.40)',
    icon: '⛰️',
    description: 'Steep slopes and geologically unstable terrain with high soil movement risk.',
  },
  storm_surge: {
    type: 'storm_surge',
    label: 'Storm Surge Zones',
    color: '#0e7490',
    fillColor: 'rgba(14, 116, 144, 0.35)',
    icon: '🌀',
    description: 'Low-lying coastal areas vulnerable to typhoon-driven sea-level rise.',
  },
  earthquake: {
    type: 'earthquake',
    label: 'Earthquake-Prone Areas',
    color: '#c2410c',
    fillColor: 'rgba(234, 88, 12, 0.30)',
    icon: '⚡',
    description: 'Active fault corridors and seismically active zones with ground-shaking hazard.',
  },
  volcanic: {
    type: 'volcanic',
    label: 'Volcanic Hazard Zones',
    color: '#b91c1c',
    fillColor: 'rgba(220, 38, 38, 0.30)',
    icon: '🌋',
    description: 'Areas within volcanic hazard radius — ashfall, pyroclastic flow, and lahar paths.',
  },
  tsunami: {
    type: 'tsunami',
    label: 'Tsunami-Prone Coasts',
    color: '#5b21b6',
    fillColor: 'rgba(91, 33, 182, 0.30)',
    icon: '🌊',
    description: 'Eastern and western coastal strips exposed to tsunami inundation from offshore events.',
  },
};

export const RISK_LEVEL_OPACITY: Record<string, number> = {
  high: 0.55,
  moderate: 0.35,
  low: 0.20,
};

export const RISK_LEVEL_LABELS: Record<string, string> = {
  high: 'High Risk',
  moderate: 'Moderate Risk',
  low: 'Low Risk',
};

/**
 * Representative Philippine hazard zones (simplified polygons for visualization).
 * Inspired by NOAH Know Your Hazards — not official government hazard maps.
 */
export const HAZARD_ZONES: HazardZone[] = [
  // ── FLOOD ──────────────────────────────────────────────────────────────────
  {
    id: 'flood-marikina',
    name: 'Marikina River Basin',
    type: 'flood',
    riskLevel: 'high',
    region: 'NCR',
    province: 'Metro Manila',
    description: 'Frequent overflow during habagat and typhoon events. Low-lying barangays along the Marikina River are among the most flood-prone in NCR.',
    polygon: [[14.62, 121.08], [14.68, 121.12], [14.72, 121.10], [14.70, 121.04], [14.64, 121.02], [14.60, 121.06]],
  },
  {
    id: 'flood-pasig',
    name: 'Pasig–Taguig Flood Plain',
    type: 'flood',
    riskLevel: 'high',
    region: 'NCR',
    province: 'Metro Manila',
    description: 'Confluence of Pasig River tributaries. Urban drainage overload causes rapid inundation in commercial and residential zones.',
    polygon: [[14.52, 121.04], [14.58, 121.10], [14.56, 121.14], [14.50, 121.12], [14.48, 121.06]],
  },
  {
    id: 'flood-malabon-navotas',
    name: 'Malabon–Navotas Coastal Flood Zone',
    type: 'flood',
    riskLevel: 'high',
    region: 'NCR',
    province: 'Metro Manila',
    description: 'Below-sea-level areas with chronic tidal flooding and stormwater backup during heavy rains.',
    polygon: [[14.64, 120.93], [14.68, 120.98], [14.66, 121.02], [14.60, 121.00], [14.58, 120.94]],
  },
  {
    id: 'flood-pampanga',
    name: 'Pampanga River Delta',
    type: 'flood',
    riskLevel: 'high',
    region: 'III',
    province: 'Pampanga',
    description: 'Wide alluvial plain subject to lahar and river flooding. Major agricultural and industrial corridor at risk.',
    polygon: [[14.90, 120.50], [15.20, 120.80], [15.10, 121.00], [14.80, 120.90], [14.75, 120.60]],
  },
  {
    id: 'flood-bulacan',
    name: 'Bulacan Lowlands',
    type: 'flood',
    riskLevel: 'moderate',
    region: 'III',
    province: 'Bulacan',
    description: 'Flat terrain between Manila Bay and Sierra Madre foothills. Susceptible to river backflow and dam releases.',
    polygon: [[14.70, 120.80], [14.95, 121.00], [14.90, 121.15], [14.65, 121.05], [14.60, 120.85]],
  },
  {
    id: 'flood-cebu-city',
    name: 'Cebu City Urban Flood Zone',
    type: 'flood',
    riskLevel: 'moderate',
    region: 'VII',
    province: 'Cebu',
    description: 'Dense urban catchment with inadequate drainage. Guadalupe and Lahug areas flood during intense rainfall.',
    polygon: [[10.28, 123.86], [10.34, 123.92], [10.32, 123.96], [10.26, 123.94], [10.24, 123.88]],
  },
  {
    id: 'flood-cagayan',
    name: 'Cagayan River Valley',
    type: 'flood',
    riskLevel: 'high',
    region: 'II',
    province: 'Cagayan',
    description: 'Largest river system in the Philippines. Wide floodplain affects Tuguegarao and surrounding municipalities.',
    polygon: [[17.40, 121.50], [18.00, 122.00], [17.80, 122.30], [17.20, 121.90], [17.10, 121.60]],
  },
  {
    id: 'flood-iloilo',
    name: 'Iloilo River Basin',
    type: 'flood',
    riskLevel: 'moderate',
    region: 'VI',
    province: 'Iloilo',
    description: 'Urban and agricultural areas along the Iloilo River experience seasonal flooding.',
    polygon: [[10.66, 122.52], [10.74, 122.60], [10.70, 122.68], [10.62, 122.64], [10.60, 122.54]],
  },

  // ── LANDSLIDE ──────────────────────────────────────────────────────────────
  {
    id: 'landslide-baguio',
    name: 'Baguio–Benguet Slopes',
    type: 'landslide',
    riskLevel: 'high',
    region: 'CAR',
    province: 'Benguet',
    description: 'Steep mountain terrain with saturated soils during prolonged rainfall. High casualty history from slope failures.',
    polygon: [[16.35, 120.52], [16.50, 120.65], [16.48, 120.72], [16.38, 120.68], [16.30, 120.55]],
  },
  {
    id: 'landslide-rizal',
    name: 'Rizal Mountain Slopes',
    type: 'landslide',
    riskLevel: 'high',
    region: 'IV-A',
    province: 'Rizal',
    description: 'Antipolo, Tanay, and Rodriguez sit on unstable slopes. Heavy rains trigger frequent landslides on access roads.',
    polygon: [[14.55, 121.10], [14.70, 121.25], [14.65, 121.35], [14.50, 121.28], [14.48, 121.15]],
  },
  {
    id: 'landslide-leyte',
    name: 'Southern Leyte Slopes',
    type: 'landslide',
    riskLevel: 'high',
    region: 'VIII',
    province: 'Southern Leyte',
    description: 'Geologically weak slopes along the Pacific coast. Known for catastrophic rain-triggered landslides.',
    polygon: [[10.20, 124.80], [10.50, 125.10], [10.40, 125.25], [10.10, 125.00], [10.05, 124.85]],
  },
  {
    id: 'landslide-catanduanes',
    name: 'Catanduanes Ridge',
    type: 'landslide',
    riskLevel: 'high',
    region: 'V',
    province: 'Catanduanes',
    description: 'First landfall for many typhoons. Saturated ridges collapse frequently during extreme rainfall events.',
    polygon: [[13.50, 124.00], [13.80, 124.30], [13.70, 124.50], [13.45, 124.35], [13.40, 124.10]],
  },
  {
    id: 'landslide-cebu-central',
    name: 'Central Cebu Uplands',
    type: 'landslide',
    riskLevel: 'moderate',
    region: 'VII',
    province: 'Cebu',
    description: 'Transcentral highway and upland barangays prone to soil erosion and slope instability.',
    polygon: [[10.30, 123.75], [10.42, 123.85], [10.38, 123.92], [10.28, 123.88], [10.25, 123.78]],
  },
  {
    id: 'landslide-bukidnon',
    name: 'Bukidnon Highlands',
    type: 'landslide',
    riskLevel: 'moderate',
    region: 'X',
    province: 'Bukidnon',
    description: 'Agricultural slopes on volcanic terrain. Erosion and mass wasting during monsoon season.',
    polygon: [[7.80, 124.80], [8.10, 125.10], [8.00, 125.25], [7.70, 125.05], [7.65, 124.85]],
  },

  // ── STORM SURGE ────────────────────────────────────────────────────────────
  {
    id: 'surge-manila-bay',
    name: 'Manila Bay Coastline',
    type: 'storm_surge',
    riskLevel: 'high',
    region: 'NCR',
    province: 'Metro Manila',
    description: 'Low-elevation coastal strip from Navotas to Parañaque. Vulnerable to typhoon-driven storm surge up to 4m.',
    polygon: [[14.45, 120.90], [14.65, 120.92], [14.62, 121.02], [14.48, 121.00], [14.42, 120.94]],
  },
  {
    id: 'surge-tacloban',
    name: 'Tacloban Coastal Plain',
    type: 'storm_surge',
    riskLevel: 'high',
    region: 'VIII',
    province: 'Leyte',
    description: 'Historically devastated by Yolanda (2013) storm surge. Flat coastal geography amplifies inundation.',
    polygon: [[11.15, 124.95], [11.30, 125.05], [11.28, 125.15], [11.12, 125.10], [11.08, 125.00]],
  },
  {
    id: 'surge-cebu-coast',
    name: 'Cebu Eastern Coast',
    type: 'storm_surge',
    riskLevel: 'moderate',
    region: 'VII',
    province: 'Cebu',
    description: 'Mactan and Lapu-Lapu coastal communities exposed to typhoon surge from the Camotes Sea.',
    polygon: [[10.28, 123.96], [10.36, 124.02], [10.34, 124.08], [10.26, 124.04], [10.24, 123.98]],
  },
  {
    id: 'surge-palawan',
    name: 'Palawan Western Coast',
    type: 'storm_surge',
    riskLevel: 'moderate',
    region: 'IV-B',
    province: 'Palawan',
    description: 'Exposed western coastline with limited natural barriers against strong monsoon surges.',
    polygon: [[9.50, 118.50], [10.00, 118.80], [9.80, 119.10], [9.40, 118.90], [9.30, 118.60]],
  },
  {
    id: 'surge-zamboanga',
    name: 'Zamboanga Peninsula Coast',
    type: 'storm_surge',
    riskLevel: 'moderate',
    region: 'IX',
    province: 'Zamboanga del Sur',
    description: 'Coastal barangays and fishing communities at risk from southwest monsoon surges.',
    polygon: [[6.85, 122.00], [7.05, 122.15], [6.95, 122.25], [6.78, 122.12], [6.75, 122.02]],
  },

  // ── EARTHQUAKE ─────────────────────────────────────────────────────────────
  {
    id: 'eq-wvf-north',
    name: 'West Valley Fault — North Segment',
    type: 'earthquake',
    riskLevel: 'high',
    region: 'NCR',
    province: 'Metro Manila / Rizal',
    description: 'Active fault segment through Quezon City, Marikina, and Rodriguez. M7.2 scenario could cause severe ground rupture.',
    polygon: [[14.62, 121.02], [14.68, 121.08], [14.72, 121.12], [14.70, 121.18], [14.64, 121.14], [14.58, 121.06]],
  },
  {
    id: 'eq-wvf-south',
    name: 'West Valley Fault — South Segment',
    type: 'earthquake',
    riskLevel: 'high',
    region: 'IV-A',
    province: 'Laguna / Cavite',
    description: 'Fault trace through Taguig, Muntinlupa, San Pedro, and Calamba. High structural damage potential.',
    polygon: [[14.20, 121.00], [14.35, 121.06], [14.40, 121.12], [14.32, 121.18], [14.18, 121.10], [14.12, 121.02]],
  },
  {
    id: 'eq-cebu-fault',
    name: 'Central Cebu Fault Zone',
    type: 'earthquake',
    riskLevel: 'moderate',
    region: 'VII',
    province: 'Cebu',
    description: 'Active tectonic structures crossing Cebu Island. Moderate to strong shaking expected in urban centers.',
    polygon: [[10.20, 123.70], [10.40, 123.85], [10.38, 123.95], [10.22, 123.88], [10.15, 123.75]],
  },
  {
    id: 'eq-davao',
    name: 'Davao Tectonic Corridor',
    type: 'earthquake',
    riskLevel: 'moderate',
    region: 'XI',
    province: 'Davao del Sur',
    description: 'Complex fault system in eastern Mindanao. Periodic moderate earthquakes affect Davao metropolitan area.',
    polygon: [[6.90, 125.40], [7.20, 125.65], [7.10, 125.80], [6.85, 125.70], [6.80, 125.45]],
  },
  {
    id: 'eq-bohol',
    name: 'Bohol Seismic Zone',
    type: 'earthquake',
    riskLevel: 'moderate',
    region: 'VII',
    province: 'Bohol',
    description: '2013 M7.2 earthquake epicenter region. Limestone terrain amplifies ground motion.',
    polygon: [[9.70, 123.90], [9.90, 124.10], [9.85, 124.25], [9.65, 124.15], [9.60, 123.95]],
  },

  // ── VOLCANIC ───────────────────────────────────────────────────────────────
  {
    id: 'vol-mayon',
    name: 'Mayon Volcano 6-km Zone',
    type: 'volcanic',
    riskLevel: 'high',
    region: 'V',
    province: 'Albay',
    description: 'Permanent danger zone around Mayon Volcano. Pyroclastic flows, ashfall, and lava flows possible during eruptions.',
    polygon: [[13.18, 123.62], [13.30, 123.72], [13.28, 123.82], [13.15, 123.78], [13.10, 123.65]],
  },
  {
    id: 'vol-taal',
    name: 'Taal Volcano Island & Caldera',
    type: 'volcanic',
    riskLevel: 'high',
    region: 'IV-A',
    province: 'Batangas',
    description: 'Active caldera volcano in Taal Lake. Ashfall and base surge affect Batangas, Cavite, and Laguna.',
    polygon: [[13.95, 120.92], [14.10, 121.02], [14.05, 121.12], [13.90, 121.08], [13.88, 120.96]],
  },
  {
    id: 'vol-pinatubo',
    name: 'Pinatubo Lahar Deposits',
    type: 'volcanic',
    riskLevel: 'moderate',
    region: 'III',
    province: 'Pampanga / Tarlac',
    description: 'Lahar channels from 1991 eruption remain active. Remobilized deposits flood downstream communities during typhoons.',
    polygon: [[15.05, 120.30], [15.25, 120.55], [15.15, 120.70], [14.95, 120.60], [14.90, 120.35]],
  },
  {
    id: 'vol-kanlaon',
    name: 'Kanlaon Volcano Zone',
    type: 'volcanic',
    riskLevel: 'moderate',
    region: 'VI',
    province: 'Negros Occidental',
    description: 'Active stratovolcano in central Negros. Ashfall and phreatic eruptions affect surrounding provinces.',
    polygon: [[10.35, 123.08], [10.45, 123.18], [10.42, 123.28], [10.32, 123.22], [10.28, 123.12]],
  },

  // ── TSUNAMI ────────────────────────────────────────────────────────────────
  {
    id: 'tsu-eastern-samar',
    name: 'Eastern Samar Coast',
    type: 'tsunami',
    riskLevel: 'high',
    region: 'VIII',
    province: 'Eastern Samar',
    description: 'Philippine Trench proximity creates high tsunami potential. Low-lying coastal barangays most exposed.',
    polygon: [[11.30, 125.40], [11.60, 125.60], [11.50, 125.75], [11.20, 125.65], [11.10, 125.45]],
  },
  {
    id: 'tsu-surigao',
    name: 'Surigao Del Norte Coast',
    type: 'tsunami',
    riskLevel: 'high',
    region: 'XIII',
    province: 'Surigao del Norte',
    description: 'Philippine Trench subduction zone. 2023 M7.4 earthquake generated localized tsunami waves.',
    polygon: [[9.60, 125.40], [9.90, 125.60], [9.80, 125.75], [9.55, 125.65], [9.48, 125.45]],
  },
  {
    id: 'tsu-davao-oriental',
    name: 'Davao Oriental Coastline',
    type: 'tsunami',
    riskLevel: 'moderate',
    region: 'XI',
    province: 'Davao Oriental',
    description: 'Eastern Mindanao faces the Philippine Trench. Coastal communities require evacuation planning.',
    polygon: [[6.80, 126.00], [7.20, 126.30], [7.10, 126.50], [6.75, 126.35], [6.65, 126.10]],
  },
  {
    id: 'tsu-zambales',
    name: 'Zambales West Coast',
    type: 'tsunami',
    riskLevel: 'moderate',
    region: 'III',
    province: 'Zambales',
    description: 'Manila Trench offshore generates tsunami risk for western Luzon coastal municipalities.',
    polygon: [[14.80, 119.90], [15.20, 120.10], [15.10, 120.25], [14.75, 120.15], [14.70, 119.95]],
  },
];

/** Ray-casting point-in-polygon test */
export function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getZonesAtPoint(lat: number, lng: number): HazardZone[] {
  return HAZARD_ZONES.filter((z) => isPointInPolygon(lat, lng, z.polygon));
}

export function countEmployeesInZone(
  zone: HazardZone,
  employees: { gpsLat?: number; gpsLng?: number }[]
): number {
  return employees.filter((e) => {
    if (e.gpsLat == null || e.gpsLng == null) return false;
    return isPointInPolygon(e.gpsLat, e.gpsLng, zone.polygon);
  }).length;
}
