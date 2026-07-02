import 'dotenv/config';
import express from 'express';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { resolveEmployeeRegion } from './lib/regionResolver.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);

interface Employee {
  id: string;
  name: string;
  role: string;
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
  team?: 'HR/CSR' | 'Manager';
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
  return { lat: 14.5995, lng: 120.9842 };
}

function getIslandGroup(city: string, province: string): 'Luzon' | 'Visayas' | 'Mindanao' {
  const p = province.toLowerCase();
  
  if (p.includes('ncr') || p.includes('national capital')) return 'Luzon';
  if (p.includes('region i') || p.includes('region ii') || p.includes('region iii') ||
      p.includes('region iv-a') || p.includes('region iv-b') || p.includes('region v') ||
      p.includes('car') || p.includes('cordillera')) return 'Luzon';
  
  const luzonProvinces = ['metro manila', 'pampanga', 'laguna', 'bulacan', 'rizal', 'cavite', 'batangas',
                          'camarines norte', 'camarines sur', 'albay', 'sorsogon', 'masbate', 'catanduanes',
                          'tarlac', 'nueva ecija', 'pangasinan', 'la union'];
  if (luzonProvinces.some(lp => p.includes(lp))) return 'Luzon';
  
  if (p.includes('region x') || p.includes('region xi') || p.includes('region xii') ||
      p.includes('region xiii') || p.includes('bangsamoro') || p.includes('caraga')) return 'Mindanao';
  const mindanaoProvinces = ['davao', 'misamis', 'zamboanga', 'cotabato', 'sultan kudarat', 'maguindanao',
                             'lanao', 'agusan', 'surigao', 'camiguin', 'bukidnon'];
  if (mindanaoProvinces.some(mp => p.includes(mp))) return 'Mindanao';
  
  return 'Visayas';
}

function parseColumns(raw: string): string[] {
  return raw.split('], [').map((c) => c.replace(/^\[|\]$/g, ''));
}

function splitSqlValues(valuesPart: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < valuesPart.length; i++) {
    const c = valuesPart[i];
    if (inString) {
      if (c === "'" && valuesPart[i + 1] === "'") {
        current += valuesPart[++i];
        continue;
      }
      if (c === "'") {
        inString = false;
        continue;
      }
      current += c;
      continue;
    }
    if (c === 'N' && valuesPart[i + 1] === "'") {
      i++;
      inString = true;
      continue;
    }
    if (c === "'") {
      inString = true;
      continue;
    }
    if (c === ',') {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

function parseSqlValue(raw: string): string | number | boolean | null {
  const v = raw.trim();
  if (v.toUpperCase() === 'NULL') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (v === '0' || v === '1') return v === '1';
  if ((v.startsWith("N'") || v.startsWith("'")) && v.endsWith("'")) {
    return v.slice(v.startsWith("N'") ? 2 : 1, -1).replace(/''/g, "'");
  }
  return v;
}

function parseInsertLine(line: string): { table: string; columns: string[]; values: unknown[] } | null {
  const match = line.match(/^INSERT \[dbo\]\.\[(\w+)\] \((.+)\) VALUES \((.+)\)$/);
  if (!match) return null;
  const table = match[1];
  const columns = parseColumns(match[2]);
  const values = splitSqlValues(match[3]).map(parseSqlValue);
  return { table, columns, values };
}

async function loadEmployees(): Promise<Employee[]> {
  const sqlFile = resolve(process.cwd(), 'database_setup.sql');
  
  const departments = new Map<number, string>();
  const empPersonalMap = new Map<string, Record<string, unknown>>();
  const empInfoByEmpId = new Map<string, Record<string, unknown>>();
  const contactByEmpId = new Map<string, Record<string, unknown>>();
  const addressByEmpId = new Map<string, Record<string, unknown>>();
  
  const wantedTables = new Set(['Department', 'EmpPersonalDetails', 'EmployeeInfo', 'Contact', 'Address']);
  
  const rl = createInterface({
    input: createReadStream(sqlFile, { encoding: 'utf16le' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    const match = trimmed.match(/^INSERT \[dbo\]\.\[(\w+)\] \((.+)\) VALUES \((.+)\)$/);
    if (!match) continue;
    
    const table = match[1];
    if (!wantedTables.has(table)) continue;
    
    const columns = parseColumns(match[2]);
    const values = splitSqlValues(match[3]).map(parseSqlValue);
    
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    
    if (table === 'Department') {
      departments.set(row.DepartmentId as number, row.DepartmentName as string);
    } else if (table === 'EmpPersonalDetails') {
      empPersonalMap.set(row.EmployeeId as string, row);
    } else if (table === 'EmployeeInfo') {
      empInfoByEmpId.set(row.EmployeeId as string, row);
    } else if (table === 'Contact') {
      contactByEmpId.set(row.EmployeeId as string, row);
    } else if (table === 'Address') {
      addressByEmpId.set(row.EmployeeId as string, row);
    }
  }

  const employees: Employee[] = [];
  
  for (const [empId, personal] of empPersonalMap) {
    const info = empInfoByEmpId.get(empId);
    const contact = contactByEmpId.get(empId);
    const address = addressByEmpId.get(empId);
    const deptName = info?.DepartmentId != null 
      ? departments.get(info.DepartmentId as number) 
      : undefined;
    
    const city = (address?.CityMunicipality as string) || '';
    const province = (address?.Province as string) || '';
    const coords = getGpsForCity(city, province);
    
    const seed = hashString(empId);
    const scatter = 0.015;
    const gpsLat = coords.lat + (seededRandom(seed) - 0.5) * scatter;
    const gpsLng = coords.lng + (seededRandom(seed + 1) - 0.5) * scatter;

    const LAT_MIN = 4.5, LAT_MAX = 21.5;
    const LNG_MIN = 116.0, LNG_MAX = 127.0;
    const gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
    const gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;

    const islandGroup = getIslandGroup(city, province);
    const region = resolveEmployeeRegion({
      city,
      province,
      facility: info?.Facility as string | undefined,
      gpsLat,
      gpsLng,
    });

    const rawPhone = contact?.ContactNumber as string | number | undefined;
    const cleanPhone = rawPhone && !String(rawPhone).toUpperCase().includes('FOR UPDATE') ? `0${rawPhone}` : undefined;
    
    const completeAddress = address?.CompleteAddress as string | undefined;
    const cleanAddress = completeAddress && !String(completeAddress).toUpperCase().includes('FOR UPDATE') 
      ? completeAddress 
      : undefined;
    const addressStr = cleanAddress 
      ? `${cleanAddress}, ${city}, ${province}` 
      : `${city}, ${province}`;

    employees.push({
      id: String(empId),
      name: personal.EmployeeName as string,
      role: (info?.EmployeeRole as string) || (info?.Position as string) || 'Employee',
      department: deptName || 'Unknown',
      lat: parseFloat(Math.max(0, Math.min(100, gridY)).toFixed(2)),
      lng: parseFloat(Math.max(0, Math.min(100, gridX)).toFixed(2)),
      gpsLat: parseFloat(gpsLat.toFixed(5)),
      gpsLng: parseFloat(gpsLng.toFixed(5)),
      carrier: ['Globe', 'Smart', 'DITO'][Math.floor(seededRandom(seed + 2) * 3)] as 'Globe' | 'Smart' | 'DITO',
      normalSignalStrength: -120 + Math.round(seededRandom(seed + 3) * 60),
      battery: Math.round(20 + seededRandom(seed + 4) * 80),
      status: seededRandom(seed + 5) > 0.92 ? 'Yellow' : 'Green' as 'Green' | 'Yellow',
      phone: cleanPhone,
      email: personal.EmailAddress as string,
      avatar: `${(personal.FirstName as string)[0]}${(personal.LastName as string)[0]}`,
      address: addressStr,
      islandGroup,
      region,
      team: info?.IsManager ? 'Manager' : 'HR/CSR' as 'HR/CSR' | 'Manager',
    });
  }
  
  return employees;
}

loadEmployees()
  .then((employees) => {
    app.get('/api/employees', (_req, res) => {
      res.json(employees);
    });

    const startServer = (port: number) => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Loaded ${employees.length} employees from database_setup.sql`);
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
    console.error('Failed to load employees:', err);
    process.exit(1);
  });
