import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if present
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { resolveEmployeeRegion } from './lib/regionResolver.js';

const app = express();
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

// ── Bootstrap server ──────────────────────────────────────────────────────────
loadEmployees()
  .then((employees) => {
    app.get('/api/employees', (_req, res) => {
      res.json(employees);
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
