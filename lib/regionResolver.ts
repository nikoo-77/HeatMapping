import { PHILIPPINE_REGIONS } from '../src/data_islands.js';

const PROVINCE_TO_REGION: Record<string, string> = {
  'metro manila': 'NCR',
  ncr: 'NCR',
  pampanga: 'III',
  bulacan: 'III',
  tarlac: 'III',
  'nueva ecija': 'III',
  aurora: 'III',
  zambales: 'III',
  bataan: 'III',
  laguna: 'IV-A',
  cavite: 'IV-A',
  batangas: 'IV-A',
  rizal: 'IV-A',
  quezon: 'IV-A',
  palawan: 'IV-B',
  marinduque: 'IV-B',
  romblon: 'IV-B',
  'occidental mindoro': 'IV-B',
  'oriental mindoro': 'IV-B',
  albay: 'V',
  'camarines norte': 'V',
  'camarines sur': 'V',
  sorsogon: 'V',
  catanduanes: 'V',
  masbate: 'V',
  iloilo: 'VI',
  'negros occidental': 'VI',
  capiz: 'VI',
  aklan: 'VI',
  antique: 'VI',
  guimaras: 'VI',
  cebu: 'VII',
  bohol: 'VII',
  'negros oriental': 'VII',
  siquijor: 'VII',
  // Region VII cities — explicit to avoid GPS bounds overlap
  'cebu city': 'VII',
  'lapu lapu': 'VII',
  'lapulapu': 'VII',
  'mandaue': 'VII',
  'talisay': 'VII',
  'tagbilaran': 'VII',
  'danao': 'VII',
  // Region VI cities
  'bacolod': 'VI',
  'roxas city': 'VI',
  'kalibo': 'VI',
  leyte: 'VIII',
  samar: 'VIII',
  'eastern samar': 'VIII',
  'northern samar': 'VIII',
  'southern leyte': 'VIII',
  biliran: 'VIII',
  'zamboanga del sur': 'IX',
  'zamboanga del norte': 'IX',
  'zamboanga sibugay': 'IX',
  'misamis oriental': 'X',
  'misamis occidental': 'X',
  bukidnon: 'X',
  camiguin: 'X',
  'lanao del norte': 'X',
  'davao del sur': 'XI',
  'davao del norte': 'XI',
  'davao de oro': 'XI',
  'davao oriental': 'XI',
  'davao occidental': 'XI',
  'south cotabato': 'XII',
  cotabato: 'XII',
  'sultan kudarat': 'XII',
  sarangani: 'XII',
  'agusan del norte': 'XIII',
  'agusan del sur': 'XIII',
  'surigao del norte': 'XIII',
  'surigao del sur': 'XIII',
  maguindanao: 'BARMM',
  'lanao del sur': 'BARMM',
  basilan: 'BARMM',
  sulu: 'BARMM',
  'tawi-tawi': 'BARMM',
  benguet: 'CAR',
  ifugao: 'CAR',
  'mountain province': 'CAR',
  kalinga: 'CAR',
  abra: 'CAR',
  apayao: 'CAR',
  'ilocos norte': 'I',
  'ilocos sur': 'I',
  'la union': 'I',
  pangasinan: 'I',
  cagayan: 'II',
  isabela: 'II',
  'nueva vizcaya': 'II',
  quirino: 'II',
  batanes: 'II',
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
