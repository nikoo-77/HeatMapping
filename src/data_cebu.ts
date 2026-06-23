// Cebu Geographic and Workforce Data Profile
// Matching the Innodata / Savills "Cebu Employee Distribution Map"

export interface CebuLocation {
  name: string;
  fte: number;
  lat: number;
  lng: number;
  isMetro: boolean;
}

export const CEBU_LOCATIONS: CebuLocation[] = [
  { name: 'Cebu City', fte: 6, lat: 10.3157, lng: 123.8854, isMetro: true },
  { name: 'Mandaue City', fte: 4, lat: 10.3446, lng: 123.9392, isMetro: true },
  { name: 'Lapu-Lapu City', fte: 5, lat: 10.3156, lng: 123.9784, isMetro: true },
  { name: 'Talisay City', fte: 2, lat: 10.2592, lng: 123.8393, isMetro: true },
  { name: 'Cordova', fte: 1, lat: 10.2618, lng: 123.9515, isMetro: true },
  { name: 'Consolacion', fte: 1, lat: 10.3791, lng: 123.9664, isMetro: true },
  { name: 'Liloan', fte: 1, lat: 10.4005, lng: 123.9995, isMetro: true }
];

// Helper to generate names
const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Theresa', 'Pedro', 'Ana', 'Ramon', 'Mary', 'Michael',
  'Sarah', 'John', 'Estella', 'Kenneth', 'Francis', 'Joy', 'Manuel', 'Corazon', 'Antonio',
  'Sonia', 'Leo', 'Marites', 'Dexter', 'Grace', 'Rolly', 'Junjun', 'Lina', 'Roberto'
];

const LAST_NAMES = [
  'Santos', 'Luna', 'Rodriguez', 'Magsaysay', 'Cruz', 'Lapid', 'Pacquiao', 'Ilustre',
  'Silang', 'Go', 'Tan', 'Lim', 'Sy', 'Ouano', 'Ceniza', 'Cabahug', 'Bacalso', 'Sybico',
  'Radaza', 'Tecson', 'Fernandez', 'Alcantara', 'Abad', 'Reyes', 'Villamor', 'Gomez'
];

const ROLES = [
  'Data Analyst', 'Subject Matter Expert', 'Solutions Consultant', 'GIS Specialist',
  'Software Engineer', 'Senior GIS Analyst', 'Commercial Broker', 'Valuation Expert',
  'Quality Controller', 'Operations Team Analyst', 'System Admin', 'Client Manager'
];

const DEPARTMENTS = [
  'AI Operations', 'GIS & Remote Sensing', 'Valuation Services', 'Real Estate Analytics',
  'Data Engineering', 'QC & Audit', 'Solutions Group', 'Infrastructure Management'
];

const CARRIERS: ('Globe' | 'Smart' | 'DITO')[] = ['Globe', 'Smart', 'DITO'];

// Seeded random helper to ensure consistency
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

import { Employee } from './types';

export function generateAllCebuEmployees(): Employee[] {
  const employees: Employee[] = [];
  let trackerId = 1;

  CEBU_LOCATIONS.forEach((location) => {
    const targetFTE = location.fte;
    for (let i = 0; i < targetFTE; i++) {
      const seed = trackerId * 17 + i * 31;
      const r1 = seededRandom(seed);
      const r2 = seededRandom(seed + 1);
      const r3 = seededRandom(seed + 2);
      const r4 = seededRandom(seed + 3);
      const r5 = seededRandom(seed + 4);

      const firstName = FIRST_NAMES[Math.floor(r1 * FIRST_NAMES.length)];
      const lastName = LAST_NAMES[Math.floor(r2 * LAST_NAMES.length)];
      const name = `${firstName} ${lastName}`;
      
      const role = ROLES[Math.floor(r3 * ROLES.length)];
      const department = DEPARTMENTS[Math.floor(r4 * DEPARTMENTS.length)];
      const carrier = CARRIERS[r5 < 0.55 ? 0 : r5 < 0.93 ? 1 : 2]; // 55% Globe, 38% Smart, 7% DITO

      // Slightly scatter coordinates around the municipality town center for visual clustering
      // Smaller scatter for smaller places, up to 0.02 deg scatter for cities
      const scatterFactor = 0.024;
      const latOffset = (seededRandom(seed + 5) - 0.5) * scatterFactor;
      const lngOffset = (seededRandom(seed + 6) - 0.5) * scatterFactor;

      const lat = location.lat + latOffset;
      const lng = location.lng + lngOffset;

      const battery = Math.round(30 + seededRandom(seed + 7) * 70);
      const normalSignalStrength = -120 + Math.round(seededRandom(seed + 8) * 60); // -120 to -60 dBm

      // Linear inverse of lat/lng to grid (0-100)
      // Matches the formulas in customToLatLng/latLngToCustom
      const LAT_MIN = 10.245, LAT_MAX = 10.355;
      const LNG_MIN = 123.82, LNG_MAX = 123.99;
      const gridY = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100;
      const gridX = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;

      const avatar = firstName[0] + lastName[0];

      employees.push({
        id: `emp-cebu-${trackerId}`,
        name,
        role,
        department,
        lat: parseFloat(gridY.toFixed(2)),
        lng: parseFloat(gridX.toFixed(2)),
        gpsLat: parseFloat(lat.toFixed(5)),
        gpsLng: parseFloat(lng.toFixed(5)),
        carrier,
        normalSignalStrength,
        battery,
        status: seededRandom(seed + 9) > 0.92 ? 'Yellow' : 'Green', // start safe
        avatar,
        address: `${location.name}, Cebu, Philippines`,
      });

      trackerId++;
    }
  });

  return employees;
}
