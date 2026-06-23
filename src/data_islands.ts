// Philippine Island Groups – Workforce Data Distribution
// Covers the three primary island groups: Luzon, Visayas, Mindanao

import { Employee } from './types';

// ─── Seeded random helper ────────────────────────────────────────────────────
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── Shared name pools ───────────────────────────────────────────────────────
const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Theresa', 'Pedro', 'Ana', 'Ramon', 'Mary',
  'Michael', 'Sarah', 'John', 'Estella', 'Kenneth', 'Francis', 'Joy',
  'Manuel', 'Corazon', 'Antonio', 'Sonia', 'Leo', 'Marites', 'Dexter',
  'Grace', 'Rolly', 'Lina', 'Roberto', 'Bea', 'Carlo', 'Pia', 'Gino',
  'Trisha', 'Arvin', 'Donna', 'Rodel', 'Sheila', 'Marlon',
];

const LAST_NAMES = [
  'Santos', 'Luna', 'Rodriguez', 'Magsaysay', 'Cruz', 'Lapid', 'Ilustre',
  'Silang', 'Go', 'Tan', 'Lim', 'Sy', 'Reyes', 'Villamor', 'Gomez',
  'Flores', 'Ramos', 'Bautista', 'Manalo', 'Mendoza', 'Garcia', 'Torres',
  'Aguilar', 'Dela Cruz', 'Valdez', 'Navarro', 'Castillo', 'Aquino',
  'Soriano', 'Panganiban',
];

const ROLES = [
  'Data Analyst', 'Subject Matter Expert', 'Solutions Consultant', 'GIS Specialist',
  'Software Engineer', 'Senior GIS Analyst', 'Commercial Broker', 'Valuation Expert',
  'Quality Controller', 'Operations Team Analyst', 'System Admin', 'Client Manager',
  'HR Business Partner', 'Finance Officer', 'Project Manager', 'Field Coordinator',
];

const DEPARTMENTS = [
  'AI Operations', 'GIS & Remote Sensing', 'Valuation Services', 'Real Estate Analytics',
  'Data Engineering', 'QC & Audit', 'Solutions Group', 'Infrastructure Management',
  'People Operations', 'Finance', 'Security', 'Field Services',
];

const CARRIERS: ('Globe' | 'Smart' | 'DITO')[] = ['Globe', 'Smart', 'DITO'];

// ─── Luzon Locations ─────────────────────────────────────────────────────────
export interface IslandLocation {
  name: string;
  city: string;
  province: string;
  islandGroup: 'Luzon' | 'Visayas' | 'Mindanao';
  fte: number;
  gpsLat: number;
  gpsLng: number;
}

export const LUZON_LOCATIONS: IslandLocation[] = [
  { name: 'Makati CBD', city: 'Makati City', province: 'Metro Manila', islandGroup: 'Luzon', fte: 8, gpsLat: 14.5547, gpsLng: 121.0244 },
  { name: 'BGC Taguig Hub', city: 'Taguig City', province: 'Metro Manila', islandGroup: 'Luzon', fte: 6, gpsLat: 14.5176, gpsLng: 121.0509 },
  { name: 'Quezon City North', city: 'Quezon City', province: 'Metro Manila', islandGroup: 'Luzon', fte: 5, gpsLat: 14.6760, gpsLng: 121.0437 },
  { name: 'Alabang South', city: 'Muntinlupa City', province: 'Metro Manila', islandGroup: 'Luzon', fte: 4, gpsLat: 14.4200, gpsLng: 121.0451 },
  { name: 'Clark Freeport', city: 'Angeles City', province: 'Pampanga', islandGroup: 'Luzon', fte: 3, gpsLat: 15.1854, gpsLng: 120.5614 },
  { name: 'Sta. Rosa Technohub', city: 'Sta. Rosa', province: 'Laguna', islandGroup: 'Luzon', fte: 3, gpsLat: 14.2776, gpsLng: 121.1114 },
  { name: 'Nuvali Calamba', city: 'Calamba City', province: 'Laguna', islandGroup: 'Luzon', fte: 2, gpsLat: 14.2114, gpsLng: 121.1648 },
];

// ─── Visayas Locations ────────────────────────────────────────────────────────
export const VISAYAS_LOCATIONS: IslandLocation[] = [
  { name: 'Cebu IT Park', city: 'Cebu City', province: 'Cebu', islandGroup: 'Visayas', fte: 7, gpsLat: 10.3311, gpsLng: 123.9053 },
  { name: 'Lapu-Lapu MCIA', city: 'Lapu-Lapu City', province: 'Cebu', islandGroup: 'Visayas', fte: 5, gpsLat: 10.3156, gpsLng: 123.9784 },
  { name: 'Mandaue Industrial', city: 'Mandaue City', province: 'Cebu', islandGroup: 'Visayas', fte: 4, gpsLat: 10.3446, gpsLng: 123.9392 },
  { name: 'Iloilo Business Park', city: 'Iloilo City', province: 'Iloilo', islandGroup: 'Visayas', fte: 4, gpsLat: 10.6967, gpsLng: 122.5644 },
  { name: 'Bacolod Northgate', city: 'Bacolod City', province: 'Negros Occidental', islandGroup: 'Visayas', fte: 3, gpsLat: 10.6768, gpsLng: 122.9509 },
  { name: 'Tacloban Metro', city: 'Tacloban City', province: 'Leyte', islandGroup: 'Visayas', fte: 2, gpsLat: 11.2543, gpsLng: 125.0000 },
  { name: 'Talisay SRP', city: 'Talisay City', province: 'Cebu', islandGroup: 'Visayas', fte: 2, gpsLat: 10.2592, gpsLng: 123.8393 },
];

// ─── Mindanao Locations ───────────────────────────────────────────────────────
export const MINDANAO_LOCATIONS: IslandLocation[] = [
  { name: 'Davao CBD', city: 'Davao City', province: 'Davao del Sur', islandGroup: 'Mindanao', fte: 7, gpsLat: 7.0708, gpsLng: 125.6087 },
  { name: 'Cagayan de Oro Hub', city: 'Cagayan de Oro', province: 'Misamis Oriental', islandGroup: 'Mindanao', fte: 5, gpsLat: 8.4542, gpsLng: 124.6319 },
  { name: 'Zamboanga City', city: 'Zamboanga City', province: 'Zamboanga del Sur', islandGroup: 'Mindanao', fte: 3, gpsLat: 6.9214, gpsLng: 122.0790 },
  { name: 'General Santos Hub', city: 'General Santos City', province: 'South Cotabato', islandGroup: 'Mindanao', fte: 3, gpsLat: 6.1128, gpsLng: 125.1717 },
  { name: 'Iligan Industrial', city: 'Iligan City', province: 'Lanao del Norte', islandGroup: 'Mindanao', fte: 2, gpsLat: 8.2281, gpsLng: 124.2452 },
  { name: 'Butuan Valley', city: 'Butuan City', province: 'Agusan del Norte', islandGroup: 'Mindanao', fte: 2, gpsLat: 8.9480, gpsLng: 125.5436 },
];

export const ALL_ISLAND_LOCATIONS: IslandLocation[] = [
  ...LUZON_LOCATIONS,
  ...VISAYAS_LOCATIONS,
  ...MINDANAO_LOCATIONS,
];

// ─── Grid Mapping Helpers ─────────────────────────────────────────────────────
// The grid is 0-100 where Y=0 is top (north) and X=0 is left (west)
// We use the same Cebu bounding box as the map when island view is active
// For the island group employees we just use gpsLat/gpsLng for real coords
// and fake a grid coord that positions them reasonably
function gpsToGrid(gpsLat: number, gpsLng: number): { gridX: number; gridY: number } {
  // Use a broad Philippines bounding box for grid mapping
  const LAT_MIN = 4.5, LAT_MAX = 21.5;
  const LNG_MIN = 116.0, LNG_MAX = 127.0;
  const gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
  const gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
  return {
    gridX: parseFloat(Math.max(0, Math.min(100, gridX)).toFixed(2)),
    gridY: parseFloat(Math.max(0, Math.min(100, gridY)).toFixed(2)),
  };
}

// ─── Employee Generator ───────────────────────────────────────────────────────
export function generateAllIslandEmployees(): Employee[] {
  const employees: Employee[] = [];
  let trackerId = 1;

  ALL_ISLAND_LOCATIONS.forEach((location) => {
    for (let i = 0; i < location.fte; i++) {
      const seed = trackerId * 23 + i * 41 + location.islandGroup.length * 7;
      const r1 = seededRandom(seed);
      const r2 = seededRandom(seed + 1);
      const r3 = seededRandom(seed + 2);
      const r4 = seededRandom(seed + 3);
      const r5 = seededRandom(seed + 4);

      const firstName = FIRST_NAMES[Math.floor(r1 * FIRST_NAMES.length)];
      const lastName  = LAST_NAMES [Math.floor(r2 * LAST_NAMES.length)];
      const name      = `${firstName} ${lastName}`;
      const role      = ROLES      [Math.floor(r3 * ROLES.length)];
      const department= DEPARTMENTS[Math.floor(r4 * DEPARTMENTS.length)];
      // Carrier distribution: 50% Globe, 38% Smart, 12% DITO
      const carrier   = CARRIERS[r5 < 0.50 ? 0 : r5 < 0.88 ? 1 : 2];

      // Scatter GPS slightly around the city centre
      const scatter = 0.018;
      const gpsLat = location.gpsLat + (seededRandom(seed + 5) - 0.5) * scatter;
      const gpsLng = location.gpsLng + (seededRandom(seed + 6) - 0.5) * scatter;

      const { gridX, gridY } = gpsToGrid(gpsLat, gpsLng);

      const battery            = Math.round(20 + seededRandom(seed + 7) * 80);
      const normalSignalStrength = -120 + Math.round(seededRandom(seed + 8) * 60);
      const statusSeed         = seededRandom(seed + 9);
      const status = statusSeed > 0.92 ? 'Yellow' : 'Green';

      employees.push({
        id: `emp-island-${trackerId}`,
        name,
        role,
        department,
        lat: gridY,
        lng: gridX,
        gpsLat: parseFloat(gpsLat.toFixed(5)),
        gpsLng: parseFloat(gpsLng.toFixed(5)),
        carrier,
        normalSignalStrength,
        battery,
        status: status as 'Green' | 'Yellow',
        avatar: firstName[0] + lastName[0],
        address: `${location.name}, ${location.city}, ${location.province}`,
        islandGroup: location.islandGroup,
      });

      trackerId++;
    }
  });

  return employees;
}
