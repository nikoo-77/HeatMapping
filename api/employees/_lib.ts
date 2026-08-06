import { createClient } from '@supabase/supabase-js';
import { resolveEmployeeRegion, parseRegionLabel } from '../../lib/regionResolver.js';
import { randomBytes, scryptSync } from 'crypto';

type AccessRole = 'employee' | 'manager';
type IslandGroup = 'Luzon' | 'Visayas' | 'Mindanao';
type Carrier = 'Globe' | 'Smart' | 'DITO';
type Status = 'Green' | 'Yellow' | 'Red';

export interface Employee {
  id: string;
  name: string;
  role: string;
  accessRole: AccessRole;
  department: string;
  lat: number;
  lng: number;
  gpsLat?: number;
  gpsLng?: number;
  carrier: Carrier;
  normalSignalStrength: number;
  battery: number;
  status: Status;
  phone?: string;
  email: string;
  avatar: string;
  profilePicture?: string | null;
  gcashNumber?: string;
  gcashAccountName?: string;
  bankAccountDetails?: string;
  address: string;
  islandGroup?: IslandGroup;
  region?: string;
  managerId?: string;
  managerName?: string;
  team?: 'HR/CSR' | 'Manager';
  facility?: string;
}

interface SupabaseEmployeeRow {
  'Facility'?: string | null;
  'Employee ID': string;
  'Employee Name'?: string | null;
  'Designation'?: string | null;
  'Managers ID'?: string | null;
  'Managers Name'?: string | null;
  'Manager\'s Name'?: string | null;
  'DU'?: string | null;
  'PeopleManager/Individual Contributor'?: string | null;
  'COMPLETE ADDRESS'?: string | null;
  'PERMANENT- HOUSE NUMBER'?: string | null;
  'PERMANENT - STREET'?: string | null;
  'PERMANENT - BARANGAY'?: string | null;
  'PERMANENT - CITY/MUNICIPALITY'?: string | null;
  'PERMANENT - PROVINCE'?: string | null;
  'PERMANENT - REGION'?: string | null;
  'OFFICIAL EMAIL'?: string | null;
  'PERSONAL EMAIL'?: string | null;
  'MOBILE NUMBER'?: string | null;
  'GCASH NUMBER'?: string | null;
  'GCash Number'?: string | null;
  gcash_number?: string | null;
  'GCASH ACCOUNT NAME'?: string | null;
  'GCash Account Name'?: string | null;
  gcash_account_name?: string | null;
  'BANK ACCOUNT DETAILS'?: string | null;
  'Bank Account Details'?: string | null;
  bank_account_details?: string | null;
  role?: string | null;
}

interface DepartmentRow {
  department_id?: string | null;
  department_name?: string | null;
  du_id?: string | null;
  employee_id?: string | null;
}

interface EmpPersonalDetailsRow {
  employee_id?: string | null;
  employee_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email_address?: string | null;
}

interface EmployeeInfoRow {
  emp_info_id?: string | null;
  employee_id?: string | null;
  employee_role?: string | null;
  position?: string | null;
  facility?: string | null;
  is_manager?: boolean | null;
  department_id?: string | null;
}

interface ContactRow {
  contact_id?: string | null;
  employee_id?: string | null;
  contact_number?: string | null;
}

interface AddressRow {
  address_id?: string | null;
  employee_id?: string | null;
  complete_address?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  is_permanent?: boolean | null;
}

let supabaseClient: ReturnType<typeof createClient> | null = null;
let cache: { data: Employee[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in environment variables.');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseSecretKey);
  }

  return supabaseClient;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Makati City': { lat: 14.5547, lng: 121.0244 },
  'Taguig City': { lat: 14.5176, lng: 121.0509 },
  'Quezon City': { lat: 14.6760, lng: 121.0437 },
  'Muntinlupa City': { lat: 14.4200, lng: 121.0451 },
  'Angeles City': { lat: 15.1854, lng: 120.5614 },
  'Sta. Rosa': { lat: 14.2776, lng: 121.1114 },
  'Calamba City': { lat: 14.2114, lng: 121.1648 },
  'Cebu City': { lat: 10.3157, lng: 123.8854 },
  'Lapu-Lapu City': { lat: 10.3156, lng: 123.9784 },
  'Mandaue City': { lat: 10.3446, lng: 123.9392 },
  'Iloilo City': { lat: 10.6967, lng: 122.5644 },
  'Bacolod City': { lat: 10.6768, lng: 122.9509 },
  'Tacloban City': { lat: 11.2543, lng: 125.0000 },
  'Talisay City': { lat: 10.2592, lng: 123.8393 },
  'Davao City': { lat: 7.0708, lng: 125.6087 },
  'Cagayan de Oro': { lat: 8.4542, lng: 124.6319 },
  'Zamboanga City': { lat: 6.9214, lng: 122.0790 },
  'General Santos City': { lat: 6.1128, lng: 125.1717 },
  'Iligan City': { lat: 8.2281, lng: 124.2452 },
  'Butuan City': { lat: 8.9480, lng: 125.5436 },
};

const PROVINCE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Metro Manila': { lat: 14.5995, lng: 120.9842 },
  'NCR': { lat: 14.5995, lng: 120.9842 },
  'Pampanga': { lat: 15.1854, lng: 120.5614 },
  'Laguna': { lat: 14.2114, lng: 121.1648 },
  'Bulacan': { lat: 14.9023, lng: 120.8817 },
  'Cebu': { lat: 10.3157, lng: 123.8854 },
  'Iloilo': { lat: 10.6967, lng: 122.5644 },
  'Negros Occidental': { lat: 10.6768, lng: 122.9509 },
  'Leyte': { lat: 11.2543, lng: 125.0000 },
  'Davao del Sur': { lat: 7.0708, lng: 125.6087 },
  'Misamis Oriental': { lat: 8.4542, lng: 124.6319 },
  'Zamboanga del Sur': { lat: 6.9214, lng: 122.0790 },
  'South Cotabato': { lat: 6.1128, lng: 125.1717 },
  'Lanao del Norte': { lat: 8.2281, lng: 124.2452 },
  'Agusan del Norte': { lat: 8.9480, lng: 125.5436 },
};

function getGpsForCity(city: string, province: string): { lat: number; lng: number } | null {
  const lowerCity = city.trim().toLowerCase();
  const lowerProvince = province.trim().toLowerCase();
  if (!lowerCity && !lowerProvince) return null;

  if (lowerCity) {
    for (const [key, coords] of Object.entries(CITY_COORDS)) {
      const k = key.toLowerCase();
      if (lowerCity.includes(k) || k.includes(lowerCity)) {
        return coords;
      }
    }
  }

  if (province && PROVINCE_COORDS[province]) return PROVINCE_COORDS[province];

  if (lowerProvince) {
    for (const [key, coords] of Object.entries(PROVINCE_COORDS)) {
      const k = key.toLowerCase();
      if (lowerProvince.includes(k) || k.includes(lowerProvince)) {
        return coords;
      }
    }
  }

  // Do NOT default to NCR — unknown cities must not inflate Metro Manila counts.
  return null;
}

function getIslandGroup(city: string, province: string): IslandGroup {
  const p = province.toLowerCase();
  const c = city.toLowerCase();

  if (p.includes('ncr') || p.includes('national capital') || p.includes('metro manila')) return 'Luzon';
  if (p.includes('region x') || p.includes('region xi') || p.includes('region xii') || p.includes('region xiii') || p.includes('bangsamoro') || p.includes('caraga')) return 'Mindanao';

  const mindanaoProvinces = [
    'davao', 'misamis', 'zamboanga', 'cotabato', 'sultan kudarat', 'maguindanao',
    'lanao', 'agusan', 'surigao', 'camiguin', 'bukidnon', 'north cotabato',
    'sarangani', 'south cotabato', 'compostela',
  ];
  if (mindanaoProvinces.some((mp) => p.includes(mp) || c.includes(mp))) return 'Mindanao';

  const luzonProvinces = [
    'metro manila', 'pampanga', 'laguna', 'bulacan', 'rizal', 'cavite', 'batangas',
    'camarines norte', 'camarines sur', 'albay', 'sorsogon', 'masbate', 'catanduanes',
    'tarlac', 'nueva ecija', 'pangasinan', 'la union', 'ilocos', 'abra', 'benguet',
    'ifugao', 'kalinga', 'apayao', 'mountain province', 'quezon', 'aurora',
  ];
  if (luzonProvinces.some((lp) => p.includes(lp) || c.includes(lp))) return 'Luzon';

  return 'Visayas';
}

async function queryTableRows<T>(tableName: string): Promise<T[]> {
  const supabase = getSupabaseClient();
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase query failed for ${tableName}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function queryTableRowsIfPresent<T>(tableName: string): Promise<T[]> {
  try {
    return await queryTableRows<T>(tableName);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes('does not exist') || message.includes('42p01')) {
      return [];
    }
    throw error;
  }
}

function composeFullName(row: EmpPersonalDetailsRow): string {
  const explicitName = String(row.employee_name ?? '').trim();
  if (explicitName) return explicitName;

  const parts = [row.first_name, row.middle_name, row.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(' ');
}

function pickText(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string') {
      const text = value.trim();
      if (text) return text;
    }
  }
  return undefined;
}

async function queryAllRowsFromNormalizedTables(): Promise<SupabaseEmployeeRow[]> {
  const [personalRows, infoRows, contactRows, addressRows, departmentRows] = await Promise.all([
    queryTableRowsIfPresent<EmpPersonalDetailsRow>('emp_personal_details'),
    queryTableRowsIfPresent<EmployeeInfoRow>('employee_info'),
    queryTableRowsIfPresent<ContactRow>('contact'),
    queryTableRowsIfPresent<AddressRow>('address'),
    queryTableRowsIfPresent<DepartmentRow>('department'),
  ]);

  if (personalRows.length === 0) {
    return [];
  }

  const departmentById = new Map<string, DepartmentRow>();
  departmentRows.forEach((row) => {
    const id = String(row.department_id ?? row.du_id ?? '').trim();
    if (id) departmentById.set(id, row);
  });

  const infoByEmployeeId = new Map<string, EmployeeInfoRow>();
  infoRows.forEach((row) => {
    const id = String(row.employee_id ?? '').trim();
    if (id) infoByEmployeeId.set(id, row);
  });

  const contactByEmployeeId = new Map<string, ContactRow>();
  contactRows.forEach((row) => {
    const id = String(row.employee_id ?? '').trim();
    if (id) contactByEmployeeId.set(id, row);
  });

  const addressByEmployeeId = new Map<string, AddressRow>();
  addressRows.forEach((row) => {
    const id = String(row.employee_id ?? '').trim();
    if (id) addressByEmployeeId.set(id, row);
  });

  return personalRows.map((personal) => {
    const empId = String(personal.employee_id ?? '').trim();
    const info = infoByEmployeeId.get(empId);
    const address = addressByEmployeeId.get(empId);
    const contact = contactByEmployeeId.get(empId);
    const department = info?.department_id ? departmentById.get(String(info.department_id).trim()) : undefined;

    return {
      'Facility': info?.facility ?? '',
      'Employee ID': empId,
      'Employee Name': composeFullName(personal),
      'Designation': (info?.position ?? info?.employee_role ?? 'Employee') as string,
      'Managers ID': undefined,
      'Managers Name': undefined,
      'Manager\'s Name': undefined,
      'DU': (department?.department_name ?? department?.du_id ?? 'Unknown') as string,
      'PeopleManager/Individual Contributor': info?.is_manager ? 'Manager' : 'Individual Contributor',
      'COMPLETE ADDRESS': address?.complete_address ?? '',
      'PERMANENT- HOUSE NUMBER': undefined,
      'PERMANENT - STREET': undefined,
      'PERMANENT - BARANGAY': undefined,
      'PERMANENT - CITY/MUNICIPALITY': address?.city_municipality ?? '',
      'PERMANENT - PROVINCE': address?.province ?? '',
      'PERMANENT - REGION': undefined,
      'OFFICIAL EMAIL': personal.email_address ?? '',
      'PERSONAL EMAIL': '',
      'MOBILE NUMBER': contact?.contact_number ?? '',
      role: info?.employee_role ?? info?.position ?? '',
    } satisfies SupabaseEmployeeRow;
  });
}

async function queryAllRows(): Promise<SupabaseEmployeeRow[]> {
  const supabase = getSupabaseClient();
  const allRows: SupabaseEmployeeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('Employee Details')
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`Supabase query failed: ${error.message}`);
      if (!data || data.length === 0) break;

      allRows.push(...(data as SupabaseEmployeeRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
  } catch {
    const normalizedRows = await queryAllRowsFromNormalizedTables();
    if (normalizedRows.length > 0) return normalizedRows;
    throw new Error('No employee rows found in Supabase.');
  }

  if (allRows.length === 0) {
    const normalizedRows = await queryAllRowsFromNormalizedTables();
    if (normalizedRows.length > 0) return normalizedRows;
  }

  return allRows;
}

function mapRowsToEmployees(rows: SupabaseEmployeeRow[]): Employee[] {
  const employees: Employee[] = [];

  for (const row of rows) {
    const rowRecord = row as Record<string, unknown>;
    const empId = row['Employee ID'];
    if (!empId) continue;

    const fullName = (row['Employee Name'] ?? '').trim();
    const city = (row['PERMANENT - CITY/MUNICIPALITY'] ?? '').trim();
    const province = (row['PERMANENT - PROVINCE'] ?? '').trim();
    const completeAddress = (row['COMPLETE ADDRESS'] ?? '').trim();
    const houseNo = (row['PERMANENT- HOUSE NUMBER'] ?? '').trim();
    const street = (row['PERMANENT - STREET'] ?? '').trim();
    const barangay = (row['PERMANENT - BARANGAY'] ?? '').trim();
    const regionLabel = (row['PERMANENT - REGION'] ?? '').trim();

    const hasLocationData = !!(city || province || regionLabel || completeAddress || houseNo || street || barangay);
    const addressParts = [houseNo, street, barangay, city, province].filter(Boolean);
    const address = hasLocationData ? (completeAddress || addressParts.join(', ') || `${city}, ${province}`) : 'Needs Update';

    let gpsLat: number | undefined;
    let gpsLng: number | undefined;
    let gridY = 0;
    let gridX = 0;
    let knownCityCoords: { lat: number; lng: number } | null = null;

    if (hasLocationData) {
      knownCityCoords = getGpsForCity(city, province);
      const seed = hashString(empId);
      const scatter = 0.015;
      // Unknown city/province: pin near Cebu (Region VII HQ) for map display only —
      // region field is resolved separately and must not inherit NCR from a GPS default.
      const base = knownCityCoords ?? { lat: 10.3157, lng: 123.8854 };
      gpsLat = base.lat + (seededRandom(seed) - 0.5) * scatter;
      gpsLng = base.lng + (seededRandom(seed + 1) - 0.5) * scatter;

      const LAT_MIN = 4.5;
      const LAT_MAX = 21.5;
      const LNG_MIN = 116.0;
      const LNG_MAX = 127.0;
      gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
      gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
    }

    const islandGroup = hasLocationData ? getIslandGroup(city, province || regionLabel) : undefined;

    let region: string | undefined;
    if (!hasLocationData) {
      region = 'NEEDS_UPDATE';
    } else {
      const regionFromDb = parseRegionLabel(regionLabel);
      region =
        regionFromDb ??
        resolveEmployeeRegion({
          city,
          province,
          facility: row['Facility'] ?? undefined,
          address: address !== 'Needs Update' ? address : completeAddress || undefined,
          gpsLat: knownCityCoords ? gpsLat : undefined,
          gpsLng: knownCityCoords ? gpsLng : undefined,
        }) ??
        'NEEDS_UPDATE';
    }

    const nameParts = fullName.split(' ').filter(Boolean);
    const avatar = nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
      : fullName.slice(0, 2).toUpperCase();

    const rawPhone = (row['MOBILE NUMBER'] ?? '').trim();
    const cleanPhone = rawPhone && !rawPhone.toUpperCase().includes('FOR UPDATE') ? rawPhone : undefined;
    const gcashNumber = pickText(rowRecord, ['GCASH NUMBER', 'GCash Number', 'gcash_number']);
    const gcashAccountName = pickText(rowRecord, ['GCASH ACCOUNT NAME', 'GCash Account Name', 'gcash_account_name']);
    const bankAccountDetails = pickText(rowRecord, ['BANK ACCOUNT DETAILS', 'Bank Account Details', 'bank_account_details']);

    const officialEmail = (row['OFFICIAL EMAIL'] ?? '').trim();
    const personalEmail = (row['PERSONAL EMAIL'] ?? '').trim();
    const email = officialEmail || personalEmail || '';

    const designation = (row['Designation'] ?? 'Employee').trim();
    const department = (row['DU'] ?? 'Unknown').trim() || 'Unknown';

    const managersId = (row['Managers ID'] ?? '').trim();
    const managerName = ((row['Manager\'s Name'] ?? row['Managers Name']) ?? '').trim();
    const isManager = row['PeopleManager/Individual Contributor']
      ? row['PeopleManager/Individual Contributor']!.toLowerCase().includes('manager')
      : false;

    const rawRole = (row['role'] ?? '').trim().toLowerCase();
    const accessRole: AccessRole = rawRole === 'manager' || isManager ? 'manager' : 'employee';

    const empSeed = hashString(empId);

    employees.push({
      id: String(empId),
      name: fullName || 'Unknown Employee',
      role: designation,
      accessRole,
      department,
      lat: parseFloat(Math.max(0, Math.min(100, gridY)).toFixed(2)),
      lng: parseFloat(Math.max(0, Math.min(100, gridX)).toFixed(2)),
      gpsLat: gpsLat != null ? parseFloat(gpsLat.toFixed(5)) : undefined,
      gpsLng: gpsLng != null ? parseFloat(gpsLng.toFixed(5)) : undefined,
      carrier: (['Globe', 'Smart', 'DITO'] as const)[Math.floor(seededRandom(empSeed + 2) * 3)],
      normalSignalStrength: -120 + Math.round(seededRandom(empSeed + 3) * 60),
      battery: Math.round(20 + seededRandom(empSeed + 4) * 80),
      status: seededRandom(empSeed + 5) > 0.92 ? 'Yellow' : 'Green',
      phone: cleanPhone,
      gcashNumber,
      gcashAccountName,
      bankAccountDetails,
      email,
      avatar,
      address,
      islandGroup,
      region,
      managerId: managersId || undefined,
      managerName: managerName || undefined,
      team: isManager ? 'Manager' : 'HR/CSR',
      facility: row['Facility'] ?? undefined,
    });
  }

  return employees;
}

function gpsToGridCoords(gpsLat: number, gpsLng: number): { lat: number; lng: number } {
  const LAT_MIN = 4.5;
  const LAT_MAX = 21.5;
  const LNG_MIN = 116.0;
  const LNG_MAX = 127.0;
  const gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
  const gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
  return {
    lat: parseFloat(Math.max(0, Math.min(100, gridY)).toFixed(2)),
    lng: parseFloat(Math.max(0, Math.min(100, gridX)).toFixed(2)),
  };
}

type AccountExtrasRow = {
  employee_id?: string;
  username?: string | null;
  profile_picture?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function normalizeLookupKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

async function loadAccountExtras(): Promise<AccountExtrasRow[]> {
  const supabase = getSupabaseClient();
  const rows: AccountExtrasRow[] = [];
  let from = 0;
  const pageSize = 1000;
  let selectCols = 'employee_id, username, profile_picture, latitude, longitude';
  let triedLegacy = false;

  while (true) {
    const { data, error } = await supabase
      .from('accounts')
      .select(selectCols)
      .range(from, from + pageSize - 1);

    if (error) {
      if (!triedLegacy && /latitude|longitude/i.test(error.message)) {
        selectCols = 'employee_id, username, profile_picture';
        triedLegacy = true;
        from = 0;
        rows.length = 0;
        continue;
      }
      throw new Error(error.message);
    }

    if (!data?.length) break;
    rows.push(...(data as AccountExtrasRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/** Merge accounts.profile_picture + confirmed GPS + payment fields onto employee records. */
async function attachProfilePictures(employees: Employee[]): Promise<Employee[]> {
  try {
    const supabase = getSupabaseClient();
    const data = await loadAccountExtras();

    const paymentById = new Map<string, { gcashNumber?: string; gcashAccountName?: string; bankAccountDetails?: string }>();
    try {
      let payFrom = 0;
      const pageSize = 1000;
      let paymentSelectCols = 'employee_id, username, gcash_number, gcash_account_name, bank_account_details';
      let triedLegacyPaymentCols = false;
      while (true) {
        const paymentResponse = await supabase
          .from('accounts')
          .select(paymentSelectCols)
          .range(payFrom, payFrom + pageSize - 1);
        if (paymentResponse.error) {
          if (!triedLegacyPaymentCols && /gcash_account_name/i.test(paymentResponse.error.message)) {
            paymentSelectCols = 'employee_id, username, gcash_number, bank_account_details';
            triedLegacyPaymentCols = true;
            payFrom = 0;
            paymentById.clear();
            continue;
          }
          break;
        }
        const paymentRows = (paymentResponse.data ?? []) as Array<{
          employee_id?: string;
          username?: string | null;
          gcash_number?: string | null;
          gcash_account_name?: string | null;
          bank_account_details?: string | null;
        }>;
        if (!paymentRows.length) break;

        for (const row of paymentRows) {
          const id = String(row.employee_id ?? '').trim();
          const username = normalizeLookupKey(row.username);
          const gcashNumber = typeof row.gcash_number === 'string' ? row.gcash_number.trim() : '';
          const gcashAccountName = typeof row.gcash_account_name === 'string' ? row.gcash_account_name.trim() : '';
          const bankAccountDetails = typeof row.bank_account_details === 'string' ? row.bank_account_details.trim() : '';
          if (!gcashNumber && !gcashAccountName && !bankAccountDetails) continue;
          const payment = {
            gcashNumber: gcashNumber || undefined,
            gcashAccountName: gcashAccountName || undefined,
            bankAccountDetails: bankAccountDetails || undefined,
          };
          if (id) paymentById.set(normalizeLookupKey(id), payment);
          if (username) paymentById.set(username, payment);
        }
        if (paymentRows.length < pageSize) break;
        payFrom += pageSize;
      }
    } catch {
      // Optional columns may not exist yet; keep existing values from employee rows.
    }

    const picById = new Map<string, string>();
    const gpsByKey = new Map<string, { lat: number; lng: number }>();
    for (const row of data) {
      const id = String(row.employee_id ?? '').trim();
      const username = normalizeLookupKey(row.username);
      const url = typeof row.profile_picture === 'string' ? row.profile_picture.trim() : '';
      if (url) {
        if (id) picById.set(normalizeLookupKey(id), url);
        if (username) picById.set(username, url);
      }
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        const gps = { lat, lng };
        if (id) gpsByKey.set(normalizeLookupKey(id), gps);
        if (username) gpsByKey.set(username, gps);
      }
    }

    return employees.map((emp) => {
      const empIdKey = normalizeLookupKey(emp.id);
      const emailKey = normalizeLookupKey(emp.email);
      const payment = paymentById.get(empIdKey) ?? (emailKey ? paymentById.get(emailKey) : undefined);
      const gps = gpsByKey.get(empIdKey) ?? (emailKey ? gpsByKey.get(emailKey) : undefined);
      const base: Employee = {
        ...emp,
        profilePicture: picById.get(empIdKey) ?? (emailKey ? picById.get(emailKey) : undefined) ?? emp.profilePicture ?? null,
        gcashNumber: payment?.gcashNumber ?? emp.gcashNumber,
        gcashAccountName: payment?.gcashAccountName ?? emp.gcashAccountName,
        bankAccountDetails: payment?.bankAccountDetails ?? emp.bankAccountDetails,
      };
      if (!gps) {
        // No confirmed account pin — keep address/city scatter coordinates.
        return base;
      }
      const grid = gpsToGridCoords(gps.lat, gps.lng);
      return {
        ...base,
        gpsLat: parseFloat(gps.lat.toFixed(6)),
        gpsLng: parseFloat(gps.lng.toFixed(6)),
        lat: grid.lat,
        lng: grid.lng,
      };
    });
  } catch {
    return employees.map((emp) => ({ ...emp, profilePicture: emp.profilePicture ?? null }));
  }
}

export async function getEmployees(forceRefresh = false): Promise<Employee[]> {
  if (!forceRefresh && cache && Date.now() < cache.expiresAt) {
    // Always re-merge accounts GPS/photos so newly saved pins appear immediately.
    return attachProfilePictures(cache.data);
  }

  const rows = await queryAllRows();
  // Cache RAW mapped rows (city scatter only). Confirmed GPS is applied on every read.
  const mapped = mapRowsToEmployees(rows);
  cache = { data: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
  return attachProfilePictures(mapped);
}

export function clearEmployeesCache() {
  cache = null;
}

export function readManagerFromRequest(req: any): { name: string; id?: string } {
  const name =
    (req.query?.manager as string) ||
    (req.headers?.['x-manager-name'] as string) ||
    '';
  const id =
    (req.query?.managerId as string) ||
    (req.headers?.['x-manager-id'] as string) ||
    undefined;

  return { name: name.trim(), id };
}

export function resolveManagerId(employees: Employee[], managerName: string, managerId?: string): string | undefined {
  if (managerId) return managerId;
  const found = employees.find((e) => e.name.toLowerCase() === managerName.trim().toLowerCase());
  return found?.id;
}

export function parseRequestBody(req: any): Record<string, any> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return (req.body ?? {}) as Record<string, any>;
}

export async function updateEmployeeProfile(empId: string, payload: {
  contactNumber?: string;
  address?: string;
  gcashNumber?: string;
  gcashAccountName?: string;
  bankAccountDetails?: string;
}) {
  const supabase = getSupabaseClient();
  const dbUpdate: Record<string, string> = {};

  if (typeof payload.contactNumber === 'string') dbUpdate['MOBILE NUMBER'] = payload.contactNumber.trim();
  if (typeof payload.address === 'string') dbUpdate['COMPLETE ADDRESS'] = payload.address.trim();
  const hasEmployeeDetailsUpdate = Object.keys(dbUpdate).length > 0;

  if (hasEmployeeDetailsUpdate) {
    const { error } = await (supabase as any)
      .from('Employee Details')
      .update(dbUpdate)
      .eq('Employee ID', empId);

    if (error) throw new Error(`Supabase update failed: ${error.message}`);
  }

  // Payment metadata is stored in public.accounts and may have optional columns by environment.
  const accountPatchBase: Record<string, string> = {};
  if (typeof payload.gcashNumber === 'string') accountPatchBase.gcash_number = payload.gcashNumber.trim();
  if (typeof payload.gcashAccountName === 'string') accountPatchBase.gcash_account_name = payload.gcashAccountName.trim();
  if (typeof payload.bankAccountDetails === 'string') accountPatchBase.bank_account_details = payload.bankAccountDetails.trim();

  const hasAccountPatch = Object.keys(accountPatchBase).length > 0;
  if (hasAccountPatch) {
    const accountAttempts: Array<Record<string, unknown>> = [
      { ...accountPatchBase, updated_at: new Date().toISOString() },
      { ...accountPatchBase },
      {
        ...(typeof payload.gcashNumber === 'string' ? { gcash_number: payload.gcashNumber.trim() } : {}),
        ...(typeof payload.bankAccountDetails === 'string' ? { bank_account_details: payload.bankAccountDetails.trim() } : {}),
      },
    ];

    for (const patch of accountAttempts) {
      if (Object.keys(patch).length === 0) continue;
      const result = await (supabase as any)
        .from('accounts')
        .update(patch)
        .eq('employee_id', empId)
        .select('employee_id')
        .maybeSingle();
      if (!result.error) break;
      if (!/gcash_account_name|updated_at|column/i.test(result.error.message)) break;
    }
  }

  await getEmployees(true);
  return { updated: hasEmployeeDetailsUpdate || hasAccountPatch };
}

const DEFAULT_EMPLOYEE_PASSWORD = '123456';

type AdminEmployeePayload = {
  employeeId?: string;
  name?: string;
  email?: string;
  department?: string;
  address?: string;
  phone?: string;
  managersId?: string;
  managersName?: string;
  designation?: string;
};

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function buildEmployeeDetailsRow(payload: {
  employeeId: string;
  name: string;
  email: string;
  department?: string;
  address?: string;
  phone?: string;
  managersId?: string;
  managersName?: string;
  designation?: string;
}): Record<string, string> {
  const managersId = (payload.managersId ?? '').trim();
  const managersName = (payload.managersName ?? '').trim();
  return {
    'Employee ID': payload.employeeId.trim(),
    'Employee Name': payload.name.trim(),
    'OFFICIAL EMAIL': payload.email.trim().toLowerCase(),
    'DU': (payload.department ?? '').trim() || 'Unknown',
    'COMPLETE ADDRESS': (payload.address ?? '').trim(),
    'MOBILE NUMBER': (payload.phone ?? '').trim(),
    'Managers ID': managersId,
    'Managers Name': managersName,
    'Designation': (payload.designation ?? '').trim() || 'Employee',
    'PeopleManager/Individual Contributor': 'Individual Contributor',
  };
}

async function upsertEmployeeAccount(input: {
  employeeId: string;
  username: string;
  displayName: string;
  accessRole: 'manager' | 'official';
  overwritePassword: boolean;
}) {
  const supabase = getSupabaseClient();
  const username = input.username.trim().toLowerCase();
  const employeeId = input.employeeId.trim();

  const { data: existing, error: findError } = await supabase
    .from('accounts')
    .select('employee_id')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing?.employee_id) {
    const patch: Record<string, unknown> = {
      username,
      access_role: input.accessRole,
      display_name: input.displayName,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (input.overwritePassword) patch.password_hash = hashPassword(DEFAULT_EMPLOYEE_PASSWORD);
    const { error } = await supabase.from('accounts').update(patch).eq('employee_id', employeeId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('accounts').insert({
    employee_id: employeeId,
    username,
    password_hash: hashPassword(DEFAULT_EMPLOYEE_PASSWORD),
    access_role: input.accessRole,
    display_name: input.displayName,
    is_active: true,
  });
  if (error) throw new Error(error.message);
}

export async function createEmployee(payload: AdminEmployeePayload) {
  const employeeId = String(payload.employeeId ?? '').trim();
  const name = String(payload.name ?? '').trim();
  const email = String(payload.email ?? '').trim().toLowerCase();
  const department = String(payload.department ?? '').trim();
  const address = String(payload.address ?? '').trim();
  const phone = String(payload.phone ?? '').trim();
  const managersId = String(payload.managersId ?? '').trim();
  const managersName = String(payload.managersName ?? '').trim();
  const designation = String(payload.designation ?? 'Employee').trim() || 'Employee';

  if (!employeeId || !name || !email) {
    const err: any = new Error('Employee ID, name, and email are required.');
    err.status = 400;
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err: any = new Error('A valid login email is required.');
    err.status = 400;
    throw err;
  }

  const existing = await getEmployees();
  if (existing.some((e) => e.id === employeeId)) {
    const err: any = new Error(`Employee ID ${employeeId} already exists.`);
    err.status = 409;
    throw err;
  }
  if (existing.some((e) => e.email?.trim().toLowerCase() === email)) {
    const err: any = new Error(`Email ${email} is already used by another employee.`);
    err.status = 409;
    throw err;
  }

  const row = buildEmployeeDetailsRow({
    employeeId, name, email, department, address, phone, managersId, managersName, designation,
  });
  const supabase = getSupabaseClient();
  const { data: inserted, error } = await supabase
    .from('Employee Details')
    .insert(row)
    .select('*')
    .limit(1);

  if (error || !inserted?.length) {
    const err: any = new Error('Failed to create employee.');
    err.status = 500;
    err.detail = error?.message;
    throw err;
  }

  await upsertEmployeeAccount({
    employeeId,
    username: email,
    displayName: name,
    accessRole: 'official',
    overwritePassword: true,
  });

  const employees = await getEmployees(true);
  const employee = employees.find((e) => e.id === employeeId) ?? mapRowsToEmployees(inserted as SupabaseEmployeeRow[])[0];

  return {
    message: 'Employee created. Login account ready with default password 123456.',
    employee,
    defaultPassword: DEFAULT_EMPLOYEE_PASSWORD,
    mustChangePassword: true,
  };
}

export async function updateEmployeeAdmin(empId: string, payload: AdminEmployeePayload) {
  const employees = await getEmployees();
  const existing = employees.find((e) => e.id === empId);
  if (!existing) {
    const err: any = new Error('Employee not found.');
    err.status = 404;
    throw err;
  }

  const name = payload.name !== undefined ? String(payload.name).trim() : existing.name;
  const email = payload.email !== undefined
    ? String(payload.email).trim().toLowerCase()
    : (existing.email ?? '').trim().toLowerCase();
  const department = payload.department !== undefined ? String(payload.department).trim() : existing.department;
  const address = payload.address !== undefined ? String(payload.address).trim() : existing.address;
  const phone = payload.phone !== undefined ? String(payload.phone).trim() : (existing.phone ?? '');
  const managersId = payload.managersId !== undefined ? String(payload.managersId).trim() : (existing.managerId ?? '');
  const managersName = payload.managersName !== undefined ? String(payload.managersName).trim() : (existing.managerName ?? '');
  const designation = payload.designation !== undefined
    ? String(payload.designation).trim() || 'Employee'
    : existing.role;

  if (!name || !email) {
    const err: any = new Error('Name and email are required.');
    err.status = 400;
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err: any = new Error('A valid login email is required.');
    err.status = 400;
    throw err;
  }
  if (employees.some((e) => e.id !== empId && e.email?.trim().toLowerCase() === email)) {
    const err: any = new Error(`Email ${email} is already used by another employee.`);
    err.status = 409;
    throw err;
  }

  const dbUpdate = buildEmployeeDetailsRow({
    employeeId: empId, name, email, department, address, phone, managersId, managersName, designation,
  });
  delete (dbUpdate as any)['Employee ID'];

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('Employee Details')
    .update(dbUpdate)
    .eq('Employee ID', empId);
  if (error) {
    const err: any = new Error('Failed to update employee.');
    err.status = 500;
    err.detail = error.message;
    throw err;
  }

  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('employee_id')
    .eq('employee_id', empId)
    .maybeSingle();

  await upsertEmployeeAccount({
    employeeId: empId,
    username: email,
    displayName: name,
    accessRole: existing.accessRole === 'manager' ? 'manager' : 'official',
    overwritePassword: !existingAccount?.employee_id,
  });

  const refreshed = await getEmployees(true);
  const employee = refreshed.find((e) => e.id === empId);

  return {
    message: existingAccount?.employee_id
      ? 'Employee updated.'
      : 'Employee updated and login account created with default password 123456.',
    employee,
    accountCreated: !existingAccount?.employee_id,
    defaultPassword: existingAccount?.employee_id ? undefined : DEFAULT_EMPLOYEE_PASSWORD,
  };
}

export function getHealth() {
  return {
    ok: true,
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasSupabaseSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
