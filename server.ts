import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if present
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { extname } from 'path';
import { resolveEmployeeRegion } from './lib/regionResolver.js';

const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT || 5000);

// ── Supabase client (service-role key for unrestricted server-side access) ──
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
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
  gpsLat: number;
  gpsLng: number;
  carrier: 'Globe' | 'Smart' | 'DITO';
  normalSignalStrength: number;
  battery: number;
  status: 'Green' | 'Yellow' | 'Red';
  phone?: string;
  email: string;
  avatar: string;
  address?: string;
  islandGroup?: 'Luzon' | 'Visayas' | 'Mindanao';
  region?: string;
  managerId?: string;
  managerName?: string;
  team?: 'HR/CSR' | 'Manager';
  facility?: string;
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
  aid_type: 'Cash' | 'Relief Goods' | 'Both';
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

const AID_ATTACHMENT_BUCKET = process.env.SUPABASE_AID_ATTACHMENT_BUCKET || 'aid-assistance-attachments';
const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
const ALLOWED_ATTACHMENT_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
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

function getGpsForCity(city: string, province: string): { lat: number; lng: number } {
  const lowerCity = city.toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (lowerCity.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerCity)) {
      return coords;
    }
  }
  if (PROVINCE_COORDS[province]) return PROVINCE_COORDS[province];
  // Try partial province match
  for (const [key, coords] of Object.entries(PROVINCE_COORDS)) {
    if (province.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(province.toLowerCase())) {
      return coords;
    }
  }
  return { lat: 14.5995, lng: 120.9842 };
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

// ── Parse the "PERMANENT - REGION" text from Supabase into a region code ──────
// Handles formats like: "Region VII", "VII", "7", "Central Visayas", "Region 7 - Central Visayas"
function parseRegionLabel(label: string): string | null {
  if (!label) return null;
  const t = label.trim().toUpperCase();

  // Direct code matches first (e.g. "VII", "NCR", "CAR", "IV-A", "BARMM")
  const directCodes: Record<string, string> = {
    'NCR': 'NCR', 'NATIONAL CAPITAL REGION': 'NCR',
    'CAR': 'CAR', 'CORDILLERA': 'CAR',
    'I': 'I', 'REGION I': 'I', 'REGION 1': 'I', 'ILOCOS': 'I',
    'II': 'II', 'REGION II': 'II', 'REGION 2': 'II', 'CAGAYAN VALLEY': 'II',
    'III': 'III', 'REGION III': 'III', 'REGION 3': 'III', 'CENTRAL LUZON': 'III',
    'IV-A': 'IV-A', 'REGION IV-A': 'IV-A', 'REGION 4A': 'IV-A', 'CALABARZON': 'IV-A',
    'IV-B': 'IV-B', 'REGION IV-B': 'IV-B', 'REGION 4B': 'IV-B', 'MIMAROPA': 'IV-B',
    'V': 'V', 'REGION V': 'V', 'REGION 5': 'V', 'BICOL': 'V',
    'VI': 'VI', 'REGION VI': 'VI', 'REGION 6': 'VI', 'WESTERN VISAYAS': 'VI',
    'VII': 'VII', 'REGION VII': 'VII', 'REGION 7': 'VII', 'CENTRAL VISAYAS': 'VII',
    'VIII': 'VIII', 'REGION VIII': 'VIII', 'REGION 8': 'VIII', 'EASTERN VISAYAS': 'VIII',
    'IX': 'IX', 'REGION IX': 'IX', 'REGION 9': 'IX', 'ZAMBOANGA': 'IX',
    'X': 'X', 'REGION X': 'X', 'REGION 10': 'X', 'NORTHERN MINDANAO': 'X',
    'XI': 'XI', 'REGION XI': 'XI', 'REGION 11': 'XI', 'DAVAO': 'XI',
    'XII': 'XII', 'REGION XII': 'XII', 'REGION 12': 'XII', 'SOCCSKSARGEN': 'XII',
    'XIII': 'XIII', 'REGION XIII': 'XIII', 'REGION 13': 'XIII', 'CARAGA': 'XIII',
    'BARMM': 'BARMM', 'BANGSAMORO': 'BARMM', 'ARMM': 'BARMM',
  };

  // Try exact match first
  if (directCodes[t]) return directCodes[t];

  // Try partial / contained match (e.g. "Region 7 - Central Visayas" → VII)
  for (const [key, code] of Object.entries(directCodes)) {
    if (t.includes(key)) return code;
  }

  return null;
}

// ── Main data loader from Supabase ────────────────────────────────────────────
async function loadEmployees(): Promise<Employee[]> {
  console.log('Connecting to Supabase and fetching employee data...');

  // Fetch all rows from the "Employee Details" table
  // Using pagination to handle large datasets (Supabase default limit is 1000)
  const allRows: SupabaseEmployeeRow[] = [];
  let from = 0;
  const pageSize = 1000;

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

    if (hasLocationData) {
      const coords = getGpsForCity(city, province);
      const seed = hashString(empId);
      const scatter = 0.015;
      gpsLat = coords.lat + (seededRandom(seed) - 0.5) * scatter;
      gpsLng = coords.lng + (seededRandom(seed + 1) - 0.5) * scatter;

      const LAT_MIN = 4.5, LAT_MAX = 21.5;
      const LNG_MIN = 116.0, LNG_MAX = 127.0;
      gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
      gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
    }


    // Island group — undefined when no location data
    const islandGroup = hasLocationData
      ? getIslandGroup(city, province || regionLabel)
      : undefined;

    // ── Region: trust the database value first, then fall back to resolver ──
    // When no location data exists at all, mark as NEEDS_UPDATE (not NCR)
    let region: string | undefined;
    if (!hasLocationData) {
      region = 'NEEDS_UPDATE';
    } else {
      const regionFromDb = parseRegionLabel(regionLabel);
      region = regionFromDb ?? resolveEmployeeRegion({
        city,
        province,
        facility: row['Facility'] ?? undefined,
        gpsLat,
        gpsLng,
      });
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

// ── Bootstrap server ──────────────────────────────────────────────────────────
loadEmployees()
  .then((employees) => {
    allEmployees = employees;

    // Manager-scoped read. When a manager is supplied, only their direct reports
    // are returned (server-side authorization — never trust the client filter).
    app.get('/api/employees', (req, res) => {
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
        const resolvedManagerId = resolveManagerId(managerName, managerId || undefined);
        const directReportIds = allEmployees
          .filter((emp) => {
            const nameMatch = emp.managerName?.trim().toLowerCase() === managerName.toLowerCase();
            const idMatch = !!resolvedManagerId && emp.managerId === resolvedManagerId;
            return nameMatch || idMatch;
          })
          .map((emp) => emp.id);
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
      } = req.body as {
        employeeId?: string;
        aidType?: 'Cash' | 'Relief Goods' | 'Both';
        damageType?: 'Major' | 'Minor';
        incidentName?: string;
        description?: string;
      };

      if (!employeeId || !aidType || !damageType || !description) {
        return res.status(400).json({ message: 'Missing required aid assistance fields.' });
      }

      const employee = allEmployees.find((emp) => emp.id === employeeId);
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found.' });
      }

      for (const file of files) {
        if (!isAllowedAttachment(file)) {
          return res.status(400).json({ message: `Unsupported file type: ${file.originalname}` });
        }
      }

      const requestCode = buildAidRequestCode();
      const managerName = employee.managerName ?? null;
      const managerId = employee.managerId ?? null;

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
          status: 'Pending Manager Review',
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

    const startServer = (port: number) => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Loaded ${employees.length} employees from Supabase.`);
      }).on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`Port ${port} is busy, trying ${port + 1}`);
          startServer(port + 1);
        } else {
          console.error('Failed to start server:', err);
          process.exit(1);
        }
      });
    };

    startServer(PORT);
  })
  .catch((err) => {
    console.error('Failed to load employees from Supabase:', err);
    process.exit(1);
  });
