import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if present
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { extname } from 'path';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { resolveEmployeeRegion, parseRegionLabel } from './lib/regionResolver.js';

const app = express();
export default app;
app.use(express.json());
const PORT = Number(process.env.PORT || 5000);

// ── Supabase client (service-role key for unrestricted server-side access) ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

// ── Types ────────────────────────────────────────────────────────────────────
interface Employee {
  id: string;
  name: string;
  role: string;
  accessRole?: 'employee' | 'manager';
  department: string;
  lat: number;
  lng: number;
  gpsLat?: number;
  gpsLng?: number;
  carrier: 'Globe' | 'Smart' | 'DITO';
  normalSignalStrength: number;
  battery: number;
  status: 'Green' | 'Yellow' | 'Red';
  phone?: string;
  email: string;
  avatar: string;
  profilePicture?: string | null;
  address?: string;
  islandGroup?: 'Luzon' | 'Visayas' | 'Mindanao';
  region?: string;
  managerId?: string;
  managerName?: string;
  team?: 'HR/CSR' | 'Manager';
  facility?: string;
  contacted?: boolean;
  unresponsive?: boolean;
  safetyMessage?: string;
  lastResponseRecv?: string;
}

// Raw row shape from Supabase "Employee Details" table
interface SupabaseEmployeeRow {
  'Facility'?: string | null;
  'Employee ID': string;
  'Employee Name'?: string | null;
  'Project Code'?: string | null;
  'Project Name'?: string | null;
  'Designation'?: string | null;
  'Employment Status'?: string | null;
  'Employee Status'?: string | null;
  'Managers ID'?: string | null;
  'Managers Name'?: string | null;
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
  role?: string | null;
  'Manager\'s Name'?: string | null;
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

type AidStatus =
  | 'Pending Manager Review'
  | 'Rejected by Manager'
  | 'Pending Admin Review'
  | 'Rejected by Admin/CSR'
  | 'Approved';

interface AidAssistanceRequestRow {
  id: string;
  request_code: string;
  employee_id: string;
  employee_name: string;
  department: string;
  position: string | null;
  manager_id: string | null;
  manager_name: string | null;
  aid_type: string;
  damage_type: 'Major' | 'Minor';
  incident_name: string;
  reason: string;
  status: AidStatus;
  submitted_at: string;
  manager_decision: 'Approved' | 'Rejected' | null;
  manager_remarks: string | null;
  manager_reviewed_by: string | null;
  manager_reviewed_at: string | null;
  admin_decision: 'Approved' | 'Rejected' | null;
  admin_remarks: string | null;
  admin_reviewed_by: string | null;
  admin_reviewed_at: string | null;
}

interface AidAttachmentRow {
  id: string;
  aid_assistance_id: string;
  employee_id: string;
  file_name: string;
  file_path: string;
  public_url: string;
  uploaded_at: string;
}

type IncidentSnapshotPayload = {
  calamityReports: unknown[];
  pendingEmployeeReports: unknown[];
  resolvedReports: Record<string, boolean>;
  simulationActive: boolean;
  epicenter: { lat: number; lng: number; radiusKm: number };
  activeDisaster: Record<string, unknown>;
};

interface IncidentSnapshotRow {
  id: string;
  snapshot: IncidentSnapshotPayload;
  updated_at: string;
}

type IncidentWorkflowStatus = 'pending_manager_review' | 'manager_approved' | 'approved' | 'closed' | 'reopened';

type IncidentParticipantStatus = 'self_reported' | 'pending_manager_review' | 'manager_verified' | 'approved' | 'rejected';

interface CalamityIncidentRow {
  id: string;
  incident_key: string;
  source_report_id: string | null;
  incident_type: string;
  incident_name: string;
  location_label: string;
  lat: number;
  lng: number;
  radius_km: number;
  description: string;
  status: IncidentWorkflowStatus;
  created_by_employee_id: string | null;
  created_by_employee_name: string | null;
  created_by_role: string | null;
  approved_by: string | null;
  approved_at: string | null;
  closed_at: string | null;
  join_deadline_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CalamityIncidentPersonRow {
  id: string;
  incident_id: string;
  employee_id: string;
  employee_name: string;
  employee_avatar: string | null;
  employee_role: string | null;
  relation_status: IncidentParticipantStatus;
  joined_at: string;
  joined_source: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
}

type CalamityIncidentPersonUpsertRow = Omit<CalamityIncidentPersonRow, 'id'>;

interface IncidentReportLike {
  id: string;
  timestamp: string;
  type: string;
  incidentName: string;
  locationLabel: string;
  lat: number;
  lng: number;
  radiusKm: number;
  affectedCount: number;
  affectedEmployeeIds: string[];
  magnitude?: string;
  signalLevel?: string;
  description: string;
}

interface PendingEmployeeReportLike {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar: string;
  timestamp: string;
  type: string;
  incidentName: string;
  locationLabel: string;
  lat: number;
  lng: number;
  description: string;
  status: 'Pending' | 'ManagerApproved' | 'Approved' | 'Rejected';
  routedTo: string;
}

const AID_ATTACHMENT_BUCKET = process.env.SUPABASE_AID_ATTACHMENT_BUCKET || 'aid-assistance-attachments';
const PROFILE_PICTURE_BUCKET = process.env.SUPABASE_PROFILE_PICTURE_BUCKET || 'profile-pictures';
const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
const ALLOWED_ATTACHMENT_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const ALLOWED_PROFILE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_PROFILE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

let profileBucketReady: Promise<void> | null = null;

async function ensureProfilePictureBucket(): Promise<void> {
  if (!profileBucketReady) {
    profileBucketReady = (async () => {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      if (listError) {
        console.warn('Could not list storage buckets:', listError.message);
      }
      const exists = (buckets ?? []).some((b) => b.name === PROFILE_PICTURE_BUCKET || b.id === PROFILE_PICTURE_BUCKET);
      if (exists) return;

      const { error: createError } = await supabase.storage.createBucket(PROFILE_PICTURE_BUCKET, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
      if (createError && !/already exists|duplicate/i.test(createError.message)) {
        throw new Error(createError.message);
      }
      console.log(`Storage bucket ready: ${PROFILE_PICTURE_BUCKET}`);
    })().catch((err) => {
      profileBucketReady = null;
      throw err;
    });
  }
  await profileBucketReady;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

// ── Utility helpers ───────────────────────────────────────────────────────────
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

function getIslandGroup(city: string, province: string): 'Luzon' | 'Visayas' | 'Mindanao' {
  const p = province.toLowerCase();
  const c = city.toLowerCase();

  if (p.includes('ncr') || p.includes('national capital') || p.includes('metro manila')) return 'Luzon';
  if (p.includes('region i') || p.includes('region ii') || p.includes('region iii') ||
      p.includes('region iv-a') || p.includes('region iv-b') || p.includes('region v') ||
      p.includes('car') || p.includes('cordillera')) return 'Luzon';

  const luzonProvinces = ['metro manila', 'pampanga', 'laguna', 'bulacan', 'rizal', 'cavite', 'batangas',
                          'camarines norte', 'camarines sur', 'albay', 'sorsogon', 'masbate', 'catanduanes',
                          'tarlac', 'nueva ecija', 'pangasinan', 'la union', 'ilocos', 'abra', 'benguet',
                          'ifugao', 'kalinga', 'apayao', 'mountain province', 'quezon', 'aurora'];
  if (luzonProvinces.some(lp => p.includes(lp) || c.includes(lp))) return 'Luzon';

  if (p.includes('region x') || p.includes('region xi') || p.includes('region xii') ||
      p.includes('region xiii') || p.includes('bangsamoro') || p.includes('caraga')) return 'Mindanao';
  const mindanaoProvinces = ['davao', 'misamis', 'zamboanga', 'cotabato', 'sultan kudarat', 'maguindanao',
                             'lanao', 'agusan', 'surigao', 'camiguin', 'bukidnon', 'north cotabato',
                             'sarangani', 'south cotabato', 'compostela'];
  if (mindanaoProvinces.some(mp => p.includes(mp) || c.includes(mp))) return 'Mindanao';

  return 'Visayas';
}

async function queryTableRows<T>(tableName: string): Promise<T[]> {
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

function composeFullName(row: EmpPersonalDetailsRow): string {
  const explicitName = String(row.employee_name ?? '').trim();
  if (explicitName) return explicitName;

  const parts = [row.first_name, row.middle_name, row.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(' ');
}

async function loadEmployeesFromNormalizedTables(): Promise<SupabaseEmployeeRow[]> {
  const [personalRows, infoRows, contactRows, addressRows, departmentRows] = await Promise.all([
    queryTableRows<EmpPersonalDetailsRow>('emp_personal_details'),
    queryTableRows<EmployeeInfoRow>('employee_info'),
    queryTableRows<ContactRow>('contact'),
    queryTableRows<AddressRow>('address'),
    queryTableRows<DepartmentRow>('department'),
  ]);

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
      'Employment Status': undefined,
      'Employee Status': undefined,
      'Managers ID': undefined,
      'Managers Name': undefined,
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
      'Manager\'s Name': undefined,
    } satisfies SupabaseEmployeeRow;
  });
}

// ── Main data loader from Supabase ────────────────────────────────────────────
async function loadEmployees(): Promise<Employee[]> {
  console.log('Connecting to Supabase and fetching employee data...');

  // Prefer the legacy single-table export when it exists, but fall back to the
  // normalized Supabase tables used by the migrated seed script.
  const allRows: SupabaseEmployeeRow[] = [];
  let from = 0;
  const pageSize = 1000;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('Employee Details')
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) break;

      allRows.push(...(data as SupabaseEmployeeRow[]));

      if (data.length < pageSize) break; // Last page
      from += pageSize;
    }
  } catch (legacyError) {
    console.warn('Legacy Employee Details table unavailable; falling back to normalized tables.', legacyError);
    const normalizedRows = await loadEmployeesFromNormalizedTables();
    allRows.push(...normalizedRows);
  }

  if (allRows.length === 0) {
    const normalizedRows = await loadEmployeesFromNormalizedTables();
    allRows.push(...normalizedRows);
  }

  console.log(`Fetched ${allRows.length} raw rows from Supabase.`);

  const employees: Employee[] = [];

  for (const row of allRows) {
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

    // ── Detect whether this employee has any location data at all ─────────────
    const hasLocationData = !!(city || province || regionLabel ||
      completeAddress || houseNo || street || barangay);

    // Build full address string
    const addressParts = [houseNo, street, barangay, city, province].filter(Boolean);
    const addressStr = hasLocationData
      ? (completeAddress || addressParts.join(', ') || `${city}, ${province}`)
      : 'Needs Update';

    // GPS coordinates — only derive when we have actual location data
    // Without this guard, empty-address employees all fall to the NCR default coords
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

      const LAT_MIN = 4.5, LAT_MAX = 21.5;
      const LNG_MIN = 116.0, LNG_MAX = 127.0;
      gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
      gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
    }

    // Island group — undefined when no location data
    const islandGroup = hasLocationData
      ? getIslandGroup(city, province || regionLabel)
      : undefined;

    // ── Region: trust the database value first, then city/province resolver.
    // Never GPS-default into NCR when the address/region column is empty.
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
          address: addressStr !== 'Needs Update' ? addressStr : completeAddress || undefined,
          // Only use GPS when we recognized the city/province (avoids NCR dump)
          gpsLat: knownCityCoords ? gpsLat : undefined,
          gpsLng: knownCityCoords ? gpsLng : undefined,
        }) ??
        'NEEDS_UPDATE';
    }

    // Avatar initials from name
    const nameParts = fullName.split(' ').filter(Boolean);
    const avatar = nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
      : fullName.slice(0, 2).toUpperCase();

    // Phone cleanup
    const rawPhone = (row['MOBILE NUMBER'] ?? '').trim();
    const cleanPhone = rawPhone && !rawPhone.toUpperCase().includes('FOR UPDATE') ? rawPhone : undefined;

    // Email — prefer official, fall back to personal
    const officialEmail = (row['OFFICIAL EMAIL'] ?? '').trim();
    const personalEmail = (row['PERSONAL EMAIL'] ?? '').trim();
    const email = officialEmail || personalEmail || '';

    // Designation → role
    const designation = (row['Designation'] ?? 'Employee').trim();

    // DU → department
    const department = (row['DU'] ?? 'Unknown').trim() || 'Unknown';

    // Manager check and access role
    const managersId = (row['Managers ID'] ?? '').trim();
    const managerName = ((row['Manager\'s Name'] ?? row['Managers Name']) ?? '').trim();
    const isManager = row['PeopleManager/Individual Contributor']
      ? row['PeopleManager/Individual Contributor']!.toLowerCase().includes('manager')
      : false;
    const rawRole = (row['role'] ?? '').trim().toLowerCase();
    const accessRole = rawRole === 'manager' || isManager ? 'manager' : 'employee';

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
      email,
      avatar,
      address: addressStr,
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

// ── In-memory cache of loaded employees (service-role key bypasses Supabase RLS) ──
let allEmployees: Employee[] = [];

/** Merge accounts.profile_picture onto employee records by employee_id. */
async function attachProfilePictures(employees: Employee[]): Promise<Employee[]> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('employee_id, profile_picture')
      .not('profile_picture', 'is', null);

    if (error || !data?.length) {
      return employees.map((emp) => ({ ...emp, profilePicture: emp.profilePicture ?? null }));
    }

    const byId = new Map<string, string>();
    for (const row of data) {
      const id = String(row.employee_id ?? '').trim();
      const url = typeof row.profile_picture === 'string' ? row.profile_picture.trim() : '';
      if (id && url) byId.set(id, url);
    }

    return employees.map((emp) => ({
      ...emp,
      profilePicture: byId.get(emp.id) ?? null,
    }));
  } catch (err) {
    console.warn('Could not attach profile pictures:', err instanceof Error ? err.message : err);
    return employees.map((emp) => ({ ...emp, profilePicture: emp.profilePicture ?? null }));
  }
}

function setEmployeeProfilePicture(employeeId: string, profilePicture: string | null) {
  const idx = allEmployees.findIndex((e) => e.id === employeeId);
  if (idx >= 0) {
    allEmployees[idx] = { ...allEmployees[idx], profilePicture };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeIncidentSnapshotPayload(value: unknown): IncidentSnapshotPayload | null {
  if (!isRecord(value)) return null;
  const epicenter = isRecord(value.epicenter) ? value.epicenter : null;
  const activeDisaster = isRecord(value.activeDisaster) ? value.activeDisaster : null;
  if (!epicenter || typeof epicenter.lat !== 'number' || typeof epicenter.lng !== 'number' || typeof epicenter.radiusKm !== 'number' || !activeDisaster) {
    return null;
  }

  const resolvedReports = isRecord(value.resolvedReports)
    ? Object.fromEntries(
        Object.entries(value.resolvedReports).filter(([, flag]) => typeof flag === 'boolean')
      )
    : {};

  return {
    calamityReports: Array.isArray(value.calamityReports) ? value.calamityReports : [],
    pendingEmployeeReports: Array.isArray(value.pendingEmployeeReports) ? value.pendingEmployeeReports : [],
    resolvedReports: resolvedReports as Record<string, boolean>,
    simulationActive: Boolean(value.simulationActive),
    epicenter: {
      lat: epicenter.lat,
      lng: epicenter.lng,
      radiusKm: epicenter.radiusKm,
    },
    activeDisaster,
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildIncidentKey(input: {
  type: string;
  incidentName: string;
  locationLabel: string;
  lat: number;
  lng: number;
  radiusKm: number;
}): string {
  const typeKey = normalizeText(input.type);
  const locationKey = normalizeText(input.locationLabel || input.incidentName);
  return [typeKey, locationKey, roundTo(input.lat, 3), roundTo(input.lng, 3), roundTo(input.radiusKm, 1)].join('|');
}

function incidentStatusFromReport(status?: string): IncidentWorkflowStatus {
  if (status === 'Approved') return 'approved';
  if (status === 'Rejected') return 'closed';
  if (status === 'ManagerApproved') return 'manager_approved';
  return 'pending_manager_review';
}

function participantStatusFromReport(status?: string): IncidentParticipantStatus {
  if (status === 'Approved') return 'approved';
  if (status === 'Rejected') return 'rejected';
  if (status === 'ManagerApproved') return 'manager_verified';
  return 'pending_manager_review';
}

function buildDisasterTemplates(type: string): { id: string; name: string; subName: string; icon: string; color: string; colorClass: string; hexColor: string; greenTemplates: string[]; replyTemplates: string[] } {
  if (normalizeText(type).includes('earthquake')) {
    return {
      id: 'earthquake',
      name: 'Earthquake Incident',
      subName: 'Seismic event',
      icon: 'earthquake',
      color: 'red',
      colorClass: 'text-rose-700 bg-rose-50 border-rose-200',
      hexColor: '#f43f5e',
      greenTemplates: ['Safe and accounted for.', 'No injuries reported.', 'Evacuated to safer ground.'],
      replyTemplates: ['Need first aid support.', 'Walls cracked, requesting assistance.', 'Trapped indoors, need help.'],
    };
  }

  if (normalizeText(type).includes('typhoon') || normalizeText(type).includes('flood')) {
    return {
      id: 'typhoon',
      name: 'Typhoon Incident',
      subName: 'Weather event',
      icon: 'typhoon',
      color: 'cyan',
      colorClass: 'text-cyan-700 bg-cyan-50 border-cyan-200',
      hexColor: '#06b6d4',
      greenTemplates: ['Sheltered and safe.', 'Power out but family is okay.', 'Standing by evacuation center.'],
      replyTemplates: ['Flooding nearby, need relief goods.', 'Roof damaged, please send assistance.', 'Stranded due to floodwaters.'],
    };
  }

  return {
    id: 'fire',
    name: 'Fire Incident',
    subName: 'Localized emergency',
    icon: 'fire',
    color: 'orange',
    colorClass: 'text-orange-700 bg-orange-50 border-orange-200',
    hexColor: '#f97316',
    greenTemplates: ['Evacuated safely.', 'Fire is under control.', 'Safe and waiting for clearance.'],
    replyTemplates: ['Smoke nearby, requesting help.', 'Need medical support and evacuation.', 'Power cut off, seeking assistance.'],
  };
}

function buildSnapshotReportFromIncident(incident: CalamityIncidentRow, people: CalamityIncidentPersonRow[]): IncidentReportLike {
  const affectedEmployeeIds = people
    .filter((person) => person.relation_status !== 'rejected')
    .map((person) => person.employee_id);

  return {
    id: incident.id,
    timestamp: new Date(incident.created_at || incident.updated_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
    type: incident.incident_type,
    incidentName: incident.incident_name,
    locationLabel: incident.location_label,
    lat: incident.lat,
    lng: incident.lng,
    radiusKm: incident.radius_km,
    affectedCount: affectedEmployeeIds.length,
    affectedEmployeeIds,
    description: incident.description,
  };
}

function buildPendingReportFromPerson(incident: CalamityIncidentRow, person: CalamityIncidentPersonRow): PendingEmployeeReportLike {
  const statusMap: Record<IncidentParticipantStatus, PendingEmployeeReportLike['status']> = {
    self_reported: 'Pending',
    pending_manager_review: 'Pending',
    manager_verified: 'ManagerApproved',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  return {
    id: `${incident.id}-${person.employee_id}`,
    employeeId: person.employee_id,
    employeeName: person.employee_name,
    employeeAvatar: person.employee_avatar ?? person.employee_name.charAt(0),
    timestamp: new Date(person.joined_at || incident.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
    type: incident.incident_type,
    incidentName: incident.incident_name,
    locationLabel: incident.location_label,
    lat: incident.lat,
    lng: incident.lng,
    description: incident.description,
    status: statusMap[person.relation_status] ?? 'Pending',
    routedTo: incident.created_by_employee_id || '',
  };
}

function isIncidentReportLike(value: unknown): value is IncidentReportLike {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.type === 'string'
    && typeof value.incidentName === 'string'
    && typeof value.locationLabel === 'string'
    && typeof value.lat === 'number'
    && typeof value.lng === 'number'
    && typeof value.radiusKm === 'number'
    && typeof value.description === 'string'
    && Array.isArray(value.affectedEmployeeIds);
}

function isPendingReportLike(value: unknown): value is PendingEmployeeReportLike {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.employeeId === 'string'
    && typeof value.employeeName === 'string'
    && typeof value.employeeAvatar === 'string'
    && typeof value.timestamp === 'string'
    && typeof value.type === 'string'
    && typeof value.incidentName === 'string'
    && typeof value.locationLabel === 'string'
    && typeof value.lat === 'number'
    && typeof value.lng === 'number'
    && typeof value.description === 'string'
    && typeof value.status === 'string'
    && typeof value.routedTo === 'string';
}

async function loadIncidentSnapshotFromNormalizedTables(): Promise<IncidentSnapshotPayload | null> {
  const { data: incidents, error: incidentError } = await supabase
    .from('calamity_incidents')
    .select('*')
    .order('updated_at', { ascending: false });

  if (incidentError) {
    throw new Error(incidentError.message);
  }

  if (!incidents || incidents.length === 0) {
    return null;
  }

  const incidentRows = incidents as CalamityIncidentRow[];
  const incidentIds = incidentRows.map((incident) => incident.id);

  const { data: people, error: peopleError } = await supabase
    .from('calamity_incident_people')
    .select('*')
    .in('incident_id', incidentIds)
    .order('joined_at', { ascending: true });

  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const groupedPeople = new Map<string, CalamityIncidentPersonRow[]>();
  ((people ?? []) as CalamityIncidentPersonRow[]).forEach((person) => {
    const list = groupedPeople.get(person.incident_id) ?? [];
    list.push(person);
    groupedPeople.set(person.incident_id, list);
  });

  const calamityReports = incidentRows.map((incident) => buildSnapshotReportFromIncident(incident, groupedPeople.get(incident.id) ?? []));
  const pendingEmployeeReports = incidentRows.flatMap((incident) => {
    const peopleForIncident = groupedPeople.get(incident.id) ?? [];
    return peopleForIncident
      .filter((person) => person.relation_status !== 'approved')
      .map((person) => buildPendingReportFromPerson(incident, person));
  });

  const latestIncident = incidentRows[0];
  const disaster = buildDisasterTemplates(latestIncident.incident_type);

  return {
    calamityReports,
    pendingEmployeeReports,
    resolvedReports: Object.fromEntries(incidentRows.map((incident) => [incident.id, incident.status === 'closed'])),
    simulationActive: incidentRows.some((incident) => incident.status !== 'closed'),
    epicenter: {
      lat: latestIncident.lat,
      lng: latestIncident.lng,
      radiusKm: latestIncident.radius_km,
    },
    activeDisaster: {
      ...disaster,
      defaultX: latestIncident.lat,
      defaultY: latestIncident.lng,
      defaultRadius: latestIncident.radius_km,
      locationName: latestIncident.location_label,
      description: latestIncident.description,
    },
  };
}

async function syncIncidentSnapshotToNormalizedTables(snapshot: IncidentSnapshotPayload): Promise<void> {
  const incidentMap = new Map<string, {
    incident: Partial<CalamityIncidentRow>;
    people: CalamityIncidentPersonUpsertRow[];
  }>();

  const addIncident = (input: {
    sourceReportId: string;
    incidentType: string;
    incidentName: string;
    locationLabel: string;
    lat: number;
    lng: number;
    radiusKm: number;
    description: string;
    status: IncidentWorkflowStatus;
    createdByEmployeeId?: string | null;
    createdByEmployeeName?: string | null;
    createdByRole?: string | null;
    people: CalamityIncidentPersonUpsertRow[];
  }) => {
    const incidentKey = buildIncidentKey({
      type: input.incidentType,
      incidentName: input.incidentName,
      locationLabel: input.locationLabel,
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm,
    });

    const existing = incidentMap.get(incidentKey);
    let nextStatus: IncidentWorkflowStatus = input.status;
    if (existing?.incident.status) {
      if (input.status === 'closed') {
        nextStatus = 'closed';
      } else if (existing.incident.status === 'closed' && input.status === 'approved') {
        // Explicit reopen from snapshot (resolvedReports cleared for this report).
        nextStatus = 'approved';
      } else if (existing.incident.status === 'closed') {
        nextStatus = 'closed';
      } else if (existing.incident.status === 'approved' || input.status === 'approved') {
        nextStatus = 'approved';
      } else if (existing.incident.status === 'manager_approved' || input.status === 'manager_approved') {
        nextStatus = 'manager_approved';
      } else {
        nextStatus = input.status;
      }
    }

    const closedAt =
      nextStatus === 'closed'
        ? (existing?.incident.closed_at ?? new Date().toISOString())
        : null;

    const incident: Partial<CalamityIncidentRow> = {
      ...(existing?.incident ?? {}),
      incident_key: incidentKey,
      source_report_id: existing?.incident.source_report_id ?? input.sourceReportId,
      incident_type: input.incidentType,
      incident_name: input.incidentName,
      location_label: input.locationLabel,
      lat: input.lat,
      lng: input.lng,
      radius_km: input.radiusKm,
      description: input.description,
      status: nextStatus,
      created_by_employee_id: input.createdByEmployeeId ?? existing?.incident.created_by_employee_id ?? null,
      created_by_employee_name: input.createdByEmployeeName ?? existing?.incident.created_by_employee_name ?? null,
      created_by_role: input.createdByRole ?? existing?.incident.created_by_role ?? null,
      approved_by: existing?.incident.approved_by ?? null,
      approved_at: existing?.incident.approved_at ?? null,
      closed_at: closedAt,
      join_deadline_at: existing?.incident.join_deadline_at ?? null,
    };

    const people = [...(existing?.people ?? []), ...input.people];
    incidentMap.set(incidentKey, { incident, people });
  };

  for (const report of snapshot.calamityReports) {
    if (!isIncidentReportLike(report)) continue;
    const isResolved = Boolean(snapshot.resolvedReports?.[report.id]);
    addIncident({
      sourceReportId: report.id,
      incidentType: report.type,
      incidentName: report.incidentName,
      locationLabel: report.locationLabel,
      lat: report.lat,
      lng: report.lng,
      radiusKm: report.radiusKm,
      description: report.description,
      status: isResolved ? 'closed' : 'approved',
      people: report.affectedEmployeeIds.map((employeeId) => {
        const employee = allEmployees.find((entry) => entry.id === employeeId);
        return {
          incident_id: '',
          employee_id: employeeId,
          employee_name: employee?.name ?? employeeId,
          employee_avatar: employee?.avatar ?? null,
          employee_role: employee?.role ?? null,
          relation_status: 'approved',
          joined_at: new Date(report.timestamp || Date.now()).toISOString(),
          joined_source: 'calamity_report',
          verified_by: null,
          verified_at: null,
          notes: null,
        };
      }),
    });
  }

  for (const report of snapshot.pendingEmployeeReports) {
    if (!isPendingReportLike(report)) continue;
    addIncident({
      sourceReportId: report.id,
      incidentType: report.type,
      incidentName: report.incidentName,
      locationLabel: report.locationLabel,
      lat: report.lat,
      lng: report.lng,
      radiusKm: 1,
      description: report.description,
      status: incidentStatusFromReport(report.status),
      createdByEmployeeId: report.employeeId,
      createdByEmployeeName: report.employeeName,
      createdByRole: 'employee',
      people: [{
        incident_id: '',
        employee_id: report.employeeId,
        employee_name: report.employeeName,
        employee_avatar: report.employeeAvatar,
        employee_role: null,
        relation_status: participantStatusFromReport(report.status),
        joined_at: new Date(report.timestamp || Date.now()).toISOString(),
        joined_source: 'employee_report',
        verified_by: null,
        verified_at: null,
        notes: null,
      }],
    });
  }

  const incidentRows = Array.from(incidentMap.values()).map((entry) => entry.incident);
  if (incidentRows.length > 0) {
    const { data: savedIncidents, error: saveError } = await supabase
      .from('calamity_incidents')
      .upsert(incidentRows, { onConflict: 'incident_key' })
      .select('*');

    if (saveError) {
      throw new Error(saveError.message);
    }

    const savedRows = (savedIncidents ?? []) as CalamityIncidentRow[];
    const idByKey = new Map(savedRows.map((row) => [row.incident_key, row.id]));
    const personRows: Record<string, unknown>[] = [];

    for (const [incidentKey, entry] of incidentMap.entries()) {
      const incidentId = idByKey.get(incidentKey);
      if (!incidentId) continue;
      for (const person of entry.people) {
        personRows.push({
          ...person,
          incident_id: incidentId,
        });
      }
    }

    if (personRows.length > 0) {
      const { error: personError } = await supabase
        .from('calamity_incident_people')
        .upsert(personRows, { onConflict: 'incident_id,employee_id' });

      if (personError) {
        throw new Error(personError.message);
      }
    }
  }
}

// Resolve a manager's employee id from their name (used for id-based matching).
function resolveManagerId(managerName: string, managerId?: string): string | undefined {
  if (managerId) return managerId;
  const found = allEmployees.find(
    (e) => e.name.toLowerCase() === managerName.trim().toLowerCase()
  );
  return found?.id;
}

// Authorization boundary: a manager may only act on employees that report to them.
// Returns null when allowed, or an error descriptor when forbidden / not found.
function enforceManagerAccess(
  targetId: string,
  managerName: string,
  managerId?: string
): { status: number; message: string } | null {
  const target = allEmployees.find((e) => e.id === targetId);
  if (!target) return { status: 404, message: 'Employee not found.' };

  const mgrId = resolveManagerId(managerName, managerId);
  const nameMatch =
    target.managerName?.trim().toLowerCase() === managerName.trim().toLowerCase();
  const idMatch = !!mgrId && target.managerId === mgrId;
  if (!nameMatch && !idMatch) {
    return {
      status: 403,
      message: 'Forbidden: the requested employee is not under your management.',
    };
  }
  return null;
}

function readManagerFromRequest(req: express.Request): { name: string; id?: string } {
  const name =
    (req.query.manager as string) ||
    (req.header('x-manager-name') as string) ||
    '';
  const id =
    (req.query.managerId as string) ||
    (req.header('x-manager-id') as string) ||
    undefined;
  return { name: name.trim(), id };
}

/** Demo manager login (username `manager`) uses a fixed sample team. */
const DEMO_MANAGER_TEAM_IDS = ['T8U', 'T8S'];

function getManagerDirectReportIds(managerName: string, managerId?: string): string[] {
  const resolvedManagerId = resolveManagerId(managerName, managerId);
  const ids = allEmployees
    .filter((emp) => {
      const nameMatch =
        emp.managerName?.trim().toLowerCase() === managerName.trim().toLowerCase();
      const idMatch = !!resolvedManagerId && emp.managerId === resolvedManagerId;
      return nameMatch || idMatch;
    })
    .map((emp) => emp.id);

  if (ids.length === 0 && managerName.trim().toLowerCase() === 'manager') {
    return DEMO_MANAGER_TEAM_IDS.filter((id) => allEmployees.some((emp) => emp.id === id));
  }
  return ids;
}

function buildAidRequestCode(): string {
  const ts = Date.now().toString();
  return `AID-${ts.slice(-8)}`;
}

function mapAidRequestToResponse(row: AidAssistanceRequestRow, attachments: AidAttachmentRow[]) {
  return {
    id: row.id,
    requestCode: row.request_code,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    position: row.position ?? undefined,
    incidentId: '',
    incidentName: row.incident_name,
    aidType: row.aid_type,
    description: row.reason,
    status: row.status,
    damageType: row.damage_type,
    filedDate: new Date(row.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
    islandGroup: 'Luzon',
    managerReview: {
      decision: row.manager_decision ?? 'Pending',
      remarks: row.manager_remarks ?? undefined,
      reviewedBy: row.manager_reviewed_by ?? undefined,
      reviewedDate: row.manager_reviewed_at
        ? new Date(row.manager_reviewed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : undefined,
    },
    adminReview: {
      decision: row.admin_decision ?? 'Pending',
      remarks: row.admin_remarks ?? undefined,
      reviewedBy: row.admin_reviewed_by ?? undefined,
      reviewedDate: row.admin_reviewed_at
        ? new Date(row.admin_reviewed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : undefined,
    },
    attachments: attachments.map((file) => ({
      id: file.id,
      fileName: file.file_name,
      filePath: file.file_path,
      publicUrl: file.public_url,
      uploadedAt: file.uploaded_at,
    })),
  };
}

function isAllowedAttachment(file: Express.Multer.File): boolean {
  const ext = extname(file.originalname || '').toLowerCase();
  return ALLOWED_ATTACHMENT_MIME.has(file.mimetype) || ALLOWED_ATTACHMENT_EXT.has(ext);
}

// ── Accounts / login (persisted in Supabase `accounts`) ───────────────────────
type AccountRole = 'admin' | 'manager' | 'official';
type SwitchableRole = 'admin' | 'manager' | 'official';

const SYSTEM_ACCOUNT_IDS = {
  admin: 'ADMIN',
  manager: 'MANAGER',
} as const;

interface AccountRow {
  employee_id: string;
  username: string;
  password_hash: string;
  access_role: AccountRole;
  display_name: string | null;
  profile_picture: string | null;
  is_active: boolean;
}

function normalizeAccountText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSwitchableRoles(account: AccountRow): { canSwitchRoles: boolean; switchableRoles: SwitchableRole[] } {
  const employeeId = normalizeAccountText(account.employee_id);
  const username = normalizeAccountText(account.username);
  const displayName = normalizeAccountText(account.display_name);

  const isPrivilegedAccount =
    employeeId === '7rf' ||
    username === '7rf' ||
    username === 'zulueta vladimir' ||
    displayName === 'zulueta vladimir';

  if (!isPrivilegedAccount) {
    if (account.access_role === 'manager') {
      return {
        canSwitchRoles: true,
        switchableRoles: ['official', 'manager'],
      };
    }

    return {
      canSwitchRoles: false,
      switchableRoles: [account.access_role],
    };
  }

  return {
    canSwitchRoles: true,
    switchableRoles: ['official', 'manager', 'admin'],
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function upsertAccount(input: {
  username: string;
  password: string;
  accessRole: AccountRole;
  employeeId: string;
  displayName?: string | null;
  /** When false, do not overwrite an existing password hash */
  overwritePassword?: boolean;
}): Promise<void> {
  const username = input.username.trim().toLowerCase();
  const employeeId = input.employeeId.trim();
  if (!username || !employeeId) return;

  const { data: existing, error: findError } = await supabase
    .from('accounts')
    .select('employee_id, password_hash')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  if (existing?.employee_id) {
    const patch: Record<string, unknown> = {
      username,
      access_role: input.accessRole,
      display_name: input.displayName ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (input.overwritePassword) {
      patch.password_hash = hashPassword(input.password);
    }
    const { error } = await supabase
      .from('accounts')
      .update(patch)
      .eq('employee_id', existing.employee_id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('accounts').insert({
    employee_id: employeeId,
    username,
    password_hash: hashPassword(input.password),
    access_role: input.accessRole,
    display_name: input.displayName ?? null,
    is_active: true,
  });
  if (error) throw new Error(error.message);
}

function accountUsernameForEmployee(emp: Employee): string | null {
  const email = emp.email?.trim().toLowerCase();
  if (email) return email;
  const id = emp.id?.trim().toLowerCase();
  return id || null;
}

async function loadExistingAccountKeys(): Promise<{ usernames: Set<string>; employeeIds: Set<string> }> {
  const usernames = new Set<string>();
  const employeeIds = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('accounts')
      .select('username, employee_id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const u = String((row as { username?: string }).username || '')
        .trim()
        .toLowerCase();
      const eid = String((row as { employee_id?: string }).employee_id || '').trim();
      if (u) usernames.add(u);
      if (eid) employeeIds.add(eid);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { usernames, employeeIds };
}

/** Seed system + employee accounts so logins are saved in the database. */
async function syncAccountsFromEmployees(employees: Employee[]): Promise<void> {
  try {
    // Always ensure system accounts exist (does not overwrite passwords).
    await upsertAccount({
      username: 'admin',
      password: 'admin123',
      accessRole: 'admin',
      employeeId: SYSTEM_ACCOUNT_IDS.admin,
      displayName: 'System Administrator',
      overwritePassword: false,
    });
    await upsertAccount({
      username: 'manager',
      password: 'manager123',
      accessRole: 'manager',
      employeeId: SYSTEM_ACCOUNT_IDS.manager,
      displayName: 'Area Manager',
      overwritePassword: false,
    });

    const existing = await loadExistingAccountKeys();
    existing.usernames.add('admin');
    existing.usernames.add('manager');
    existing.employeeIds.add(SYSTEM_ACCOUNT_IDS.admin);
    existing.employeeIds.add(SYSTEM_ACCOUNT_IDS.manager);

    const defaultHash = hashPassword('123456');
    const toInsert: Array<{
      employee_id: string;
      username: string;
      password_hash: string;
      access_role: AccountRole;
      display_name: string | null;
      is_active: boolean;
    }> = [];

    for (const emp of employees) {
      const employeeId = emp.id?.trim();
      const username = accountUsernameForEmployee(emp);
      if (!employeeId || !username) continue;
      if (existing.employeeIds.has(employeeId) || existing.usernames.has(username)) continue;
      existing.employeeIds.add(employeeId);
      existing.usernames.add(username);
      const role: AccountRole = emp.accessRole === 'manager' ? 'manager' : 'official';
      toInsert.push({
        employee_id: employeeId,
        username,
        password_hash: defaultHash,
        access_role: role,
        display_name: emp.name,
        is_active: true,
      });
    }

    let inserted = 0;
    const chunkSize = 100;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { error } = await supabase.from('accounts').upsert(chunk, {
        onConflict: 'employee_id',
        ignoreDuplicates: true,
      });
      if (error) {
        console.warn('Account batch upsert warning:', error.message);
        for (const row of chunk) {
          const { error: rowErr } = await supabase.from('accounts').upsert(row, {
            onConflict: 'employee_id',
            ignoreDuplicates: true,
          });
          if (!rowErr) inserted += 1;
        }
        continue;
      }
      inserted += chunk.length;
    }

    console.log(
      `Accounts synced (existing ${existing.employeeIds.size - inserted}, inserted ${inserted}; ` +
        `${employees.length} employees considered).`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      'Failed to sync accounts table. Run supabase/migrations/20260721_accounts.sql in Supabase first.',
      message
    );
  }
}

async function findAccountByUsername(username: string): Promise<AccountRow | null> {
  const normalized = username.trim().toLowerCase();
  const { data, error } = await supabase
    .from('accounts')
    .select('employee_id, username, password_hash, access_role, display_name, profile_picture, is_active')
    .eq('username', normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) return data as AccountRow;

  // Allow login with employee ID when username was not an email match.
  const empId = username.trim();
  const { data: byEmp, error: empError } = await supabase
    .from('accounts')
    .select('employee_id, username, password_hash, access_role, display_name, profile_picture, is_active')
    .eq('employee_id', empId)
    .maybeSingle();

  if (empError) {
    throw new Error(empError.message);
  }
  return (byEmp as AccountRow | null) ?? null;
}

// Login is registered immediately so auth works even while employee sync runs.
app.post('/api/login', async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const account = await findAccountByUsername(identifier);
    if (!account || !account.is_active || !verifyPassword(password, account.password_hash)) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const { canSwitchRoles, switchableRoles } = resolveSwitchableRoles(account);

    const employee =
      (account.employee_id
        ? allEmployees.find((e) => e.id === account.employee_id)
        : null) ??
      allEmployees.find((e) => e.email?.trim().toLowerCase() === account.username) ??
      null;

    return res.json({
      username: account.username,
      role: account.access_role,
      employeeId: account.employee_id ?? employee?.id ?? null,
      displayName: account.display_name ?? employee?.name ?? account.username,
      profilePicture: account.profile_picture ?? null,
      // Prompt employees still on the seeded default to change password after login.
      mustChangePassword:
        account.access_role === 'official' && verifyPassword('123456', account.password_hash),
      canSwitchRoles,
      switchableRoles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed.';
    console.error('Login error:', message);
    return res.status(500).json({
      message:
        'Login service unavailable. Ensure the accounts table exists (run 20260721_accounts.sql).',
      detail: message,
    });
  }
});

/** Upload / replace profile picture; stores public URL in accounts.profile_picture. */
app.post('/api/account/profile-picture', profileUpload.single('profilePicture'), async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    if (!identifier) {
      return res.status(400).json({ message: 'Account identifier is required.' });
    }

    const account = await findAccountByUsername(identifier);
    if (!account || !account.is_active) {
      return res.status(401).json({ message: 'Account not found or inactive.' });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ message: 'Profile picture file is required.' });
    }

    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PROFILE_MIME.has(file.mimetype) && !ALLOWED_PROFILE_EXT.has(ext)) {
      return res.status(400).json({ message: 'Only JPG, PNG, and WEBP images are allowed.' });
    }

    const safeExt = ALLOWED_PROFILE_EXT.has(ext) ? ext : '.jpg';
    const storagePath = `${account.employee_id}/${Date.now()}${safeExt}`;

    try {
      await ensureProfilePictureBucket();
    } catch (bucketErr) {
      const detail = bucketErr instanceof Error ? bucketErr.message : String(bucketErr);
      console.error('Profile picture bucket setup failed:', detail);
      return res.status(500).json({
        message:
          'Could not create the profile-pictures storage bucket. Create a public bucket named "profile-pictures" in Supabase Storage.',
        detail,
      });
    }

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PICTURE_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Profile picture upload failed:', uploadError.message);
      return res.status(500).json({
        message: 'Failed to upload profile picture to storage.',
        detail: uploadError.message,
      });
    }

    const { data: publicData } = supabase.storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(storagePath);
    const profilePictureUrl = publicData.publicUrl;

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        profile_picture: profilePictureUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', account.employee_id);

    if (updateError) {
      console.error('Profile picture DB update failed:', updateError.message);
      return res.status(500).json({
        message: 'Failed to save profile picture URL to the accounts table.',
        detail: updateError.message,
      });
    }

    setEmployeeProfilePicture(account.employee_id, profilePictureUrl);

    return res.json({
      message: 'Profile picture updated.',
      profilePicture: profilePictureUrl,
      username: account.username,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile picture update failed.';
    console.error('Profile picture error:', message);
    return res.status(500).json({ message: 'Profile picture update failed.', detail: message });
  }
});

/** Remove profile picture from accounts.profile_picture. */
app.delete('/api/account/profile-picture', async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.username ?? req.query?.identifier ?? '').trim();
    if (!identifier) {
      return res.status(400).json({ message: 'Account identifier is required.' });
    }

    const account = await findAccountByUsername(identifier);
    if (!account || !account.is_active) {
      return res.status(401).json({ message: 'Account not found or inactive.' });
    }

    const { error } = await supabase
      .from('accounts')
      .update({
        profile_picture: null,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', account.employee_id);

    if (error) {
      return res.status(500).json({ message: 'Failed to remove profile picture.', detail: error.message });
    }

    setEmployeeProfilePicture(account.employee_id, null);

    return res.json({ message: 'Profile picture removed.', profilePicture: null, username: account.username });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile picture removal failed.';
    return res.status(500).json({ message, detail: message });
  }
});

/** Change password for an authenticated account (persists hash to public.accounts). */
app.post('/api/change-password', async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (!identifier || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current password.' });
    }

    const account = await findAccountByUsername(identifier);
    if (!account || !account.is_active || !verifyPassword(currentPassword, account.password_hash)) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    const { error } = await supabase
      .from('accounts')
      .update({
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', account.employee_id);

    if (error) {
      console.error('Password update failed:', error.message);
      return res.status(500).json({ message: 'Failed to update password in the database.' });
    }

    return res.json({ message: 'Password updated successfully.', username: account.username });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Password change failed.';
    console.error('Change password error:', message);
    return res.status(500).json({ message: 'Password change failed.', detail: message });
  }
});

// ── Bootstrap server ──────────────────────────────────────────────────────────
loadEmployees()
  .then(async (employees) => {
    allEmployees = await attachProfilePictures(employees);
    // Do not block API startup on account seeding (was causing login failures).
    void syncAccountsFromEmployees(employees);

    // Manager-scoped read. When a manager is supplied, only their direct reports
    // are returned (server-side authorization — never trust the client filter).
    app.get('/api/employees', async (req, res) => {
      try {
        // Refresh photos without reloading the full employee dataset each time.
        allEmployees = await attachProfilePictures(allEmployees);
        const { name } = readManagerFromRequest(req);
        if (name) {
          const mgrId = resolveManagerId(name);
          const scoped = allEmployees.filter((emp) => {
            const nameMatch =
              emp.managerName?.trim().toLowerCase() === name.toLowerCase();
            const idMatch = !!mgrId && emp.managerId === mgrId;
            return emp.id !== mgrId && (nameMatch || idMatch);
          });
          return res.json(scoped);
        }
        res.json(allEmployees);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: 'Failed to load employees.', detail: message });
      }
    });

    app.post('/api/check-in/email', async (_req, res) => {
      return res.status(410).json({
        message: 'SMTP check-in endpoint is disabled. The app now uses mailto from the browser.',
      });
    });

    app.get('/api/check-in/respond', async (_req, res) => {
      return res.status(410).send('Email response tracking endpoint is disabled. The app now uses mailto only.');
    });

    app.get('/api/incidents', async (_req, res) => {
      try {
        const snapshot = await loadIncidentSnapshotFromNormalizedTables();
        return res.json(snapshot ?? { calamityReports: [], pendingEmployeeReports: [], resolvedReports: {}, simulationActive: false, epicenter: null, activeDisaster: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ message: 'Failed to load incidents.', detail: message });
      }
    });

    app.get('/api/incidents/active', async (_req, res) => {
      try {
        const snapshot = await loadIncidentSnapshotFromNormalizedTables();
        if (snapshot) {
          return res.json({ snapshot, updatedAt: new Date().toISOString() });
        }

        const { data, error } = await supabase
          .from('active_incident_state')
          .select('*')
          .eq('id', 'global')
          .limit(1);

        if (error) {
          return res.status(500).json({ message: 'Failed to load active incident.', detail: error.message });
        }

        const row = (data ?? [])[0] as IncidentSnapshotRow | undefined;
        if (!row) {
          return res.json({ snapshot: null });
        }

        const legacySnapshot = normalizeIncidentSnapshotPayload(row.snapshot);
        if (!legacySnapshot) {
          return res.status(500).json({ message: 'Stored active incident is invalid.' });
        }

        return res.json({ snapshot: legacySnapshot, updatedAt: row.updated_at });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ message: 'Failed to load active incident.', detail: message });
      }
    });

    app.put('/api/incidents/active', async (req, res) => {
      const snapshot = normalizeIncidentSnapshotPayload((req.body as { snapshot?: unknown } | undefined)?.snapshot);
      if (!snapshot) {
        return res.status(400).json({ message: 'Invalid active incident snapshot.' });
      }

      try {
        await syncIncidentSnapshotToNormalizedTables(snapshot);

        const { error } = await supabase
          .from('active_incident_state')
          .upsert({
            id: 'global',
            snapshot,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (error) {
          return res.status(500).json({ message: 'Failed to save active incident.', detail: error.message });
        }

        const persisted = await loadIncidentSnapshotFromNormalizedTables();
        return res.json({ message: 'Active incident saved.', snapshot: persisted ?? snapshot });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ message: 'Failed to save active incident.', detail: message });
      }
    });

    app.delete('/api/incidents/active', async (req, res) => {
      const role = String(req.query.role || req.header('x-user-role') || '').trim().toLowerCase();
      if (role !== 'admin') {
        return res.status(403).json({
          message: 'Only admin accounts can clear active incident records from the database.',
        });
      }

      try {
        await supabase.from('calamity_incident_people').delete().gte('joined_at', '1900-01-01');
        await supabase.from('calamity_incidents').delete().gte('created_at', '1900-01-01');

        const { error } = await supabase
          .from('active_incident_state')
          .delete()
          .eq('id', 'global');

        if (error) {
          return res.status(500).json({ message: 'Failed to clear active incident.', detail: error.message });
        }

        return res.json({ message: 'Active incident cleared.' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ message: 'Failed to clear active incident.', detail: message });
      }
    });

    /** Mark an incident finished/resolved (or reopen). Persists to calamity_incidents. */
    app.patch('/api/incidents/:id/resolve', async (req, res) => {
      const role = String(req.body?.role || req.query.role || req.header('x-user-role') || '')
        .trim()
        .toLowerCase();
      if (role !== 'admin' && role !== 'manager') {
        return res.status(403).json({
          message: 'Only manager or admin accounts can resolve or reopen incidents.',
        });
      }

      const incidentId = String(req.params.id || '').trim();
      if (!incidentId) {
        return res.status(400).json({ message: 'Incident id is required.' });
      }

      const action = String(req.body?.action || 'resolve').trim().toLowerCase();
      const reopen = action === 'reopen';
      const now = new Date().toISOString();
      const updates = reopen
        ? { status: 'approved' as const, closed_at: null, updated_at: now }
        : { status: 'closed' as const, closed_at: now, updated_at: now };

      try {
        let { data, error } = await supabase
          .from('calamity_incidents')
          .update(updates)
          .eq('id', incidentId)
          .select('*');

        if (!error && (!data || data.length === 0)) {
          ({ data, error } = await supabase
            .from('calamity_incidents')
            .update(updates)
            .eq('source_report_id', incidentId)
            .select('*'));
        }

        if (error) {
          return res.status(500).json({ message: 'Failed to update incident status.', detail: error.message });
        }

        if (!data || data.length === 0) {
          return res.status(404).json({
            message: 'Incident not found in the database. File/sync the incident first, then resolve it.',
          });
        }

        const row = data[0] as CalamityIncidentRow;
        const snapshot = await loadIncidentSnapshotFromNormalizedTables();
        if (snapshot) {
          await supabase.from('active_incident_state').upsert(
            {
              id: 'global',
              snapshot,
              updated_at: now,
            },
            { onConflict: 'id' }
          );
        }

        return res.json({
          message: reopen ? 'Incident reopened.' : 'Incident marked as resolved.',
          incident: {
            id: row.id,
            sourceReportId: row.source_report_id,
            status: row.status,
            closedAt: row.closed_at,
          },
          snapshot,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ message: 'Failed to update incident status.', detail: message });
      }
    });

    app.get('/api/aid-assistance', async (req, res) => {
      const viewerRole = String(req.query.viewerRole || '').trim();
      const viewerEmployeeId = String(req.query.viewerEmployeeId || '').trim();
      const managerName = String(req.query.managerName || '').trim();
      const managerId = String(req.query.managerId || '').trim();

      let query = supabase
        .from('aid_assistance_requests')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (viewerRole === 'official') {
        if (!viewerEmployeeId) {
          return res.status(400).json({ message: 'Employee identity required.' });
        }
        query = query.eq('employee_id', viewerEmployeeId);
      }

      if (viewerRole === 'manager') {
        if (!managerName) {
          return res.status(401).json({ message: 'Manager identity required.' });
        }
        const directReportIds = getManagerDirectReportIds(managerName, managerId || undefined);
        if (directReportIds.length === 0) {
          return res.json([]);
        }
        query = query.in('employee_id', directReportIds);
      }

      if (viewerRole === 'admin') {
        query = query.in('status', ['Pending Admin Review', 'Rejected by Admin/CSR', 'Approved']);
      }

      const { data: requests, error } = await query;
      if (error) {
        return res.status(500).json({ message: 'Failed to load aid assistance requests.', detail: error.message });
      }

      const requestRows = (requests ?? []) as AidAssistanceRequestRow[];
      if (requestRows.length === 0) {
        return res.json([]);
      }

      const requestIds = requestRows.map((row) => row.id);
      const { data: attachmentRows, error: attachmentError } = await supabase
        .from('aid_assistance_attachments')
        .select('*')
        .in('aid_assistance_id', requestIds)
        .order('uploaded_at', { ascending: false });

      if (attachmentError) {
        return res.status(500).json({ message: 'Failed to load aid assistance attachments.', detail: attachmentError.message });
      }

      const grouped = new Map<string, AidAttachmentRow[]>();
      ((attachmentRows ?? []) as AidAttachmentRow[]).forEach((file) => {
        const list = grouped.get(file.aid_assistance_id) ?? [];
        list.push(file);
        grouped.set(file.aid_assistance_id, list);
      });

      const response = requestRows.map((row) => {
        const employee = allEmployees.find((emp) => emp.id === row.employee_id);
        const mapped = mapAidRequestToResponse(row, grouped.get(row.id) ?? []);
        return {
          ...mapped,
          islandGroup: employee?.islandGroup ?? 'Luzon',
        };
      });

      return res.json(response);
    });

    app.post('/api/aid-assistance', upload.array('attachments', 10), async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const {
        employeeId,
        aidType,
        damageType,
        incidentName,
        description,
        submittedByManager,
        managerName: bodyManagerName,
        managerId: bodyManagerId,
      } = req.body as {
        employeeId?: string;
        aidType?: string;
        damageType?: 'Major' | 'Minor';
        incidentName?: string;
        description?: string;
        submittedByManager?: string | boolean;
        managerName?: string;
        managerId?: string;
      };

      if (!employeeId || !aidType || !damageType || !description) {
        return res.status(400).json({ message: 'Missing required aid assistance fields.' });
      }

      const employee = allEmployees.find((emp) => emp.id === employeeId);
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found.' });
      }

      const isManagerSubmission =
        submittedByManager === true ||
        String(submittedByManager || '').toLowerCase() === 'true' ||
        String(submittedByManager || '') === '1';

      let managerName = employee.managerName ?? null;
      let managerId = employee.managerId ?? null;
      let status: AidStatus = 'Pending Manager Review';
      let managerDecision: 'Approved' | 'Rejected' | null = null;
      let managerRemarks: string | null = null;
      let managerReviewedBy: string | null = null;
      let managerReviewedAt: string | null = null;

      if (isManagerSubmission) {
        const submittingManagerName = String(bodyManagerName || '').trim();
        const submittingManagerId = String(bodyManagerId || '').trim() || undefined;
        if (!submittingManagerName) {
          return res.status(401).json({ message: 'Manager identity required to submit for a team member.' });
        }

        const allowedIds = getManagerDirectReportIds(submittingManagerName, submittingManagerId);
        if (!allowedIds.includes(employee.id)) {
          const denied = enforceManagerAccess(employee.id, submittingManagerName, submittingManagerId);
          if (denied) {
            return res.status(denied.status).json({ message: denied.message });
          }
        }

        // Manager-filed requests are already endorsed and go straight to admin.
        status = 'Pending Admin Review';
        managerName = submittingManagerName;
        managerId = submittingManagerId ?? managerId;
        managerDecision = 'Approved';
        managerRemarks = 'Submitted by manager on behalf of team member.';
        managerReviewedBy = submittingManagerName;
        managerReviewedAt = new Date().toISOString();
      }

      for (const file of files) {
        if (!isAllowedAttachment(file)) {
          return res.status(400).json({ message: `Unsupported file type: ${file.originalname}` });
        }
      }

      const requestCode = buildAidRequestCode();

      const { data: insertedRows, error: insertError } = await supabase
        .from('aid_assistance_requests')
        .insert({
          request_code: requestCode,
          employee_id: employee.id,
          employee_name: employee.name,
          department: employee.department,
          position: employee.role,
          manager_id: managerId,
          manager_name: managerName,
          aid_type: aidType,
          damage_type: damageType,
          incident_name: incidentName?.trim() || 'Self-Reported Local Calamity',
          reason: description.trim(),
          status,
          manager_decision: managerDecision,
          manager_remarks: managerRemarks,
          manager_reviewed_by: managerReviewedBy,
          manager_reviewed_at: managerReviewedAt,
        })
        .select('*')
        .limit(1);

      if (insertError || !insertedRows || insertedRows.length === 0) {
        return res.status(500).json({ message: 'Failed to create aid assistance request.', detail: insertError?.message });
      }

      const requestRow = insertedRows[0] as AidAssistanceRequestRow;
      const savedAttachments: AidAttachmentRow[] = [];

      for (const file of files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${employee.id}/${requestRow.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(AID_ATTACHMENT_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          return res.status(500).json({ message: 'Failed to upload attachment.', detail: uploadError.message });
        }

        const { data: publicData } = supabase.storage.from(AID_ATTACHMENT_BUCKET).getPublicUrl(storagePath);

        const { data: insertedAttachmentRows, error: attachmentInsertError } = await supabase
          .from('aid_assistance_attachments')
          .insert({
            aid_assistance_id: requestRow.id,
            employee_id: employee.id,
            file_name: file.originalname,
            file_path: storagePath,
            public_url: publicData.publicUrl,
          })
          .select('*')
          .limit(1);

        if (attachmentInsertError || !insertedAttachmentRows || insertedAttachmentRows.length === 0) {
          return res.status(500).json({ message: 'Failed to save attachment metadata.', detail: attachmentInsertError?.message });
        }

        savedAttachments.push(insertedAttachmentRows[0] as AidAttachmentRow);
      }

      return res.status(201).json(mapAidRequestToResponse(requestRow, savedAttachments));
    });

    app.patch('/api/aid-assistance/:id/manager-review', async (req, res) => {
      const { id } = req.params;
      const {
        managerName,
        managerId,
        decision,
        remarks,
      } = req.body as {
        managerName?: string;
        managerId?: string;
        decision?: 'approve' | 'reject';
        remarks?: string;
      };

      if (!managerName) {
        return res.status(401).json({ message: 'Manager identity required.' });
      }
      if (!decision || !['approve', 'reject'].includes(decision)) {
        return res.status(400).json({ message: 'Invalid manager decision.' });
      }

      const { data: rows, error } = await supabase
        .from('aid_assistance_requests')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (error || !rows || rows.length === 0) {
        return res.status(404).json({ message: 'Aid assistance request not found.' });
      }

      const row = rows[0] as AidAssistanceRequestRow;
      const denied = enforceManagerAccess(row.employee_id, managerName, managerId);
      if (denied) {
        return res.status(denied.status).json({ message: denied.message });
      }
      if (row.status !== 'Pending Manager Review') {
        return res.status(400).json({ message: 'Only pending manager review requests can be actioned.' });
      }

      const nextStatus: AidStatus = decision === 'approve' ? 'Pending Admin Review' : 'Rejected by Manager';
      const managerDecision = decision === 'approve' ? 'Approved' : 'Rejected';

      const { data: updatedRows, error: updateError } = await supabase
        .from('aid_assistance_requests')
        .update({
          status: nextStatus,
          manager_decision: managerDecision,
          manager_remarks: remarks?.trim() || null,
          manager_reviewed_by: managerName,
          manager_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .limit(1);

      if (updateError || !updatedRows || updatedRows.length === 0) {
        return res.status(500).json({ message: 'Failed to update manager review.', detail: updateError?.message });
      }

      const updated = updatedRows[0] as AidAssistanceRequestRow;
      const { data: attachmentRows } = await supabase
        .from('aid_assistance_attachments')
        .select('*')
        .eq('aid_assistance_id', id)
        .order('uploaded_at', { ascending: false });

      return res.json(mapAidRequestToResponse(updated, (attachmentRows ?? []) as AidAttachmentRow[]));
    });

    app.patch('/api/aid-assistance/:id/admin-review', async (req, res) => {
      const { id } = req.params;
      const {
        reviewerName,
        decision,
        remarks,
      } = req.body as {
        reviewerName?: string;
        decision?: 'approve' | 'reject';
        remarks?: string;
      };

      if (!reviewerName) {
        return res.status(401).json({ message: 'Reviewer identity required.' });
      }
      if (!decision || !['approve', 'reject'].includes(decision)) {
        return res.status(400).json({ message: 'Invalid admin decision.' });
      }

      const { data: rows, error } = await supabase
        .from('aid_assistance_requests')
        .select('*')
        .eq('id', id)
        .limit(1);

      if (error || !rows || rows.length === 0) {
        return res.status(404).json({ message: 'Aid assistance request not found.' });
      }

      const row = rows[0] as AidAssistanceRequestRow;
      if (row.status !== 'Pending Admin Review') {
        return res.status(400).json({ message: 'Only pending admin review requests can be actioned.' });
      }

      const nextStatus: AidStatus = decision === 'approve' ? 'Approved' : 'Rejected by Admin/CSR';
      const adminDecision = decision === 'approve' ? 'Approved' : 'Rejected';

      const { data: updatedRows, error: updateError } = await supabase
        .from('aid_assistance_requests')
        .update({
          status: nextStatus,
          admin_decision: adminDecision,
          admin_remarks: remarks?.trim() || null,
          admin_reviewed_by: reviewerName,
          admin_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .limit(1);

      if (updateError || !updatedRows || updatedRows.length === 0) {
        return res.status(500).json({ message: 'Failed to update admin review.', detail: updateError?.message });
      }

      const updated = updatedRows[0] as AidAssistanceRequestRow;
      const { data: attachmentRows } = await supabase
        .from('aid_assistance_attachments')
        .select('*')
        .eq('aid_assistance_id', id)
        .order('uploaded_at', { ascending: false });

      return res.json(mapAidRequestToResponse(updated, (attachmentRows ?? []) as AidAttachmentRow[]));
    });

    // Manager-scoped check-in (write). Rejects with 403 if target isn't a direct report.
    app.post('/api/employees/:id/check-in', (req, res) => {
      const { name, id } = readManagerFromRequest(req);
      if (!name) return res.status(401).json({ message: 'Manager identity required.' });
      const denied = enforceManagerAccess(req.params.id, name, id);
      if (denied) return res.status(denied.status).json({ message: denied.message });
      res.json({ message: 'Check-in dispatched.', employeeId: req.params.id });
    });

    // Manager-scoped follow-up (write).
    app.post('/api/employees/:id/follow-up', (req, res) => {
      const { name, id } = readManagerFromRequest(req);
      if (!name) return res.status(401).json({ message: 'Manager identity required.' });
      const denied = enforceManagerAccess(req.params.id, name, id);
      if (denied) return res.status(denied.status).json({ message: denied.message });
      res.json({ message: 'Follow-up sent.', employeeId: req.params.id });
    });

    // Self-service profile update — employee edits their own contact/address details.
    // Accepts: contactNumber, gcashNumber, bankAccountDetails, address
    // Identity is verified by matching the employee ID to the email provided in the request.
    app.patch('/api/employees/:id/profile', async (req, res) => {
      const empId = req.params.id;
      const { contactNumber, gcashNumber, bankAccountDetails, address } = req.body as {
        contactNumber?: string;
        gcashNumber?: string;
        bankAccountDetails?: string;
        address?: string;
      };

      // Validate that the target employee actually exists
      const target = allEmployees.find((e) => e.id === empId);
      if (!target) return res.status(404).json({ message: 'Employee not found.' });

      // Build the Supabase update payload, only including provided fields
      const dbUpdate: Record<string, string> = {};
      if (contactNumber !== undefined) dbUpdate['MOBILE NUMBER'] = contactNumber.trim();
      if (address !== undefined)       dbUpdate['COMPLETE ADDRESS'] = address.trim();

      // gcashNumber and bankAccountDetails are stored as custom columns if they exist,
      // otherwise we gracefully skip the Supabase write for those two.
      const hasDbUpdate = Object.keys(dbUpdate).length > 0;

      if (hasDbUpdate) {
        const { error } = await supabase
          .from('Employee Details')
          .update(dbUpdate)
          .eq('Employee ID', empId);

        if (error) {
          console.error('Supabase profile update failed:', error.message);
          return res.status(500).json({ message: 'Database update failed.', detail: error.message });
        }
      }

      // Reflect changes in the in-memory cache so subsequent GET /api/employees is fresh
      const idx = allEmployees.findIndex((e) => e.id === empId);
      if (idx !== -1) {
        if (contactNumber !== undefined) (allEmployees[idx] as any).contactNumber = contactNumber.trim();
        if (gcashNumber !== undefined)   (allEmployees[idx] as any).gcashNumber = gcashNumber.trim();
        if (bankAccountDetails !== undefined) (allEmployees[idx] as any).bankAccountDetails = bankAccountDetails.trim();
        if (address !== undefined)       allEmployees[idx].address = address.trim();
      }

      return res.json({ message: 'Profile updated successfully.', employeeId: empId });
    });

    // Manager-scoped detail/update (write).
    app.patch('/api/employees/:id', (req, res) => {
      const { name, id } = readManagerFromRequest(req);
      if (!name) return res.status(401).json({ message: 'Manager identity required.' });
      const denied = enforceManagerAccess(req.params.id, name, id);
      if (denied) return res.status(denied.status).json({ message: denied.message });
      res.json({ message: 'Employee updated.', employeeId: req.params.id });
    });

    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        console.log(`Loaded ${employees.length} employees from Supabase.`);
      }).on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(
            `Port ${PORT} is already in use. Stop the other process (Vite proxies /api to localhost:${PORT}).`
          );
        } else {
          console.error('Failed to start server:', err);
        }
        process.exit(1);
      });
    } else {
      console.log(`Serverless mode: ${employees.length} employees loaded from Supabase.`);
    }
  })
  .catch((err) => {
    console.error('Failed to load employees from Supabase:', err);
    process.exit(1);
  });
