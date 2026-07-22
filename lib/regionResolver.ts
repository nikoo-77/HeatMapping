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
  // Longest key first so "cebu city" / "negros oriental" beat shorter overlaps
  const entries = Object.entries(PROVINCE_TO_REGION).sort((a, b) => b[0].length - a[0].length);
  for (const [key, code] of entries) {
    if (p.includes(key)) return code;
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

const ARABIC_TO_REGION: Record<string, string> = {
  '1': 'I',
  '2': 'II',
  '3': 'III',
  '4': 'IV-A',
  '4A': 'IV-A',
  '4-A': 'IV-A',
  '4B': 'IV-B',
  '4-B': 'IV-B',
  '5': 'V',
  '6': 'VI',
  '7': 'VII',
  '8': 'VIII',
  '9': 'IX',
  '10': 'X',
  '11': 'XI',
  '12': 'XII',
  '13': 'XIII',
};

const ROMAN_TO_REGION: Record<string, string> = {
  I: 'I',
  II: 'II',
  III: 'III',
  'IV-A': 'IV-A',
  IVA: 'IV-A',
  'IV-B': 'IV-B',
  IVB: 'IV-B',
  IV: 'IV-A',
  V: 'V',
  VI: 'VI',
  VII: 'VII',
  VIII: 'VIII',
  IX: 'IX',
  X: 'X',
  XI: 'XI',
  XII: 'XII',
  XIII: 'XIII',
};

const NAME_TO_REGION: Record<string, string> = {
  NCR: 'NCR',
  'NATIONAL CAPITAL REGION': 'NCR',
  'METRO MANILA': 'NCR',
  CAR: 'CAR',
  CORDILLERA: 'CAR',
  ILOCOS: 'I',
  'CAGAYAN VALLEY': 'II',
  'CENTRAL LUZON': 'III',
  CALABARZON: 'IV-A',
  CALBARZON: 'IV-A', // common DB typo
  MIMAROPA: 'IV-B',
  BICOL: 'V',
  'WESTERN VISAYAS': 'VI',
  'CENTRAL VISAYAS': 'VII',
  'EASTERN VISAYAS': 'VIII',
  ZAMBOANGA: 'IX',
  'NORTHERN MINDANAO': 'X',
  DAVAO: 'XI',
  SOCCSKSARGEN: 'XII',
  CARAGA: 'XIII',
  BARMM: 'BARMM',
  BANGSAMORO: 'BARMM',
  ARMM: 'BARMM',
};

/**
 * Parse "PERMANENT - REGION" text into a canonical region code.
 * Accepts arabic numerals (7, Region 7) and roman numerals (VII, Region VII).
 * Avoids naive substring matching — "VII".includes("VI") / "REGION".includes("I") are traps.
 */
export function parseRegionLabel(label: string): string | null {
  if (!label) return null;
  // Normalize dashes/punctuation (DB often uses en-dash: "Region VII – Central Visayas")
  const raw = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return null;

  // Exact known labels
  if (NAME_TO_REGION[raw]) return NAME_TO_REGION[raw];
  if (ROMAN_TO_REGION[raw]) return ROMAN_TO_REGION[raw];
  if (ARABIC_TO_REGION[raw]) return ARABIC_TO_REGION[raw];

  // "IV A" / "IV B" after punctuation strip (e.g. "Region IV A CALBARZON")
  if (/\bIV\s*A\b/.test(raw) || /\b4\s*A\b/.test(raw)) return 'IV-A';
  if (/\bIV\s*B\b/.test(raw) || /\b4\s*B\b/.test(raw)) return 'IV-B';

  // "Region 7", "Region VII", "Reg 7 Central Visayas"
  const regionToken = raw.match(
    /\b(?:REGION|REG)\s+(XIII|XII|XI|VIII|VII|VI|IV|IX|III|II|X|V|I|1[0-3]|[1-9])\b/
  );
  if (regionToken) {
    const token = regionToken[1];
    return ROMAN_TO_REGION[token] ?? ARABIC_TO_REGION[token] ?? null;
  }

  // Standalone roman / arabic token (longest first)
  const romanMatch = raw.match(/\b(XIII|XII|XI|VIII|VII|VI|IV|IX|III|II|X|V|I)\b/);
  if (romanMatch) return ROMAN_TO_REGION[romanMatch[1]] ?? null;

  const arabicMatch = raw.match(/\b(1[0-3]|[1-9])\b/);
  if (arabicMatch) return ARABIC_TO_REGION[arabicMatch[1]] ?? null;

  // Named regions contained in longer strings — longest first so
  // "CENTRAL VISAYAS" wins over "CAR" (which appears inside CENTRAL).
  const named = Object.entries(NAME_TO_REGION).sort((a, b) => b[0].length - a[0].length);
  for (const [name, code] of named) {
    if (name.length >= 3 && raw.includes(name)) return code;
  }

  return null;
}

export function resolveEmployeeRegion(options: {
  city?: string;
  province?: string;
  facility?: string;
  address?: string;
  gpsLat?: number;
  gpsLng?: number;
}): string | undefined {
  const { city, province, facility, address, gpsLat, gpsLng } = options;

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

  // Fall back to free-text address (many rows fill COMPLETE ADDRESS but leave city/province blank)
  if (address) {
    const fromAddress = matchProvince(address);
    if (fromAddress) return fromAddress;
  }

  if (gpsLat != null && gpsLng != null) {
    return matchByGps(gpsLat, gpsLng) ?? undefined;
  }

  return undefined;
}
