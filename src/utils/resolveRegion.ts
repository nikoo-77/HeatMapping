import { PHILIPPINE_REGIONS } from '../data_islands';

const PROVINCE_TO_REGION: Record<string, string> = {
  'metro manila': 'NCR',
  ncr: 'NCR',
  pampanga: 'III',
  bulacan: 'III',
  tarlac: 'III',
  'nueva ecija': 'III',
  laguna: 'IV-A',
  cavite: 'IV-A',
  batangas: 'IV-A',
  rizal: 'IV-A',
  quezon: 'IV-A',
  palawan: 'IV-B',
  albay: 'V',
  'camarines sur': 'V',
  iloilo: 'VI',
  'negros occidental': 'VI',
  cebu: 'VII',
  bohol: 'VII',
  'negros oriental': 'VII',
  leyte: 'VIII',
  samar: 'VIII',
  'zamboanga del sur': 'IX',
  'misamis oriental': 'X',
  bukidnon: 'X',
  'davao del sur': 'XI',
  'south cotabato': 'XII',
  'agusan del norte': 'XIII',
  benguet: 'CAR',
  pangasinan: 'I',
  cagayan: 'II',
  isabela: 'II',
};

const FACILITY_TO_REGION: Record<string, string> = {
  manila: 'NCR',
  cebu: 'VII',
  mandaue: 'VII',
  legazpi: 'V',
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchProvince(text: string): string | null {
  const p = normalize(text);
  if (!p) return null;
  for (const [key, code] of Object.entries(PROVINCE_TO_REGION)) {
    if (p.includes(key) || key.includes(p)) return code;
  }
  return null;
}

function matchByGps(gpsLat: number, gpsLng: number): string | null {
  for (const region of PHILIPPINE_REGIONS) {
    const [swLat, swLng, neLat, neLng] = region.bounds;
    if (gpsLat >= swLat && gpsLat <= neLat && gpsLng >= swLng && gpsLng <= neLng) {
      return region.code;
    }
  }
  return null;
}

export function resolveEmployeeRegion(options: {
  city?: string;
  province?: string;
  facility?: string;
  gpsLat?: number;
  gpsLng?: number;
}): string | undefined {
  const { city, province, facility, gpsLat, gpsLng } = options;

  if (facility) {
    const fromFacility = FACILITY_TO_REGION[normalize(facility)];
    if (fromFacility) return fromFacility;
  }
  if (province) {
    const fromProvince = matchProvince(province);
    if (fromProvince) return fromProvince;
  }
  if (city) {
    const fromCity = matchProvince(city);
    if (fromCity) return fromCity;
  }
  if (gpsLat != null && gpsLng != null) {
    return matchByGps(gpsLat, gpsLng) ?? undefined;
  }
  return undefined;
}

export function getRegionLabel(code: string): string {
  const region = PHILIPPINE_REGIONS.find((r) => r.code === code);
  return region ? `${region.name} (${code})` : code;
}
