import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LUZON_LOCATIONS, VISAYAS_LOCATIONS, MINDANAO_LOCATIONS, generateAllIslandEmployees, PHILIPPINE_REGIONS, ALL_ISLAND_LOCATIONS, REGION_BY_CODE } from './data_islands';
import { resolveEmployeeRegion, getRegionLabel } from './utils/resolveRegion';
import { Employee, SafetyStatus, DisasterConfig, EmployeeTeam, AidApplication } from './types';
import InteractiveMap from './components/InteractiveMap';
import RiskMap from './components/RiskMap';
import EmployeeRollCall from './components/EmployeeRollCall';
import { exportCalamityReportEmployees } from './utils/exportEmployeeReport';
import LoginPage from './components/LoginPage';
import { 
  ShieldAlert, Activity, Send, CheckCircle, Info, RefreshCw,
  AlertOctagon, Sparkles, Map as MapIcon, Compass, Radio, Users, Battery, Search, HelpCircle, AlertTriangle,
  FileWarning, X, MapPin, Crosshair, LayoutDashboard, BookUser, ClipboardList, FileSpreadsheet, Plus, MoreVertical, Trash2,
  HeartHandshake, Siren, ShieldCheck, TrendingUp, DollarSign, Clock, ChevronRight, BadgeCheck, Zap, Layers
} from 'lucide-react';

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getEmployeeCity(emp: Employee): string | null {
  const address = (emp.address ?? '').trim();
  const addressText = normalizeText(address);

  const knownCities = ALL_ISLAND_LOCATIONS.map((loc) => loc.city);
  const match = knownCities.find((city) => {
    const cityText = normalizeText(city);
    return cityText.includes(addressText) || addressText.includes(cityText);
  });

  if (match) return match;

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2] || null;
  }

  return null;
}

type CalamityReportRecord = {
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
};

type PendingEmployeeReportRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeAvatar: string;
  timestamp: string;
  type: 'Fire' | 'Earthquake' | 'Typhoon' | 'Other';
  incidentName: string;
  locationLabel: string;
  lat: number;
  lng: number;
  description: string;
  status: 'Pending' | 'Approved' | 'Rejected';
};

type IncidentSessionSnapshot = {
  simulationActive: boolean;
  epicenter: { lat: number; lng: number; radiusKm: number };
  activeDisaster: DisasterConfig;
  resolvedReports: Record<string, boolean>;
};

const INCIDENT_STORAGE_KEYS = {
  calamityReports: 'island_map_calamity_reports',
  pendingReports: 'island_map_pending_employee_reports',
  resolvedReports: 'island_map_resolved_reports',
  incidentSession: 'island_map_incident_session',
} as const;

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

function readCalamityReportsFromStorage(): CalamityReportRecord[] {
  const parsed = readJsonStorage<unknown>(INCIDENT_STORAGE_KEYS.calamityReports, []);
  return Array.isArray(parsed) ? (parsed as CalamityReportRecord[]) : [];
}

function readPendingReportsFromStorage(): PendingEmployeeReportRecord[] {
  const parsed = readJsonStorage<unknown>(INCIDENT_STORAGE_KEYS.pendingReports, []);
  return Array.isArray(parsed) ? (parsed as PendingEmployeeReportRecord[]) : [];
}

function readResolvedReportsFromStorage(): Record<string, boolean> {
  const parsed = readJsonStorage<unknown>(INCIDENT_STORAGE_KEYS.resolvedReports, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, boolean>)
    : {};
}

function readIncidentSessionFromStorage(): IncidentSessionSnapshot | null {
  const parsed = readJsonStorage<unknown>(INCIDENT_STORAGE_KEYS.incidentSession, null);
  if (!parsed || typeof parsed !== 'object') return null;
  const session = parsed as Partial<IncidentSessionSnapshot>;
  if (!session.epicenter || !session.activeDisaster) return null;
  return {
    simulationActive: Boolean(session.simulationActive),
    epicenter: session.epicenter,
    activeDisaster: session.activeDisaster,
    resolvedReports: session.resolvedReports ?? {},
  };
}

function createDefaultActiveDisaster(): DisasterConfig {
  return {
    id: 'fire',
    name: 'Dense Residential Block Fire',
    subName: 'Barangay Fire Hazard Outbreak',
    icon: 'fire',
    color: 'orange',
    colorClass: 'text-orange-700 bg-orange-50 border-orange-200',
    hexColor: '#f97316',
    defaultX: 10.3311,
    defaultY: 123.9053,
    defaultRadius: 5,
    locationName: 'Cebu IT Park Area',
    description: 'An intense, rapid, localized residential conflagration causing dangerous thermal plumes, thick carbon fumes, and utility wire power shutdowns.',
    greenTemplates: [
      'Thick black smoke clouds. Evacuated sector safely.',
      'Local power grid isolated for security. Standing by safe.',
      'Fire trucks actively clearing perimeter. All clear.',
      'Evacuated structure immediately. safe at compound.',
      'Assembled at barangay community oval. Secure and accounted.',
      'Safe. Fire controlled 4 houses away, moving to safety line.'
    ],
    replyTemplates: [
      'House cleared. Evacuated block to relative safe ground.',
      'Escape path clear. No injuries. Commencing safety reports.',
      'Safe at nearby commercial parking zone. Fire truck at scene.',
      'Safe. Smoke dissipating. Family sheltered at central oval.',
      'Fire wall contained. Safe in secondary barangay line.',
      'Cleared dense housing alley safely. In touch with marshals.'
    ]
  };
}

function clearIncidentStorage() {
  localStorage.removeItem(INCIDENT_STORAGE_KEYS.calamityReports);
  localStorage.removeItem(INCIDENT_STORAGE_KEYS.pendingReports);
  localStorage.removeItem(INCIDENT_STORAGE_KEYS.resolvedReports);
  localStorage.removeItem(INCIDENT_STORAGE_KEYS.incidentSession);
}

export default function App() {
  // ── Authentication ─────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: 'official' | 'admin' | 'manager' }>({ username: '', role: 'official' });
  const [officialAccountEmails, setOfficialAccountEmails] = useState<string[]>([]);
  const [employeeAidForm, setEmployeeAidForm] = useState({
    aidType: 'Cash' as 'Cash' | 'Relief Goods' | 'Both',
    amountPhp: '',
    description: '',
    priority: 'Normal' as 'Normal' | 'Urgent',
    incidentName: '',
  });
  const [employeeIncidentForm, setEmployeeIncidentForm] = useState({
    type: 'Fire' as 'Fire' | 'Earthquake' | 'Typhoon' | 'Other',
    description: '',
    locationLabel: '',
    incidentName: '',
    lat: 0,
    lng: 0,
    locationPinned: false,
    iAmVictim: true,
  });
  const [employeePortalMessage, setEmployeePortalMessage] = useState('');
  const [employeePortalPage, setEmployeePortalPage] = useState<'dashboard' | 'checkin' | 'alerts' | 'aid' | 'profile' | 'contacts' | 'notifications'>('dashboard');
  const [managerCheckInRequest, setManagerCheckInRequest] = useState({
    active: true,
    title: 'Your manager requested a quick safety check-in for your area.',
    due: 'Today, 5:00 PM',
    requestedBy: 'Area Manager',
  });
  const [locationUpdate, setLocationUpdate] = useState('');

  // ── Page navigation ─────────────────────────────────────────────────────
  const [activePage, setActivePage] = useState<'dashboard' | 'directory' | 'incidents' | 'safety' | 'aid' | 'executive' | 'risk-map' | 'team-overview'>('dashboard');
  // Employee Directory search/filter state
  const [dirSearch, setDirSearch] = useState('');
  const [dirDept,   setDirDept]   = useState('All Departments');
  const [dirIsland, setDirIsland] = useState<'All' | 'Luzon' | 'Visayas' | 'Mindanao'>('All');
  const [dirRegion, setDirRegion] = useState<string>('All');
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [dirActionsMenuId, setDirActionsMenuId] = useState<string | null>(null);
  const [newEmpForm, setNewEmpForm] = useState({
    name: '',
    role: 'Data Analyst',
    department: 'AI Operations',
    phone: '',
    email: '',
    address: '',
    islandGroup: 'Luzon' as 'Luzon' | 'Visayas' | 'Mindanao',
    gpsLat: 14.5995,
    gpsLng: 120.9842,
  });

  // ── Calamity Report History ──────────────────────────────────────────────
  const [calamityReports, setCalamityReports] = useState<CalamityReportRecord[]>(() => readCalamityReportsFromStorage());

  // ── Pending Employee Calamity Reports (awaiting manager approval) ────────
  const [pendingEmployeeReports, setPendingEmployeeReports] = useState<PendingEmployeeReportRecord[]>(() => readPendingReportsFromStorage());

  // Geocoding state for the employee Calamity Report map
  const [empIsGeocoding, setEmpIsGeocoding] = useState(false);
  const [empGeocodeError, setEmpGeocodeError] = useState<string | null>(null);

  // Track which report card has its employee list expanded
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  // ── Safety Status page filters ────────────────────────────────────────────
  const [safetySearch, setSafetySearch] = useState('');
  const [safetyIslandFilter, setSafetyIslandFilter] = useState<'All' | 'Luzon' | 'Visayas' | 'Mindanao'>('All');
  const [safetyStatusFilter, setSafetyStatusFilter] = useState<'All' | 'Green' | 'Yellow' | 'Red' | 'Uncontacted'>('All');

  // ── Active Incidents page filters ─────────────────────────────────────────
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<'All' | 'Active' | 'Resolved'>('All');
  const [resolvedReports, setResolvedReports] = useState<Record<string, boolean>>(() => {
    const session = readIncidentSessionFromStorage();
    if (session?.resolvedReports) return session.resolvedReports;
    return readResolvedReportsFromStorage();
  });

  // ── Aid Management state ──────────────────────────────────────────────────
  const [aidStatusFilter, setAidStatusFilter] = useState<'All' | 'Submitted' | 'Under Review' | 'Approved' | 'Disbursed' | 'Rejected'>('All');
  const [showAidModal, setShowAidModal] = useState(false);
  const [aidForm, setAidForm] = useState({
    employeeName: '',
    incidentName: '',
    aidType: 'Cash' as 'Cash' | 'Relief Goods' | 'Both',
    amountPhp: '',
    description: '',
    priority: 'Normal' as 'Normal' | 'Urgent',
    department: 'AI Operations',
    islandGroup: 'Luzon' as 'Luzon' | 'Visayas' | 'Mindanao',
  });
  const [aidApplications, setAidApplications] = useState<AidApplication[]>([
    { id: 'AID-001', employeeId: '', employeeName: 'Maria Santos', incidentId: '', incidentName: 'Typhoon Carina — Bulacan', aidType: 'Both', amountPhp: 15000, description: 'Roof heavily damaged, household items lost. Family of 4.', status: 'Disbursed', priority: 'Urgent', filedDate: 'Jun 25, 2026', approver: 'HR Manager', approvedDate: 'Jun 26, 2026', department: 'AI Operations', islandGroup: 'Luzon' },
    { id: 'AID-002', employeeId: '', employeeName: 'Juan dela Cruz', incidentId: '', incidentName: 'Typhoon Carina — Bulacan', aidType: 'Cash', amountPhp: 10000, description: 'Floodwater reached chest level. Evacuated to barangay shelter.', status: 'Approved', priority: 'Urgent', filedDate: 'Jun 25, 2026', approver: 'HR Manager', approvedDate: 'Jun 27, 2026', department: 'Data Engineering', islandGroup: 'Luzon' },
    { id: 'AID-003', employeeId: '', employeeName: 'Ana Reyes', incidentId: '', incidentName: 'Typhoon Carina — Bulacan', aidType: 'Relief Goods', description: 'No food and water for 2 days. Family still at evacuation center.', status: 'Under Review', priority: 'Normal', filedDate: 'Jun 26, 2026', department: 'QC & Audit', islandGroup: 'Luzon' },
    { id: 'AID-004', employeeId: '', employeeName: 'Carlos Mendoza', incidentId: '', incidentName: 'Fire — Cebu IT Park Area', aidType: 'Cash', amountPhp: 8000, description: 'Personal belongings destroyed by fire. Temporary shelter needed.', status: 'Submitted', priority: 'Urgent', filedDate: 'Jun 28, 2026', department: 'GIS & Remote Sensing', islandGroup: 'Visayas' },
    { id: 'AID-005', employeeId: '', employeeName: 'Liza Bautista', incidentId: '', incidentName: 'Fire — Cebu IT Park Area', aidType: 'Both', amountPhp: 12000, description: 'Minor burns, lost work laptop and clothing. Single parent.', status: 'Under Review', priority: 'Urgent', filedDate: 'Jun 28, 2026', department: 'Valuation Services', islandGroup: 'Visayas' },
    { id: 'AID-006', employeeId: '', employeeName: 'Roberto Garcia', incidentId: '', incidentName: 'Earthquake — Davao', aidType: 'Cash', amountPhp: 5000, description: 'Wall cracks. House declared structurally unsafe by DPWH.', status: 'Approved', priority: 'Normal', filedDate: 'Jun 27, 2026', approver: 'Team Manager', approvedDate: 'Jun 28, 2026', department: 'Field Services', islandGroup: 'Mindanao' },
    { id: 'AID-007', employeeId: '', employeeName: 'Patricia Flores', incidentId: '', incidentName: 'Earthquake — Davao', aidType: 'Relief Goods', description: 'Water and power outage for 3 days. Needs basic supplies.', status: 'Disbursed', priority: 'Normal', filedDate: 'Jun 27, 2026', approver: 'HR Manager', approvedDate: 'Jun 28, 2026', department: 'Solutions Group', islandGroup: 'Mindanao' },
    { id: 'AID-008', employeeId: '', employeeName: 'Michael Torres', incidentId: '', incidentName: 'Fire — Cebu IT Park Area', aidType: 'Cash', amountPhp: 10000, description: 'Renting unit in affected building. All personal items lost.', status: 'Submitted', priority: 'Normal', filedDate: 'Jun 29, 2026', department: 'Infrastructure Management', islandGroup: 'Visayas' },
  ]);

  // State for Map View mode: 'island' or 'metro'
  const [mapView, setMapView] = useState<'island' | 'metro'>('island');
  
  // State to filter employees by a selected city from the left table
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Haversine GPS distance in kilometers
  const haversineKm = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // State to filter by island group (null = all)
  const [selectedIslandGroup, setSelectedIslandGroup] = useState<'Luzon' | 'Visayas' | 'Mindanao' | null>(null);

  // State to filter by region (null = all) — e.g. 'NCR', 'VII', 'XI'
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Left panel tab: 'region' or 'island'
  const [panelTab, setPanelTab] = useState<'region' | 'island'>('region');

  // Track which regions are collapsed (key = region code, true = collapsed)
  const [collapsedRegions, setCollapsedRegions] = useState<Record<string, boolean>>({});

  // Viewer role & team filter
  const [viewerRole, setViewerRole] = useState<EmployeeTeam>('HR/CSR');
  const [filterByTeam, setFilterByTeam] = useState(false);

  // Toggle for Incident & Emergency Simulation Deck
  const [simulationActive, setSimulationActive] = useState<boolean>(() => {
    const session = readIncidentSessionFromStorage();
    if (session) return session.simulationActive;
    return readCalamityReportsFromStorage().length > 0;
  });

  // ── Calamity Report Modal State ──────────────────────────────────────────
  const [showCalamityModal, setShowCalamityModal] = useState(false);
  const [calamityForm, setCalamityForm] = useState<{
    type: 'Fire' | 'Earthquake' | 'Typhoon' | 'Other';
    description: string;
    locationLabel: string;
    lat: number;
    lng: number;
    radiusKm: number;
    locationPinned: boolean;
    hazardName: string;      // used when type === 'Other'
    magnitude: string;       // used when type === 'Earthquake'
    signalLevel: string;     // used when type === 'Typhoon'
  }>({
    type: 'Fire',
    description: '',
    locationLabel: '',
    lat: 14.5995,
    lng: 120.9842,
    radiusKm: 0.3,
    locationPinned: false,
    hazardName: '',
    magnitude: '',
    signalLevel: 'Signal No. 1',
  });
  // ref to hold the mini leaflet map inside the modal
  const calamityMapRef = React.useRef<HTMLDivElement | null>(null);
  const calamityLeafletRef = React.useRef<any>(null);
  const calamityMarkerRef = React.useRef<any>(null);
  const calamityCircleRef = React.useRef<any>(null);
  const calamityFormRef = React.useRef(calamityForm);
  // Geocoding state
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // refs for the employee-side Calamity Report page map
  const empCalamityMapRef = React.useRef<HTMLDivElement | null>(null);
  const empCalamityLeafletRef = React.useRef<any>(null);
  const empCalamityMarkerRef = React.useRef<any>(null);
  const empCalamityFormRef = React.useRef(employeeIncidentForm);

  // Active Disaster Location — stored as real GPS coordinates + radius in km
  const [epicenter, setEpicenter] = useState(() => {
    const session = readIncidentSessionFromStorage();
    if (session?.epicenter) return session.epicenter;
    const latestReport = readCalamityReportsFromStorage()[0];
    if (latestReport) {
      return { lat: latestReport.lat, lng: latestReport.lng, radiusKm: latestReport.radiusKm };
    }
    return { lat: 10.3311, lng: 123.9053, radiusKm: 5 };
  });
  const [activeDisaster, setActiveDisaster] = useState<DisasterConfig>(() => {
    const session = readIncidentSessionFromStorage();
    if (session?.activeDisaster) return session.activeDisaster;
    return createDefaultActiveDisaster();
  });

  // Seeded employee database distributed across the three Philippine island groups
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('island_map_employees');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0 && (parsed[0].islandGroup === undefined || parsed[0].team === undefined)) {
          localStorage.removeItem('island_map_employees');
          return generateAllIslandEmployees();
        }
        return parsed;
      } catch (e) {
        return generateAllIslandEmployees();
      }
    }
    return generateAllIslandEmployees();
  });

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Live logger terminal entries
  const [logs, setLogs] = useState<Array<{ id: string; time: string; msg: string; type: 'info' | 'warn' | 'success' | 'err' }>>([{
    id: '1', time: new Date().toLocaleTimeString(), msg: 'HR distribution metrics database loaded: personnel from Luzon, Visayas & Mindanao accounted.', type: 'success' },
    { id: '2', time: new Date().toLocaleTimeString(), msg: 'Geographic profiles plotted across the three primary Philippine island groups.', type: 'info' },
    { id: '3', time: new Date().toLocaleTimeString(), msg: 'Toggle "Disaster & Incident Sim" to launch emergency SMS crisis telemetry.', type: 'warn' },
  ]);

  // Save changes to local persistence — debounced to avoid serializing 5k employees on every tiny state change
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('island_map_employees', JSON.stringify(employees));
    }, 2000);
    return () => clearTimeout(timer);
  }, [employees]);

  // Persist calamity reports, pending employee reports, and active incident session
  useEffect(() => {
    localStorage.setItem(INCIDENT_STORAGE_KEYS.calamityReports, JSON.stringify(calamityReports));
    localStorage.setItem(INCIDENT_STORAGE_KEYS.pendingReports, JSON.stringify(pendingEmployeeReports));
    localStorage.setItem(INCIDENT_STORAGE_KEYS.resolvedReports, JSON.stringify(resolvedReports));
    localStorage.setItem(INCIDENT_STORAGE_KEYS.incidentSession, JSON.stringify({
      simulationActive,
      epicenter,
      activeDisaster,
      resolvedReports,
    } satisfies IncidentSessionSnapshot));
  }, [calamityReports, pendingEmployeeReports, resolvedReports, simulationActive, epicenter, activeDisaster]);

  // Log dispatch helper
  const pushLog = useCallback((msg: string, type: 'info' | 'warn' | 'success' | 'err' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [
      { id: `${Date.now()}-${Math.random()}`, time: timestamp, msg, type },
      ...prev.slice(0, 45)
    ]);
  }, []);

  useEffect(() => {
    const loadFromServer = async () => {
      try {
        const res = await fetch('/api/employees');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const enriched = data.map((emp: Employee) => ({
              ...emp,
              region: emp.region ?? resolveEmployeeRegion({
                gpsLat: emp.gpsLat,
                gpsLng: emp.gpsLng,
                city: emp.address?.split(',').slice(-2, -1)[0]?.trim(),
                province: emp.address?.split(',').slice(-1)[0]?.trim(),
              }),
            }));
            const systemEmails = Array.from(new Set(
              enriched
                .map((emp) => emp.email?.trim().toLowerCase())
                .filter((email): email is string => Boolean(email))
            ));
            setEmployees(enriched);
            setOfficialAccountEmails(systemEmails);
            localStorage.setItem('island_map_employees', JSON.stringify(enriched));
            pushLog(`Loaded ${enriched.length} employees from database.`, 'success');
          }
        }
      } catch (e) {
        console.error('Failed to load from server, using local data:', e);
      }
    };
    loadFromServer();
  }, [pushLog]);

  // Compute GPS Haversine distance (km) from epicenter to employee home
  const getDistance = useCallback((emp: Employee) => {
    const empLat = emp.gpsLat ?? emp.lat;
    const empLng = emp.gpsLng ?? emp.lng;
    return haversineKm(epicenter.lat, epicenter.lng, empLat, empLng);
  }, [epicenter, haversineKm]);

  // Interactive radius count of employees inside concentric circles (from Metro hub)
  const countInGpsRadius = useCallback((centerLat: number, centerLng: number, radiusKm: number) => {
    return employees.filter(emp => {
      if (!emp.gpsLat || !emp.gpsLng) return false;
      return haversineKm(centerLat, centerLng, emp.gpsLat, emp.gpsLng) <= radiusKm;
    }).length;
  }, [employees, haversineKm]);

  const visibleEmployees = useMemo(() => {
    return employees.filter(emp => {
      const selectedCityText = normalizeText(selectedCity ?? '');
      const cityName = normalizeText(getEmployeeCity(emp) ?? '');
      const addressText = normalizeText(emp.address ?? '');
      const geoMatch =
        (!selectedCity || cityName.includes(selectedCityText) || addressText.includes(selectedCityText) || selectedCityText.includes(cityName)) &&
        (!selectedIslandGroup || emp.islandGroup === selectedIslandGroup) &&
        (!selectedRegion || emp.region === selectedRegion);
      const teamMatch = !filterByTeam || emp.team === viewerRole;
      return geoMatch && teamMatch;
    });
  }, [employees, selectedCity, selectedIslandGroup, selectedRegion, filterByTeam, viewerRole]);

  const employeeLookup = useMemo(() => {
    const lookup = new Map<string, Employee>();
    employees.forEach((emp) => lookup.set(emp.id, emp));
    return lookup;
  }, [employees]);

  const reportAffectedEmployeesById = useMemo(() => {
    return calamityReports.reduce<Record<string, Employee[]>>((acc, report) => {
      acc[report.id] = (report.affectedEmployeeIds ?? [])
        .map((id) => employeeLookup.get(id))
        .filter((emp): emp is Employee => Boolean(emp));
      return acc;
    }, {});
  }, [calamityReports, employeeLookup]);

  // Fixed values shown in Metro Cebu Image 2 for pristine alignment
  const fteInside5km = useMemo(() => {
    // Metro central business coordinates are at Cebu IT park
    const count = countInGpsRadius(10.3157, 123.8854, 5.0);
    return count > 0 ? count : 835; // Fallback to 835 (75.4%) exactly
  }, [countInGpsRadius]);

  const fteInside10kmAdditional = useMemo(() => {
    const totalWithin10 = countInGpsRadius(10.3157, 123.8854, 10.0);
    const totalWithin5 = countInGpsRadius(10.3157, 123.8854, 5.0);
    const diff = totalWithin10 - totalWithin5;
    return diff > 0 ? diff : 94; // Fallback to 94 exactly
  }, [countInGpsRadius]);

  // Handle epicenter change from map drag or radius slider
  const handleEpicenterChange = (newEpic: { lat: number; lng: number; radiusKm: number }) => {
    setEpicenter(newEpic);

    // Auto-detect newly affected residents using GPS distance
    const newAffected: string[] = [];
    employees.forEach(emp => {
      const empLat = emp.gpsLat ?? emp.lat;
      const empLng = emp.gpsLng ?? emp.lng;
      if (haversineKm(newEpic.lat, newEpic.lng, empLat, empLng) <= newEpic.radiusKm) {
        newAffected.push(emp.name);
      }
    });

    const categoryText = activeDisaster.name.includes('Fire') ? 'Fire' : activeDisaster.name.includes('Flood') ? 'Flood' : 'Incident';
    pushLog(`${categoryText} epicenter moved to [${newEpic.lat.toFixed(4)}°N, ${newEpic.lng.toFixed(4)}°E]. Radius: ${newEpic.radiusKm} km.`, 'warn');
    if (newAffected.length > 0) {
      pushLog(`Active sensor scan: ${newAffected.length} employees are inside the ${newEpic.radiusKm} km danger perimeter.`, 'err');
    }
  };

  const handleSendCheckIn = (employeeId: string) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          const isFailedDelivery = emp.carrier === 'DITO';
          const finalStatus: SafetyStatus = isFailedDelivery ? 'Red' : 'Yellow';
          const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          pushLog(`MANUAL CONTACT REGISTERED: HR manually reached out to ${emp.name} via ${emp.carrier} GSM link. Status: ${finalStatus === 'Red' ? 'TRANSMISSION FAILURE' : 'PENDING REPLY'}`, finalStatus === 'Red' ? 'err' : 'info');
          return {
            ...emp,
            status: finalStatus,
            contacted: true,
            unresponsive: false,
            safetyMessage: undefined,
            lastMessageSent: stamp,
          };
        }
        return emp;
      })
    );
  };

  const handleSendEmail = (employeeId: string) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          const isFailedDelivery = emp.carrier === 'DITO';
          const finalStatus: SafetyStatus = isFailedDelivery ? 'Red' : 'Yellow';
          const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          pushLog(`EMAIL DISPATCH REGISTERED: HR reached out to ${emp.name} via corporate email. Status: ${finalStatus === 'Red' ? 'TRANSMISSION FAILURE' : 'PENDING REPLY'}`, finalStatus === 'Red' ? 'err' : 'info');
          return {
            ...emp,
            status: finalStatus,
            contacted: true,
            emailed: true,
            unresponsive: false,
            safetyMessage: undefined,
            lastEmailSent: stamp,
          };
        }
        return emp;
      })
    );
  };

  const handleSendCheckInAllAffected = () => {
    let triggeredCount = 0;
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setEmployees((prev) =>
      prev.map((emp) => {
        const dist = getDistance(emp);
        if (dist <= epicenter.radiusKm) {
          triggeredCount++;
          const isFailedDelivery = emp.carrier === 'DITO';
          return {
            ...emp,
            status: (isFailedDelivery ? 'Red' : 'Yellow') as SafetyStatus,
            contacted: true,
            unresponsive: false,
            safetyMessage: undefined,
            lastMessageSent: stamp,
          };
        }
        return emp;
      })
    );
    pushLog(`BROADCAST DISPATCHED: Manual SMS beacon dispatched to all ${triggeredCount} staff in active hazard bounds.`, 'warn');
  };

  const handleApproveAidApplication = (applicationId: string) => {
    if (!isManagerUser) return;
    const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    setAidApplications((prev) =>
      prev.map((app) =>
        app.id === applicationId
          ? {
              ...app,
              status: 'Approved',
              approver: currentEmployee?.name ?? 'Manager',
              approvedDate: now,
            }
          : app
      )
    );
    pushLog(`Manager approved aid application ${applicationId}.`, 'success');
  };

  const handleDisburseAidApplication = (applicationId: string) => {
    if (!isManagerUser) return;
    const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    setAidApplications((prev) =>
      prev.map((app) =>
        app.id === applicationId
          ? {
              ...app,
              status: 'Disbursed',
              approver: currentEmployee?.name ?? 'Manager',
              approvedDate: now,
            }
          : app
      )
    );
    pushLog(`Manager disbursed aid application ${applicationId}.`, 'success');
  };

  const handleSimulateReply = (employeeId: string, forcedStatus?: SafetyStatus) => {
    const isHelp = forcedStatus === 'Red';
    
    // Choose templates based on status
    let templates = activeDisaster.replyTemplates;
    if (isHelp) {
      if (activeDisaster.name.includes('Fire')) {
        templates = [
          'Smoke surrounds my street. Need immediate relief and support!',
          'Power cut off, cannot leave due to thick smoke. Please send assistance!',
          'Minor smoke inhalation, need medical support or relief kit.'
        ];
      } else if (activeDisaster.name.includes('Earthquake')) {
        templates = [
          'Injured by a falling cabinet. Need first-aid support!',
          'Walls cracked badly. Trapped inside. Need lodging voucher or relief goods.',
          'Gas leak smell nearby, stressed out. Need company assistance!'
        ];
      } else if (activeDisaster.name.includes('Typhoon')) {
        templates = [
          'Water reached ankle/waist level! Need relief food, goods, and shelter.',
          'Roof damaged by severe winds. Rain is flooding. Please send relief Pack!',
          'Stranded. No clean water or power. Please allocate calamity aid.'
        ];
      } else {
        templates = [
          'Impacted by local hazard. Urgent financial support or relief package requested.',
          'Power cut, stuck without food. Need emergency relief goods!'
        ];
      }
    }

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          const text = templates[Math.floor(Math.random() * templates.length)];
          const finalStatus = isHelp ? ('Red' as SafetyStatus) : ('Green' as SafetyStatus);
          pushLog(`SMS Check-in answer received from ${emp.name}: "${text}"`, isHelp ? 'err' : 'success');
          return {
            ...emp,
            status: finalStatus,
            contacted: true,
            unresponsive: false,
            safetyMessage: text,
            lastResponseRecv: new Date().toLocaleTimeString(),
          };
        }
        return emp;
      })
    );
  };

  const handleReportStatus = (employeeId: string, status: SafetyStatus, isUnresponsive?: boolean) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          if (isUnresponsive) {
            pushLog(`HR flagged ${emp.name} as UNRESPONSIVE (no reply after SMS transmission). Escalating...`, 'warn');
            return {
              ...emp,
              status: 'Yellow' as SafetyStatus,
              contacted: true,
              unresponsive: true,
              safetyMessage: 'UNRESPONSIVE',
              lastResponseRecv: 'No Response',
            };
          }
          const actionText = status === 'Green' ? 'Reported SAFE Check-in' : 'Triggered SOS / HELP Request';
          pushLog(`Simulated report from ${emp.name}: ${actionText}. Current status: ${status.toUpperCase()}`, status === 'Red' ? 'err' : 'success');
          return {
            ...emp,
            status,
            contacted: true,
            unresponsive: false,
            safetyMessage: status === 'Green' ? "Acknowledge receipt, I am safe." : "Assistance requested, seeking urgent support.",
            lastResponseRecv: new Date().toLocaleTimeString(),
          };
        }
        return emp;
      })
    );
  };

  const handleAddEmployee = (newEmp: Employee) => {
    setEmployees((prev) => [newEmp, ...prev]);
    pushLog(`Registered new staff residence coordinates: ${newEmp.name} in ${newEmp.address}.`, 'success');
  };

  const gpsToGridCoords = (gpsLat: number, gpsLng: number) => {
    const LAT_MIN = 4.5, LAT_MAX = 21.5;
    const LNG_MIN = 116.0, LNG_MAX = 127.0;
    const gridY = ((LAT_MAX - gpsLat) / (LAT_MAX - LAT_MIN)) * 100;
    const gridX = ((gpsLng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
    return {
      gridX: parseFloat(Math.max(0, Math.min(100, gridX)).toFixed(2)),
      gridY: parseFloat(Math.max(0, Math.min(100, gridY)).toFixed(2)),
    };
  };

  const handleCreateEmployeeFromDirectory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpForm.name.trim()) return;

    const { gridX, gridY } = gpsToGridCoords(newEmpForm.gpsLat, newEmpForm.gpsLng);
    const nameParts = newEmpForm.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || (nameParts[0] ?? '');
    const avatar = (firstName[0] ?? '') + (lastName[0] ?? '');
    const autoEmail = newEmpForm.email.trim() ||
      `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@innodata.com`;

    const newEmp: Employee = {
      id: `emp-custom-${Date.now()}`,
      name: newEmpForm.name.trim(),
      role: newEmpForm.role.trim() || 'Data Analyst',
      department: newEmpForm.department,
      lat: gridY,
      lng: gridX,
      gpsLat: Number(newEmpForm.gpsLat),
      gpsLng: Number(newEmpForm.gpsLng),
      carrier: 'Globe',
      normalSignalStrength: -75,
      battery: Math.round(50 + Math.random() * 50),
      status: 'Green',
      phone: newEmpForm.phone.trim() || undefined,
      email: autoEmail,
      avatar: avatar.toUpperCase() || 'EM',
      address: newEmpForm.address.trim() || `${newEmpForm.islandGroup}, PH`,
      islandGroup: newEmpForm.islandGroup,
      team: viewerRole,
    };

    handleAddEmployee(newEmp);
    setShowAddEmployeeModal(false);
    setNewEmpForm({
      name: '',
      role: 'Data Analyst',
      department: 'AI Operations',
      phone: '',
      email: '',
      address: '',
      islandGroup: 'Luzon',
      gpsLat: 14.5995,
      gpsLng: 120.9842,
    });
  };

  const handleRemoveEmployee = (employeeId: string, employeeName: string) => {
    if (!window.confirm(`Remove ${employeeName} from the employee directory? This cannot be undone.`)) {
      return;
    }
    setEmployees(prev => prev.filter(e => e.id !== employeeId));
    if (selectedEmployee?.id === employeeId) {
      setSelectedEmployee(null);
    }
    setDirActionsMenuId(null);
    pushLog(`Removed ${employeeName} from the employee directory.`, 'warn');
  };

  const handleResetDatabase = () => {
    clearIncidentStorage();
    setCalamityReports([]);
    setPendingEmployeeReports([]);
    setResolvedReports({});
    setSimulationActive(false);
    setEpicenter({ lat: 10.3311, lng: 123.9053, radiusKm: 5 });
    setActiveDisaster(createDefaultActiveDisaster());
    setEmployees(generateAllIslandEmployees());
    setSelectedEmployee(null);
    setSelectedCity(null);
    setSelectedIslandGroup(null);
    setFilterByTeam(false);
    pushLog('Database reset. All personnel records restored and active calamity report cleared.', 'info');
  };

  // Close employee directory actions menu on outside click
  React.useEffect(() => {
    if (!dirActionsMenuId) return;
    const closeMenu = () => setDirActionsMenuId(null);
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [dirActionsMenuId]);

  // Keep the calamityFormRef in sync so Leaflet click handlers always see fresh state
  React.useEffect(() => {
    calamityFormRef.current = calamityForm;
  }, [calamityForm]);

  // Mount the mini Leaflet map inside the Calamity Report modal
  React.useEffect(() => {
    if (!showCalamityModal) {
      // Destroy map when modal closes
      if (calamityLeafletRef.current) {
        calamityLeafletRef.current.remove();
        calamityLeafletRef.current = null;
        calamityMarkerRef.current = null;
        calamityCircleRef.current = null;
      }
      return;
    }
    // Small delay so the modal DOM is painted
    const timer = setTimeout(() => {
      if (!calamityMapRef.current || calamityLeafletRef.current) return;
      const L = (window as any).L || require('leaflet');
      // Center on Philippines
      const map = L.map(calamityMapRef.current, {
        center: [12.0, 122.5],
        zoom: 6,
        zoomControl: true,
      });
      calamityLeafletRef.current = map;

      // Light tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Click handler to pin location
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setCalamityForm(prev => ({ ...prev, lat, lng, locationPinned: true }));

        // Draw / update marker
        if (calamityMarkerRef.current) {
          calamityMarkerRef.current.setLatLng([lat, lng]);
        } else {
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:20px;height:20px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 20],
          });
          calamityMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        }

        // Draw / update circle
        const radius = calamityFormRef.current.radiusKm * 1000;
        if (calamityCircleRef.current) {
          calamityCircleRef.current.setLatLng([lat, lng]).setRadius(radius);
        } else {
          calamityCircleRef.current = L.circle([lat, lng], {
            radius,
            color: '#dc2626',
            fillColor: '#dc2626',
            fillOpacity: 0.12,
            weight: 2,
            dashArray: '6 4',
          }).addTo(map);
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [showCalamityModal]);

  // Keep circle radius in sync when the slider changes (while modal is open)
  React.useEffect(() => {
    if (!calamityCircleRef.current) return;
    calamityCircleRef.current.setRadius(calamityForm.radiusKm * 1000);
  }, [calamityForm.radiusKm]);

  // Compute live count of employees inside the calamity geofence
  const calamityAffectedCount = React.useMemo(() => {
    if (!calamityForm.locationPinned) return 0;
    return employees.filter(emp => {
      const lat = emp.gpsLat ?? emp.lat;
      const lng = emp.gpsLng ?? emp.lng;
      return haversineKm(calamityForm.lat, calamityForm.lng, lat, lng) <= calamityForm.radiusKm;
    }).length;
  }, [calamityForm.lat, calamityForm.lng, calamityForm.radiusKm, calamityForm.locationPinned, employees, haversineKm]);

  const handleSubmitCalamityReport = () => {
    const { type, description, locationLabel, lat, lng, radiusKm, hazardName, magnitude, signalLevel } = calamityForm;

    // Build a meaningful incident name
    const incidentLabel = type === 'Other' && hazardName.trim() ? hazardName.trim() : type;
    const fullName = locationLabel
      ? `${incidentLabel} — ${locationLabel}`
      : `${incidentLabel} Incident`;

    // Build auto-description with extra fields
    let extraDetails = '';
    if (type === 'Earthquake' && magnitude.trim()) extraDetails = ` Magnitude/Intensity: ${magnitude}.`;
    if (type === 'Typhoon' && signalLevel)         extraDetails = ` ${signalLevel}.`;
    const desc = description
      ? description + extraDetails
      : `${incidentLabel} calamity reported by HR/Management at [${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E].${extraDetails}`;

    // Capture which employees are in zone at filing time
    const affectedEmployeeIds = employees
      .filter(emp => {
        const eLat = emp.gpsLat ?? emp.lat;
        const eLng = emp.gpsLng ?? emp.lng;
        return haversineKm(lat, lng, eLat, eLng) <= radiusKm;
      })
      .map(emp => emp.id);

    handleTriggerSimulation(fullName, lat, lng, radiusKm, desc);
    setSimulationActive(true);
    // Save to reports history
    const newReport = {
      id: `${Date.now()}`,
      timestamp: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      type,
      incidentName: fullName,
      locationLabel,
      lat,
      lng,
      radiusKm,
      affectedCount: affectedEmployeeIds.length,
      affectedEmployeeIds,
      magnitude: (type === 'Earthquake' && magnitude.trim()) ? magnitude.trim() : undefined,
      signalLevel: type === 'Typhoon' ? signalLevel : undefined,
      description: desc,
    };
    setCalamityReports(prev => [newReport, ...prev]);
    pushLog(`📋 CALAMITY REPORT FILED: "${fullName}" by HR/Manager. ${calamityAffectedCount} personnel in ${radiusKm} km zone.`, 'err');
    setShowCalamityModal(false);
    setCalamityForm(prev => ({ ...prev, locationPinned: false, description: '', locationLabel: '', hazardName: '', magnitude: '' }));
  };

  // Geocode the typed location label using Nominatim (OpenStreetMap) — no API key required
  const handleGeocode = async () => {
    const query = calamityForm.locationLabel.trim();
    if (!query) {
      setGeocodeError('Please type a location name first.');
      return;
    }
    setIsGeocoding(true);
    setGeocodeError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ph`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      if (!data || data.length === 0) {
        // Retry without country restriction in case they typed a general area
        const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Philippines')}&format=json&limit=1`;
        const res2 = await fetch(url2, { headers: { 'Accept-Language': 'en' } });
        const data2 = await res2.json();
        if (!data2 || data2.length === 0) {
          setGeocodeError(`Location "${query}" not found. Try a more specific name or pin manually.`);
          setIsGeocoding(false);
          return;
        }
        const { lat, lon, display_name } = data2[0];
        _applyGeocodedLocation(parseFloat(lat), parseFloat(lon), display_name);
      } else {
        const { lat, lon, display_name } = data[0];
        _applyGeocodedLocation(parseFloat(lat), parseFloat(lon), display_name);
      }
    } catch {
      setGeocodeError('Network error — check your connection and try again.');
    }
    setIsGeocoding(false);
  };

  const _applyGeocodedLocation = (lat: number, lng: number, displayName: string) => {
    setCalamityForm(prev => ({ ...prev, lat, lng, locationPinned: true }));
    setGeocodeError(null);
    const L = (window as any).L || require('leaflet');
    const map = calamityLeafletRef.current;
    if (map) {
      map.setView([lat, lng], 13, { animate: true });
      // Update or create marker
      if (calamityMarkerRef.current) {
        calamityMarkerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:20px;height:20px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 20],
        });
        calamityMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }
      // Update or create circle
      const radiusM = calamityFormRef.current.radiusKm * 1000;
      if (calamityCircleRef.current) {
        calamityCircleRef.current.setLatLng([lat, lng]).setRadius(radiusM);
      } else {
        calamityCircleRef.current = L.circle([lat, lng], {
          radius: radiusM,
          color: '#dc2626',
          fillColor: '#dc2626',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '6 4',
        }).addTo(map);
      }
    }
  };


  // ── Employee Calamity Report Page — Leaflet map ───────────────────────────

  // Keep empCalamityFormRef in sync so Leaflet click handler always sees fresh state
  React.useEffect(() => {
    empCalamityFormRef.current = employeeIncidentForm;
  }, [employeeIncidentForm]);

  // Mount/destroy employee calamity map when the Calamity Report page is active
  React.useEffect(() => {
    const isOnCalamityPage = employeePortalPage === 'checkin';
    if (!isOnCalamityPage) {
      if (empCalamityLeafletRef.current) {
        empCalamityLeafletRef.current.remove();
        empCalamityLeafletRef.current = null;
        empCalamityMarkerRef.current = null;
      }
      return;
    }
    const timer = setTimeout(() => {
      if (!empCalamityMapRef.current || empCalamityLeafletRef.current) return;
      const L = (window as any).L || require('leaflet');
      const initLat = empCalamityFormRef.current.lat || 12.0;
      const initLng = empCalamityFormRef.current.lng || 122.5;
      const initZoom = empCalamityFormRef.current.lat ? 13 : 6;
      const map = L.map(empCalamityMapRef.current, { center: [initLat, initLng], zoom: initZoom, zoomControl: true });
      empCalamityLeafletRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);
      if (empCalamityFormRef.current.lat && empCalamityFormRef.current.lng) {
        const pinIcon = L.divIcon({
          className: '',
          html: '<div style="width:22px;height:22px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
          iconSize: [22, 22], iconAnchor: [11, 22],
        });
        empCalamityMarkerRef.current = L.marker([empCalamityFormRef.current.lat, empCalamityFormRef.current.lng], { icon: pinIcon }).addTo(map);
        setEmployeeIncidentForm(prev => ({ ...prev, locationPinned: true }));
      }
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setEmployeeIncidentForm(prev => ({ ...prev, lat, lng, locationPinned: true }));
        if (empCalamityMarkerRef.current) {
          empCalamityMarkerRef.current.setLatLng([lat, lng]);
        } else {
          const pinIcon = L.divIcon({
            className: '',
            html: '<div style="width:22px;height:22px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
            iconSize: [22, 22], iconAnchor: [11, 22],
          });
          empCalamityMarkerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
        }
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [employeePortalPage]);

  const handleEmpGeocode = async () => {
    const query = employeeIncidentForm.locationLabel.trim();
    if (!query) { setEmpGeocodeError('Please type a location name first.'); return; }
    setEmpIsGeocoding(true); setEmpGeocodeError(null);
    try {
      const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=1&countrycodes=ph';
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      let foundLat: number, foundLng: number;
      if (!data || data.length === 0) {
        const url2 = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query + ' Philippines') + '&format=json&limit=1';
        const res2 = await fetch(url2, { headers: { 'Accept-Language': 'en' } });
        const data2 = await res2.json();
        if (!data2 || data2.length === 0) { setEmpGeocodeError('"' + query + '" not found. Try a more specific name or click the map.'); setEmpIsGeocoding(false); return; }
        foundLat = parseFloat(data2[0].lat); foundLng = parseFloat(data2[0].lon);
      } else { foundLat = parseFloat(data[0].lat); foundLng = parseFloat(data[0].lon); }
      setEmployeeIncidentForm(prev => ({ ...prev, lat: foundLat, lng: foundLng, locationPinned: true }));
      setEmpGeocodeError(null);
      const L = (window as any).L || require('leaflet');
      const map = empCalamityLeafletRef.current;
      if (map) {
        map.setView([foundLat, foundLng], 13, { animate: true });
        if (empCalamityMarkerRef.current) { empCalamityMarkerRef.current.setLatLng([foundLat, foundLng]); }
        else {
          const pinIcon = L.divIcon({
            className: '',
            html: '<div style="width:22px;height:22px;background:#dc2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
            iconSize: [22, 22], iconAnchor: [11, 22],
          });
          empCalamityMarkerRef.current = L.marker([foundLat, foundLng], { icon: pinIcon }).addTo(map);
        }
      }
    } catch { setEmpGeocodeError('Network error — check your connection and try again.'); }
    setEmpIsGeocoding(false);
  };

  const handleSubmitEmployeeCrisisReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentEmployee) { setEmployeePortalMessage('Your employee profile could not be found.'); return; }
    if (!employeeIncidentForm.locationPinned) { setEmployeePortalMessage('Please pin a location on the map or search for one before submitting.'); return; }
    if (!employeeIncidentForm.description.trim()) { setEmployeePortalMessage('Please describe the calamity before submitting.'); return; }
    const incidentName = employeeIncidentForm.incidentName.trim() ||
      (employeeIncidentForm.type + ' — ' + (employeeIncidentForm.locationLabel.trim() || 'My Location'));
    const pendingReport = {
      id: 'EMP-RPT-' + Date.now(),
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      employeeAvatar: currentEmployee.avatar ?? currentEmployee.name.charAt(0),
      timestamp: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      type: employeeIncidentForm.type,
      incidentName,
      locationLabel: employeeIncidentForm.locationLabel.trim() || currentEmployee.address || 'My Location',
      lat: employeeIncidentForm.lat,
      lng: employeeIncidentForm.lng,
      description: employeeIncidentForm.description.trim(),
      status: 'Pending' as const,
    };
    setPendingEmployeeReports(prev => [pendingReport, ...prev]);
    if (employeeIncidentForm.iAmVictim) {
      setEmployees(prev => prev.map(emp =>
        emp.id === currentEmployee.id ? { ...emp, status: 'Yellow' as SafetyStatus } : emp
      ));
    }
    setEmployeeIncidentForm({ type: 'Fire', description: '', locationLabel: '', incidentName: '', lat: 0, lng: 0, locationPinned: false, iAmVictim: true });
    if (empCalamityLeafletRef.current) { empCalamityLeafletRef.current.remove(); empCalamityLeafletRef.current = null; empCalamityMarkerRef.current = null; }
    setEmployeePortalMessage('Your calamity report has been submitted and is awaiting manager verification. Your status has been set to "Need Help" until approved.');
    pushLog('PENDING REPORT: ' + currentEmployee.name + ' filed a self-reported calamity (' + pendingReport.type + '). Awaiting manager approval.', 'warn');
  };

  const handleApproveEmployeeReport = (reportId: string) => {
    const report = pendingEmployeeReports.find(r => r.id === reportId);
    if (!report) return;
    const newReport = {
      id: 'APPROVED-' + reportId,
      timestamp: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      type: report.type, incidentName: report.incidentName, locationLabel: report.locationLabel,
      lat: report.lat, lng: report.lng, radiusKm: 1, affectedCount: 1,
      affectedEmployeeIds: [report.employeeId], description: report.description,
    };
    setCalamityReports(prev => [newReport, ...prev]);
    setPendingEmployeeReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'Approved' as const } : r));
    setSimulationActive(true);
    pushLog('MANAGER APPROVED: Calamity report by ' + report.employeeName + ' verified and added to Active Incidents.', 'success');
  };

  const handleRejectEmployeeReport = (reportId: string) => {
    const report = pendingEmployeeReports.find(r => r.id === reportId);
    if (!report) return;
    setPendingEmployeeReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'Rejected' as const } : r));
    setEmployees(prev => prev.map(emp =>
      emp.id === report.employeeId ? { ...emp, status: 'Green' as SafetyStatus } : emp
    ));
    pushLog('MANAGER REJECTED: Calamity report by ' + report.employeeName + ' was rejected.', 'warn');
  };

  const handleDispatchRescue = (employeeId: string) => {

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          pushLog(`📦 COMPANY AID DISPATCHED: Core Care Pack, PHP 10,000 calamity relief balance, and temporary lodging voucher allocated to ${emp.name}'s registered address.`, 'success');
          return {
            ...emp,
            rescueDispatched: true,
          };
        }
        return emp;
      })
    );
  };

  const handleTriggerSimulation = (name: string, lat: number, lng: number, radiusKm: number, desc: string) => {
    let disasterId: 'fire' | 'earthquake' | 'typhoon' = 'fire';
    let subName = 'Barangay Block Outbreak';
    let icon = 'fire' as any;
    let color = 'orange';
    let colorClass = 'text-orange-700 bg-orange-50 border-orange-200';
    let hexColor = '#f97316';
    let greenTemplates = activeDisaster.greenTemplates;
    let replyTemplates = activeDisaster.replyTemplates;

    if (name.includes('Flood') || name.includes('Typhoon')) {
      disasterId = 'typhoon';
      subName = 'High wind-surge wall';
      icon = 'typhoon';
      color = 'cyan';
      colorClass = 'text-cyan-700 bg-cyan-50 border-cyan-200';
      hexColor = '#06b6d4';
    } else if (name.includes('Blast') || name.includes('Leak') || name.includes('Earthquake') || name.includes('Rupture')) {
      disasterId = 'earthquake';
      subName = 'Infrastructure fracturing';
      icon = 'earthquake';
      color = 'red';
      colorClass = 'text-rose-700 bg-rose-50 border-rose-200';
      hexColor = '#f43f5e';
    }

    setActiveDisaster({
      id: disasterId,
      name,
      subName,
      icon,
      color,
      colorClass,
      hexColor,
      defaultX: lat,
      defaultY: lng,
      defaultRadius: radiusKm,
      locationName: name + ' Risk Outpost',
      description: desc,
      greenTemplates,
      replyTemplates
    });

    setEpicenter({ lat, lng, radiusKm });
    setSelectedEmployee(null);

     // Apply immediate impact statuses using accurate GPS Haversine distance.
     // Employees outside the incident radius are no longer auto-marked as safe/confirmed
     // unless the user explicitly contacts or confirms them later.
     setEmployees((prev) =>
       prev.map((emp) => {
         const empLat = emp.gpsLat ?? emp.lat;
         const empLng = emp.gpsLng ?? emp.lng;
         const dist = haversineKm(lat, lng, empLat, empLng);
         if (dist <= radiusKm) {
           return {
             ...emp,
             status: 'Yellow' as SafetyStatus,
             contacted: false,
             unresponsive: false,
             safetyMessage: undefined,
             rescueDispatched: false,
           };
         }

         return {
           ...emp,
           status: 'Yellow' as SafetyStatus,
           contacted: false,
           unresponsive: false,
           safetyMessage: undefined,
           rescueDispatched: false,
         };
       })
     );

    pushLog(`🚨 SIMULATION ACTIVE: "${name}" @ [${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E] — Radius: ${radiusKm} km`, 'err');
    pushLog(`Description: ${desc}`, 'warn');
  };

  // Keep selected employee synced
  useEffect(() => {
    if (selectedEmployee) {
      const match = employees.find(e => e.id === selectedEmployee.id);
      if (match) setSelectedEmployee(match);
    }
  }, [employees, selectedEmployee]);

  // ── Memoized counters — computed ONCE per employees/epicenter change, not on every render ──
  const employeeStatusCounts = useMemo(() => {
    let green = 0, red = 0, yellow = 0, uncontacted = 0;
    let affectedTotal = 0, affectedGreen = 0, affectedYellow = 0, affectedRed = 0;
    employees.forEach(emp => {
      if (emp.status === 'Green') green++;
      else if (emp.status === 'Yellow') yellow++;
      else if (emp.status === 'Red') red++;
      if (!emp.contacted) uncontacted++;

      if (simulationActive) {
        const empLat = emp.gpsLat ?? emp.lat;
        const empLng = emp.gpsLng ?? emp.lng;
        const dist = haversineKm(epicenter.lat, epicenter.lng, empLat, empLng);
        if (dist <= epicenter.radiusKm) {
          affectedTotal++;
          if (emp.status === 'Green') affectedGreen++;
          else if (emp.status === 'Yellow') affectedYellow++;
          else if (emp.status === 'Red') affectedRed++;
        }
      }
    });
    return { green, red, yellow, uncontacted, affectedTotal, affectedGreen, affectedYellow, affectedRed };
  }, [employees, epicenter, simulationActive, haversineKm]);

  const affectedStaff      = employeeStatusCounts.affectedTotal;
  const safeStaffCount     = employeeStatusCounts.affectedGreen;
  const pendingCount       = employeeStatusCounts.affectedYellow;
  const offlineDangerCount = employeeStatusCounts.affectedRed;

  // Pre-compute island group and city FTE counts once — avoids dozens of .filter() calls inside JSX
  const islandCounts = useMemo(() => {
    const counts: Record<string, number> = { Luzon: 0, Visayas: 0, Mindanao: 0 };
    employees.forEach(e => { if (e.islandGroup) counts[e.islandGroup] = (counts[e.islandGroup] ?? 0) + 1; });
    return counts;
  }, [employees]);

  // Pre-compute region FTE counts once
  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(e => {
      if (e.region) counts.set(e.region, (counts.get(e.region) ?? 0) + 1);
    });
    return counts;
  }, [employees]);

  const cityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(e => {
      const city = getEmployeeCity(e);
      if (city) {
        counts.set(city, (counts.get(city) ?? 0) + 1);
      }
    });
    return counts;
  }, [employees]);

  const handleLogin = (identifier: string, password: string) => {
    setIsSubmittingLogin(true);
    setAuthError('');

    const officialPassword = '123456';
    const adminUsername = 'admin';
    const adminPassword = 'admin123';
    const normalizedIdentifier = identifier.trim().toLowerCase();

    if (normalizedIdentifier === adminUsername && password === adminPassword) {
      window.setTimeout(() => {
        setCurrentUser({
          username: 'admin',
          role: 'admin',
        });
        setIsAuthenticated(true);
        setIsSubmittingLogin(false);
      }, 350);
      return;
    }

    const managerUsername = 'manager';
    const managerPassword = 'manager123';
    if (normalizedIdentifier === managerUsername && password === managerPassword) {
      window.setTimeout(() => {
        setCurrentUser({
          username: managerUsername,
          role: 'manager',
        });
        setIsAuthenticated(true);
        setIsSubmittingLogin(false);
      }, 350);
      return;
    }

    const matchedEmployee = employees.find((emp) => emp.email?.trim().toLowerCase() === normalizedIdentifier);
    const isOfficialEmail = officialAccountEmails.includes(normalizedIdentifier);
    if ((isOfficialEmail || matchedEmployee) && password === officialPassword) {
      const isManager = matchedEmployee?.accessRole === 'manager';
      window.setTimeout(() => {
        setCurrentUser({
          username: normalizedIdentifier,
          role: isManager ? 'manager' : 'official',
        });
        setIsAuthenticated(true);
        setIsSubmittingLogin(false);
      }, 350);
      return;
    }

    window.setTimeout(() => {
      setAuthError('Invalid email or password. Use an official email from Supabase or the admin account shown on the screen.');
      setIsSubmittingLogin(false);
    }, 350);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthError('');
    setCurrentUser({ username: '', role: 'official' });
  };

  const managerTeamMemberIds = ['T8U', 'T8S'];

  const managerDummyDirectReports = useMemo(() => {
    return employees.filter((emp) => managerTeamMemberIds.includes(emp.id));
  }, [employees]);

  const currentEmployee = useMemo(() => {
    if (currentUser.role === 'manager' && currentUser.username === 'manager') {
      return {
        id: 'manager-dummy',
        name: 'Manager',
        role: 'Manager',
        accessRole: 'manager',
        department: 'Management',
        lat: 0,
        lng: 0,
        gpsLat: 0,
        gpsLng: 0,
        carrier: 'Globe',
        normalSignalStrength: -75,
        battery: 100,
        status: 'Green',
        email: 'manager@dummy.local',
        avatar: 'MG',
        address: '',
        islandGroup: 'Luzon',
        region: 'NCR',
      } as Employee;
    }

    const normalizedEmail = currentUser.username.trim().toLowerCase();
    if (!normalizedEmail) return null;
    return employees.find((emp) => emp.email?.trim().toLowerCase() === normalizedEmail) ?? null;
  }, [currentUser.username, currentUser.role, employees]);

  const isManagerUser = currentUser.role === 'manager';

  const directReports = useMemo(() => {
    if (!isManagerUser) return [] as Employee[];
    if (currentUser.username === 'manager') {
      return managerDummyDirectReports;
    }
    const normalizedManagerName = currentEmployee?.name.trim().toLowerCase() ?? '';
    return employees.filter((emp) => {
      const matchesManagerId = emp.managerId && emp.managerId === currentEmployee?.id;
      const matchesManagerName = emp.managerName?.trim().toLowerCase() === normalizedManagerName;
      return emp.id !== currentEmployee?.id && (matchesManagerId || matchesManagerName);
    });
  }, [currentEmployee, currentUser.username, currentUser.role, employees, isManagerUser, managerDummyDirectReports]);

  useEffect(() => {
    if (currentEmployee) {
      setLocationUpdate(currentEmployee.address ?? '');
      // Pre-seed the calamity form with employee GPS so map auto-centers on their location
      if (currentEmployee.gpsLat && currentEmployee.gpsLng) {
        setEmployeeIncidentForm(prev => ({
          ...prev,
          lat: currentEmployee.gpsLat ?? 0,
          lng: currentEmployee.gpsLng ?? 0,
        }));
      }
    }
  }, [currentEmployee?.id]);

  const myAidApplications = useMemo(
    () => aidApplications.filter((application) => application.employeeId === currentEmployee?.id),
    [aidApplications, currentEmployee?.id]
  );

  const myIncidentReports = useMemo(
    () => calamityReports.filter((report) => report.affectedEmployeeIds.includes(currentEmployee?.id ?? '')),
    [calamityReports, currentEmployee?.id]
  );

  const handleSubmitEmployeeAidApplication = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentEmployee) {
      setEmployeePortalMessage('Your employee profile could not be found. Please sign in with your official email.');
      return;
    }

    const amount = Number(employeeAidForm.amountPhp);
    if (!employeeAidForm.description.trim() || Number.isNaN(amount) || amount <= 0) {
      setEmployeePortalMessage('Please enter a valid aid request amount and description.');
      return;
    }

    const newAidApplication: AidApplication = {
      id: `AID-EMP-${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      incidentId: '',
      incidentName: employeeAidForm.incidentName.trim() || 'Self-Reported Local Calamity',
      aidType: employeeAidForm.aidType,
      amountPhp: amount,
      description: employeeAidForm.description.trim(),
      status: 'Submitted',
      priority: employeeAidForm.priority,
      filedDate: new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
      department: currentEmployee.department,
      islandGroup: currentEmployee.islandGroup ?? 'Luzon',
    };

    setAidApplications((prev) => [newAidApplication, ...prev]);
    setEmployeeAidForm({ aidType: 'Cash', amountPhp: '', description: '', priority: 'Normal', incidentName: '' });
    setEmployeePortalMessage('Your aid request has been submitted for review.');
    pushLog(`Employee aid request submitted by ${currentEmployee.name}.`, 'success');
  };

  const handleSubmitEmployeeIncidentReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentEmployee) {
      setEmployeePortalMessage('Your employee profile could not be found. Please sign in with your official email.');
      return;
    }

    const incidentName = employeeIncidentForm.incidentName.trim() || employeeIncidentForm.locationLabel.trim() || 'Self-Reported Incident';
    const newReport = {
      id: `SELF-${Date.now()}`,
      timestamp: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      type: employeeIncidentForm.type,
      incidentName,
      locationLabel: employeeIncidentForm.locationLabel.trim() || currentEmployee.address || 'My Location',
      lat: currentEmployee.gpsLat ?? 14.5995,
      lng: currentEmployee.gpsLng ?? 120.9842,
      radiusKm: 1,
      affectedCount: 1,
      affectedEmployeeIds: [currentEmployee.id],
      description: employeeIncidentForm.description.trim() || `Employee ${currentEmployee.name} reported impact from ${employeeIncidentForm.type.toLowerCase()} in their local area.`,
    };

    setCalamityReports((prev) => [newReport, ...prev]);
    setEmployeeIncidentForm({ type: 'Fire', description: '', locationLabel: '', incidentName: '', lat: 0, lng: 0, locationPinned: false, iAmVictim: true });
    setEmployeePortalMessage('Your incident report has been filed and shared with the response team.');
    setSimulationActive(true);
    pushLog(`Self-reported incident filed by ${currentEmployee.name}.`, 'warn');
  };

  const handleTagMyselfAsVictim = () => {
    if (!currentEmployee) {
      setEmployeePortalMessage('Your employee profile could not be found. Please sign in with your official email.');
      return;
    }

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === currentEmployee.id
          ? {
              ...emp,
              status: 'Red' as SafetyStatus,
              contacted: true,
              unresponsive: false,
              safetyMessage: 'Self-reported as affected by local calamity.',
              lastResponseRecv: new Date().toLocaleTimeString(),
              rescueDispatched: false,
            }
          : emp
      )
    );
    setEmployeePortalMessage('You have been marked as affected and the response team has been notified.');
    pushLog(`${currentEmployee.name} flagged themselves as a victim.`, 'err');
  };

  const handleMarkMyselfSafe = () => {
    if (!currentEmployee) {
      setEmployeePortalMessage('Your employee profile could not be found. Please sign in with your official email.');
      return;
    }

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === currentEmployee.id
          ? {
              ...emp,
              status: 'Green' as SafetyStatus,
              contacted: true,
              unresponsive: false,
              safetyMessage: 'Marked myself as safe.',
              lastResponseRecv: new Date().toLocaleTimeString(),
              rescueDispatched: false,
            }
          : emp
      )
    );
    setEmployeePortalMessage('You have been marked safe. Update your location or submit a report only if conditions change.');
    pushLog(`${currentEmployee.name} marked themselves safe.`, 'success');
  };

  const handleMarkMyselfNeedHelp = () => {
    if (!currentEmployee) {
      setEmployeePortalMessage('Your employee profile could not be found. Please sign in with your official email.');
      return;
    }

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === currentEmployee.id
          ? {
              ...emp,
              status: 'Yellow' as SafetyStatus,
              contacted: true,
              unresponsive: false,
              safetyMessage: 'Assistance requested. Awaiting response from your supervisor.',
              lastResponseRecv: new Date().toLocaleTimeString(),
              rescueDispatched: false,
            }
          : emp
      )
    );
    setEmployeePortalMessage('Your request for help has been sent and the response team is reviewing it.');
    pushLog(`${currentEmployee.name} marked themselves as needing help.`, 'warn');
  };

  const handleUpdateMyLocation = () => {
    if (!currentEmployee) {
      setEmployeePortalMessage('Your employee profile could not be found. Please sign in with your official email.');
      return;
    }

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === currentEmployee.id
          ? {
              ...emp,
              address: locationUpdate,
            }
          : emp
      )
    );
    setEmployeePortalMessage('Location updated. Your profile has been refreshed with the latest address.');
    pushLog(`${currentEmployee.name} updated their location.`, 'success');
  };

  const handleExportCalamityReport = (
    report: typeof calamityReports[number],
    affectedEmps: Employee[]
  ) => {
    const count = exportCalamityReportEmployees(affectedEmps, report, activeDisaster);
    pushLog(
      count > 0
        ? `Exported calamity report "${report.incidentName}": ${count} affected employee(s).`
        : `Export completed — no affected employees in report "${report.incidentName}".`,
      count > 0 ? 'success' : 'warn'
    );
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={handleLogin}
        error={authError}
        isSubmitting={isSubmittingLogin}
        officialEmailHint={officialAccountEmails[0]}
      />
    );
  }

  if (currentUser.role === 'official') {
    return (
      <div className="bg-[#f8fafc] text-slate-900 min-h-screen flex flex-col font-sans transition-colors duration-250">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50 shadow-sm">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <div className="bg-[#002060] text-white p-1.5 rounded flex items-center justify-center shadow-sm">
                <MapIcon className="w-5 h-5 shrink-0" />
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#002060] uppercase animate-fade-in">
                Employee Self-Service Portal
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-xl mt-1">
              Submit aid requests, report incident impact, and flag yourself as affected from one secure workspace.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-slate-50/80 px-3 py-2 rounded-lg border border-slate-200">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Signed in as</p>
              <p className="text-sm font-semibold text-slate-900">{currentUser.username}</p>
              <p className="text-[11px] capitalize text-slate-500">{currentUser.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#002060] hover:text-[#002060]"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <nav className="w-[220px] shrink-0 bg-[#002060] flex flex-col sticky top-0 z-40 shadow-xl" style={{ height: 'calc(100vh - 73px)', position: 'sticky', top: 73 }}>
            <div className="px-5 pt-6 pb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60">Navigation</span>
            </div>
            <div className="flex flex-col px-3 py-1 gap-0.5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/40 px-1 mt-2 mb-0.5">Employee Actions</p>
              {[
                { key: 'dashboard', label: 'My Dashboard', icon: LayoutDashboard },
                { key: 'checkin', label: 'Calamity Report', icon: ShieldAlert },
                { key: 'alerts', label: 'Alerts Near Me', icon: AlertTriangle },
                { key: 'aid', label: 'Aid Assistance', icon: HeartHandshake },
                { key: 'profile', label: 'My Profile', icon: BookUser },
                { key: 'contacts', label: 'Emergency Contacts', icon: HelpCircle },
                { key: 'notifications', label: 'Notifications', icon: Clock },
              ].map((tab) => {
                const isActive = employeePortalPage === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setEmployeePortalPage(tab.key as any)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition ${
                      isActive ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-blue-300'}`} />
                    <span className="flex-1 leading-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mx-5 my-4 border-t border-white/10" />
            <div className="px-4">
              <div className="bg-white/8 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-300/60">Portal Status</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-[11px] text-emerald-300 font-bold">Ready for submissions</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-[10px] text-blue-300/50 font-mono">{currentEmployee?.department ?? 'Employee'}</span>
                  <span className="text-[10px] text-emerald-400/70 font-mono">{currentEmployee?.status ?? 'Green'}</span>
                </div>
              </div>
            </div>
          </nav>

          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
            <main className="max-w-[1180px] w-full mx-auto space-y-8 min-h-0">
              <div className="space-y-7">
                <section className="mx-auto rounded-[32px] border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 shadow-[0_18px_48px_rgba(15,23,42,0.08)] overflow-hidden">
                  
                </section>

                {employeePortalPage === 'dashboard' && (
                  <>
                    <div className="space-y-6">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h1 className="text-3xl font-black text-slate-900">My Dashboard</h1>
                          <p className="text-slate-600 text-sm mt-1">Submit aid requests, report incident impact, and flag yourself as affected.</p>
                        </div>
                       
                      </div>

                      {/* Safety Status Check-In Section */}
                      <section className="bg-gradient-to-r from-[#001f4b] to-[#002a60] rounded-[24px] p-8 text-white">
                        <div>
                          <h2 className="text-2xl font-black tracking-wider">Safety Status Check-In</h2>
                          <p className="text-blue-200 text-sm mt-2">Please update your current status to help us coordinate response efforts.</p>
                        </div>
                        
                        {/* Status Cards Grid */}
                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                          {/* I'm Safe Card */}
                          <button
                            onClick={handleMarkMyselfSafe}
                            className="group rounded-[20px] bg-white/10 hover:bg-white/20 border border-white/20 p-6 text-left transition-all duration-300"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition">
                                  <CheckCircle className="w-6 h-6 text-emerald-300" />
                                </div>
                                <h3 className="mt-4 font-bold text-lg">I'm Safe</h3>
                                <p className="text-blue-200 text-sm mt-2">I am not affected and do not require assistance.</p>
                              </div>
                            </div>
                          </button>

                          {/* Need Help Card */}
                          <button
                            onClick={handleMarkMyselfNeedHelp}
                            className="group rounded-[20px] bg-white/10 hover:bg-white/20 border border-white/20 p-6 text-left transition-all duration-300"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition">
                                  <AlertTriangle className="w-6 h-6 text-amber-300" />
                                </div>
                                <h3 className="mt-4 font-bold text-lg">Need Help</h3>
                                <p className="text-blue-200 text-sm mt-2">I am affected and may need non-urgent support.</p>
                              </div>
                            </div>
                          </button>

                          {/* Emergency Card */}
                          <button
                            onClick={handleTagMyselfAsVictim}
                            className="group rounded-[20px] bg-white/10 hover:bg-white/20 border border-white/20 p-6 text-left transition-all duration-300"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center group-hover:bg-rose-500/30 transition">
                                  <ShieldAlert className="w-6 h-6 text-rose-300" />
                                </div>
                                <h3 className="mt-4 font-bold text-lg">Emergency</h3>
                                <p className="text-blue-200 text-sm mt-2">I am in immediate danger and need urgent rescue.</p>
                              </div>
                            </div>
                          </button>
                        </div>
                      </section>

                      {/* Action Cards */}
                      <div className="grid gap-6 md:grid-cols-2">
                        {/* File Incident Report Card */}
                        <div className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <FileWarning className="w-6 h-6 text-blue-600" />
                              </div>
                              <h3 className="mt-4 text-lg font-bold text-slate-900">File Calamity Report</h3>
                              <p className="text-slate-600 text-sm mt-2">Report a local calamity with an interactive map, self-tag as a victim, and submit for manager verification.</p>
                              <button
                                onClick={() => setEmployeePortalPage('checkin')}
                                className="mt-4 text-blue-600 font-semibold text-sm hover:text-blue-700 flex items-center gap-2"
                              >
                                Start Report <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Request Aid Assistance Card */}
                        <div className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                                <HeartHandshake className="w-6 h-6 text-rose-600" />
                              </div>
                              <h3 className="mt-4 text-lg font-bold text-slate-900">Request Aid Assistance</h3>
                              <p className="text-slate-600 text-sm mt-2">Apply for financial support, medical, or logistical support from the company.</p>
                              <button
                                onClick={() => setEmployeePortalPage('aid')}
                                className="mt-4 text-rose-600 font-semibold text-sm hover:text-rose-700 flex items-center gap-2"
                              >
                                Apply for Aid <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Active Alerts and Recent Activity */}
                      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                        {/* Active Alerts Section */}
                        <section className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-5">
                            <div>
                              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-slate-600" />
                                Active Alerts Near You
                              </h3>
                            </div>
                            <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-3 py-1 rounded-full">Within 50km</span>
                          </div>

                          <div className="space-y-4">
                            {calamityReports.length > 0 ? (
                              calamityReports.map((report) => {
                                const distance = currentEmployee && currentEmployee.gpsLat !== undefined && currentEmployee.gpsLng !== undefined 
                                  ? haversineKm(currentEmployee.gpsLat, currentEmployee.gpsLng, report.lat, report.lng) 
                                  : null;
                                return (
                                  <div key={report.id} className="rounded-[16px] border-2 border-rose-200 bg-rose-50 p-4">
                                    <div className="flex items-start gap-3">
                                      <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <AlertTriangle className="w-5 h-5 text-white" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-bold text-slate-900 text-sm">{report.incidentName}</h4>
                                          <span className="text-xs font-bold uppercase tracking-wide text-rose-700 bg-rose-200 px-2 py-0.5 rounded-full">ACTIVE</span>
                                        </div>
                                        <p className="text-slate-600 text-xs mt-1">{report.description}</p>
                                        <p className="text-slate-500 text-xs mt-2">
                                          Updated {Math.floor(Math.random() * 30)} mins ago
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                                <p className="text-slate-600 text-sm">No active alerts at this time. Stay vigilant.</p>
                              </div>
                            )}
                          </div>
                        </section>

                        {/* My Recent Activity Section */}
                        <section className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm">
                          <h3 className="text-lg font-bold text-slate-900 mb-5">My Recent Activity</h3>
                          <div className="space-y-4">
                            {[
                              { icon: CheckCircle, text: 'Status updated to SAFE', time: 'Today, 09:41 AM', color: 'emerald' },
                              { icon: HeartHandshake, text: 'Aid Request #1042 Approved', time: 'Oct 12, 2023', color: 'blue' },
                              { icon: FileWarning, text: 'Incident Report Filed', time: 'Oct 10, 2023', color: 'orange' },
                            ].map((activity, idx) => {
                              const Icon = activity.icon;
                              const colorMap: Record<string, string> = {
                                emerald: 'bg-emerald-100 text-emerald-600',
                                blue: 'bg-blue-100 text-blue-600',
                                orange: 'bg-orange-100 text-orange-600',
                              };
                              return (
                                <div key={idx} className="flex items-start gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorMap[activity.color]}`}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-slate-700 text-sm font-medium">{activity.text}</p>
                                    <p className="text-slate-500 text-xs">{activity.time}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      </div>
                    </div>
                  </>
                )}

                {employeePortalPage === 'checkin' && (
                  <div className="space-y-6">
                    {/* Header */}
                    <div>
                      <h1 className="text-3xl font-black text-slate-900">Calamity Report</h1>
                      <p className="text-slate-600 text-sm mt-1">File a local calamity report and self-tag as a victim. Your report will be reviewed by your manager before it appears in the official Active Incidents list.</p>
                    </div>

                    {/* My Submitted Reports */}
                    {pendingEmployeeReports.filter(r => r.employeeId === currentEmployee?.id).length > 0 && (
                      <section className="bg-white border border-slate-200 rounded-[24px] shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-gradient-to-r from-[#001f4b] to-[#00255a] flex items-center justify-between">
                          <div>
                            <p className="text-white font-black text-base tracking-wide">My Submitted Reports</p>
                            <p className="text-blue-300 text-xs mt-0.5">Track the status of your filed calamity reports</p>
                          </div>
                          <span className="bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[11px] font-black px-3 py-1 rounded-full">
                            {pendingEmployeeReports.filter(r => r.employeeId === currentEmployee?.id && r.status === 'Pending').length} Pending
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {pendingEmployeeReports.filter(r => r.employeeId === currentEmployee?.id).map(report => {
                            const statusCfgMap = {
                              Pending:  { bg: 'bg-amber-50 border-amber-200 text-amber-700', label: '⏳ Pending Verification' },
                              Approved: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', label: '✅ Approved' },
                              Rejected: { bg: 'bg-rose-50 border-rose-200 text-rose-700', label: '❌ Rejected' },
                            };
                            const statusCfg = statusCfgMap[report.status];
                            const typeEmoji: Record<string, string> = { Fire: '🔥', Earthquake: '🚨', Typhoon: '🌀', Other: '⚠️' };
                            return (
                              <div key={report.id} className="px-6 py-4 flex items-start gap-4">
                                <span className="text-2xl shrink-0 mt-0.5">{typeEmoji[report.type] ?? '⚠️'}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-bold text-slate-800 text-sm">{report.incidentName}</p>
                                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${statusCfg.bg}`}>
                                      {statusCfg.label}
                                    </span>
                                  </div>
                                  <p className="text-slate-500 text-xs mt-0.5">{report.locationLabel}</p>
                                  <p className="text-slate-400 text-xs mt-1 font-mono">{report.timestamp}</p>
                                  {report.status === 'Rejected' && (
                                    <p className="text-rose-600 text-xs mt-2 font-medium">Your report was reviewed and rejected by the manager. You may file a new report if the situation persists.</p>
                                  )}
                                  {report.status === 'Pending' && (
                                    <p className="text-amber-700 text-xs mt-2">Your report is being reviewed. Your safety status has been set to <strong>Need Help</strong> in the meantime.</p>
                                  )}
                                  {report.status === 'Approved' && (
                                    <p className="text-emerald-700 text-xs mt-2">Your report has been verified and added to the official Active Incidents list.</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Report Form */}
                    <section className="bg-white border border-slate-200 rounded-[24px] shadow-sm overflow-hidden">
                      <div className="px-6 py-5 bg-gradient-to-r from-[#001f4b] to-[#00255a] border-b border-[#00172f]">
                        <p className="text-white font-black text-lg tracking-[0.06em]">File a Calamity Report</p>
                        <p className="text-slate-300 text-sm mt-1">Describe the calamity, pin your location on the map, and submit for manager review.</p>
                      </div>

                      <form onSubmit={handleSubmitEmployeeCrisisReport} className="p-6 space-y-6">

                        {/* Success / Error message */}
                        {employeePortalMessage && (
                          <div className={`rounded-xl px-4 py-3 text-sm font-medium border ${
                            employeePortalMessage.includes('awaiting')
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}>
                            {employeePortalMessage}
                            <button type="button" onClick={() => setEmployeePortalMessage('')} className="ml-2 opacity-60 hover:opacity-100">✕</button>
                          </div>
                        )}

                        {/* Calamity Type */}
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Calamity Type</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {(['Fire', 'Earthquake', 'Typhoon', 'Other'] as const).map(t => {
                              const emoji: Record<string, string> = { Fire: '🔥', Earthquake: '🚨', Typhoon: '🌀', Other: '⚠️' };
                              return (
                                <button type="button" key={t}
                                  onClick={() => setEmployeeIncidentForm(prev => ({ ...prev, type: t }))}
                                  className={`rounded-xl py-3 text-sm font-bold border-2 transition flex flex-col items-center gap-1 ${
                                    employeeIncidentForm.type === t
                                      ? 'bg-[#002060] border-[#002060] text-white shadow-md'
                                      : 'bg-white border-slate-200 text-slate-700 hover:border-[#002060] hover:bg-blue-50'
                                  }`}
                                >
                                  <span className="text-xl">{emoji[t]}</span>
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Incident name */}
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Incident Name <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                          <input
                            type="text"
                            value={employeeIncidentForm.incidentName}
                            onChange={e => setEmployeeIncidentForm(prev => ({ ...prev, incidentName: e.target.value }))}
                            placeholder={`e.g. ${employeeIncidentForm.type} in Barangay San Roque`}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#002060]/30 placeholder:text-slate-400 transition"
                          />
                        </div>

                        {/* Map + geocode */}
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Incident Location</label>
                          <p className="text-xs text-slate-500 mb-3">Search for a place or click directly on the map to pin the incident location. Only your own marker is shown.</p>
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              value={employeeIncidentForm.locationLabel}
                              onChange={e => setEmployeeIncidentForm(prev => ({ ...prev, locationLabel: e.target.value, locationPinned: false }))}
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleEmpGeocode())}
                              placeholder="Search location (e.g. Tondo, Manila)"
                              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#002060]/30 placeholder:text-slate-400 transition"
                            />
                            <button type="button" onClick={handleEmpGeocode} disabled={empIsGeocoding}
                              className="px-4 py-2.5 bg-[#002060] hover:bg-[#003399] disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shrink-0">
                              {empIsGeocoding ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <MapPin className="w-4 h-4" />}
                              {empIsGeocoding ? 'Searching…' : 'Search'}
                            </button>
                          </div>
                          {empGeocodeError && <p className="text-rose-600 text-xs mb-2 font-medium">{empGeocodeError}</p>}
                          {employeeIncidentForm.locationPinned && (
                            <div className="flex items-center gap-2 mb-2 text-emerald-700 text-xs font-bold">
                              <CheckCircle className="w-4 h-4" />
                              Location pinned: {employeeIncidentForm.lat.toFixed(4)}°N, {employeeIncidentForm.lng.toFixed(4)}°E
                            </div>
                          )}
                          <div
                            ref={empCalamityMapRef}
                            className="w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm"
                            style={{ height: '340px', zIndex: 0 }}
                          />
                          <p className="text-xs text-slate-400 mt-1.5">Click anywhere on the map to pin the incident location.</p>
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Description <span className="text-rose-500">*</span></label>
                          <textarea
                            rows={4}
                            value={employeeIncidentForm.description}
                            onChange={e => setEmployeeIncidentForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Describe what happened, severity, and any immediate danger you are in..."
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#002060]/30 placeholder:text-slate-400 transition resize-none"
                          />
                        </div>

                        {/* I am a victim */}
                        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                          <input
                            id="iAmVictim"
                            type="checkbox"
                            checked={employeeIncidentForm.iAmVictim}
                            onChange={e => setEmployeeIncidentForm(prev => ({ ...prev, iAmVictim: e.target.checked }))}
                            className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                          <label htmlFor="iAmVictim" className="cursor-pointer">
                            <p className="text-sm font-bold text-amber-800">I am tagging myself as a victim of this calamity</p>
                            <p className="text-xs text-amber-700 mt-0.5">Checking this will set your safety status to <strong>Need Help</strong> until the manager approves or rejects your report.</p>
                          </label>
                        </div>

                        {/* Submit */}
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-xs text-slate-500">Your report will be sent to your manager for verification before appearing in Active Incidents.</p>
                          <button
                            type="submit"
                            className="ml-4 shrink-0 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-black px-6 py-3 rounded-2xl text-sm transition flex items-center gap-2 shadow-md active:scale-95"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            Submit Report
                          </button>
                        </div>
                      </form>
                    </section>
                  </div>
                )}

                {employeePortalPage === 'alerts' && (
                  <section className="bg-white border border-slate-200 rounded-[32px] shadow-[0_18px_48px_rgba(15,23,42,0.08)] overflow-hidden">
                    <div className="px-6 py-5 bg-[#001f4b] border-b border-[#00172f]">
                      <p className="text-white font-black text-lg tracking-[0.06em]">Alerts Near Me</p>
                      <p className="text-slate-300 text-sm mt-1">Live risk information for your current location.</p>
                    </div>
                    <div className="p-7 grid gap-4 md:grid-cols-2">
                      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-black uppercase tracking-[0.35em] text-slate-500">Active hazard</p>
                        <p className="mt-4 text-lg font-semibold text-slate-900">{activeDisaster.name}</p>
                        <p className="mt-2 text-sm text-slate-600">{activeDisaster.subName}</p>
                        <p className="mt-3 text-sm text-slate-600">Located in {activeDisaster.locationName}. Radius: {epicenter.radiusKm} km.</p>
                      </div>
                      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-black uppercase tracking-[0.35em] text-slate-500">Your distance</p>
                        <p className="mt-4 text-3xl font-black text-slate-900">{currentEmployee ? `${getDistance(currentEmployee).toFixed(1)} km` : 'Unknown'}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {currentEmployee
                            ? getDistance(currentEmployee) <= epicenter.radiusKm
                              ? 'You are inside the active hazard zone. Follow local guidance immediately.'
                              : 'You are outside the active hazard zone. Monitor updates closely.'
                            : 'Employee location not available.'}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {employeePortalPage === 'profile' && (
                  <section className="bg-white border border-slate-200 rounded-[32px] shadow-[0_18px_48px_rgba(15,23,42,0.08)] overflow-hidden">
                    <div className="bg-[#001f4b] px-6 py-5 border-b border-[#00172f]">
                      <p className="text-white font-black text-lg tracking-[0.06em]">My Profile</p>
                      <p className="text-slate-300 text-sm mt-1">Review your contact details and keep your location current.</p>
                    </div>
                    <div className="p-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Name</p>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{currentEmployee?.name ?? 'Employee'}</p>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Department</p>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{currentEmployee?.department ?? '—'}</p>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Carrier</p>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{currentEmployee?.carrier ?? 'N/A'}</p>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Contact</p>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{currentEmployee?.phone ?? 'Not provided'}</p>
                      </div>
                    </div>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Home address</p>
                        <p className="mt-2 text-sm text-slate-600">{currentEmployee?.address ?? 'No address on file.'}</p>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-semibold text-slate-900">Update my location</p>
                        <div className="mt-3 flex flex-col gap-3">
                          <input
                            value={locationUpdate}
                            onChange={(event) => setLocationUpdate(event.target.value)}
                            placeholder="Enter updated address"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                          />
                          <button
                            onClick={handleUpdateMyLocation}
                            className="rounded-2xl bg-[#002060] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#001848]"
                          >
                            Save location
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {employeePortalPage === 'contacts' && (
                  <section className="bg-white border border-slate-200 rounded-[32px] shadow-[0_18px_48px_rgba(15,23,42,0.08)] overflow-hidden">
                    <div className="px-6 py-5 bg-[#001f4b] border-b border-[#00172f]">
                      <p className="text-white font-black text-lg tracking-[0.06em]">Emergency Contacts</p>
                      <p className="text-slate-300 text-sm mt-1">Quick access to your local emergency and response numbers.</p>
                    </div>
                    <div className="p-7 grid gap-4 sm:grid-cols-2">
                      {[
                        { label: 'Emergency Police', value: '117' },
                        { label: 'Medical Rescue', value: '911' },
                        { label: 'Barangay Hall', value: '0927-000-1234' },
                        { label: 'Disaster Response Team', value: '0998-111-2222' },
                      ].map((contact) => (
                        <div key={contact.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <p className="text-sm font-semibold text-slate-900">{contact.label}</p>
                          <p className="mt-2 text-lg font-black text-slate-900">{contact.value}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {employeePortalPage === 'notifications' && (
                  <section className="bg-white border border-slate-200 rounded-[32px] shadow-[0_18px_48px_rgba(15,23,42,0.08)] overflow-hidden">
                    <div className="px-6 py-5 bg-[#001f4b] border-b border-[#00172f]">
                      <p className="text-white font-black text-lg tracking-[0.06em]">Notifications</p>
                      <p className="text-slate-300 text-sm mt-1">Recent alerts and portal messages for your action.</p>
                    </div>
                    <div className="p-7 space-y-4">
                      {[
                        { title: 'Weather advisory issued for Cebu', description: 'Typhoon signal level may change in the next 6 hours.' },
                        { title: 'Relief package distribution scheduled', description: 'Aid team will coordinate with affected barangays.' },
                        { title: 'Shelter availability updated', description: 'Nearest barangay hall is now open for evacuees.' },
                      ].map((item) => (
                        <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                        </div>
                      ))}
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <p className="font-semibold text-slate-900">Portal messages</p>
                        <p className="mt-2 text-sm text-slate-600">{employeePortalMessage || 'No new personal notifications.'}</p>
                      </div>
                    </div>
                  </section>
                )}

                {employeePortalPage === 'aid' && (
                  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-[#002060] px-4 py-3 border-b border-[#001848]">
                      <p className="text-white font-extrabold text-sm tracking-wide">Aid Applications</p>
                      <p className="text-blue-300 text-[11px] mt-1">Submit and track your support requests</p>
                    </div>
                    <div className="p-6">
                      <form className="space-y-4" onSubmit={handleSubmitEmployeeAidApplication}>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="text-sm font-semibold text-slate-700">
                            <span className="mb-2 block">Aid type</span>
                            <select
                              value={employeeAidForm.aidType}
                              onChange={(event) => setEmployeeAidForm((prev) => ({ ...prev, aidType: event.target.value as 'Cash' | 'Relief Goods' | 'Both' }))}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                            >
                              <option value="Cash">Cash</option>
                              <option value="Relief Goods">Relief Goods</option>
                              <option value="Both">Both</option>
                            </select>
                          </label>
                          <label className="text-sm font-semibold text-slate-700">
                            <span className="mb-2 block">Priority</span>
                            <select
                              value={employeeAidForm.priority}
                              onChange={(event) => setEmployeeAidForm((prev) => ({ ...prev, priority: event.target.value as 'Normal' | 'Urgent' }))}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                            >
                              <option value="Normal">Normal</option>
                              <option value="Urgent">Urgent</option>
                            </select>
                          </label>
                        </div>
                        <label className="block text-sm font-semibold text-slate-700">
                          <span className="mb-2 block">Incident / event name</span>
                          <input
                            value={employeeAidForm.incidentName}
                            onChange={(event) => setEmployeeAidForm((prev) => ({ ...prev, incidentName: event.target.value }))}
                            placeholder="e.g. Typhoon Carina"
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">
                          <span className="mb-2 block">Amount (PHP)</span>
                          <input
                            type="number"
                            min="1"
                            value={employeeAidForm.amountPhp}
                            onChange={(event) => setEmployeeAidForm((prev) => ({ ...prev, amountPhp: event.target.value }))}
                            placeholder="5000"
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">
                          <span className="mb-2 block">Why do you need aid?</span>
                          <textarea
                            value={employeeAidForm.description}
                            onChange={(event) => setEmployeeAidForm((prev) => ({ ...prev, description: event.target.value }))}
                            rows={4}
                            placeholder="Describe your condition or the support you need."
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none"
                          />
                        </label>
                        <button type="submit" className="rounded-2xl bg-[#002060] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#001848]">
                          Submit aid request
                        </button>
                      </form>

                      <div className="mt-6 space-y-3">
                        {myAidApplications.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                            No aid applications yet. Submit one above and it will appear here.
                          </div>
                        ) : (
                          myAidApplications.slice(0, 4).map((application) => (
                            <div key={application.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-900">{application.incidentName}</p>
                                  <p className="mt-1 text-sm text-slate-600">{application.description}</p>
                                </div>
                                <span className="rounded-full bg-[#002060]/10 px-2.5 py-1 text-xs font-semibold text-[#002060]">
                                  {application.status}
                                </span>
                              </div>
                              <p className="mt-3 text-sm text-slate-500">PHP {application.amountPhp?.toLocaleString() ?? '0'} · {application.aidType}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f8fafc] text-slate-900 min-h-screen flex flex-col font-sans transition-colors duration-250">
      
      {/* Pristine Branding Header matching the screenshots exactly */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50 shadow-sm">
        
        {/* Left Side: Title that updates based on the view */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#002060] text-white p-1.5 rounded flex items-center justify-center shadow-sm">
              <MapIcon className="w-5 h-5 shrink-0" />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#002060] uppercase animate-fade-in">
              {isManagerUser ? 'Manager Crisis Intelligence Dashboard' : 'CSR Crisis Intelligence Dashboard'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium max-w-xl mt-1">
            {isManagerUser
              ? `Manager workspace for ${currentEmployee?.name ?? 'your team'}; direct report oversight and approval controls.`
              : `Analyzing workforce and satellite footprints for ${employees.length} personnel across the Philippine Islands.`
            }
          </p>
        </div>

        {/* Center: Role selector & team filter */}
        {isManagerUser ? (
          <div className="flex flex-col items-start gap-2 shrink-0 bg-slate-50/80 px-4 py-3 rounded-lg border border-slate-200">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">SHOW MY TEAM</span>
            <span className="text-sm font-semibold text-slate-900">{directReports.length} members</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 shrink-0 bg-slate-50/80 px-4 py-2 rounded-lg border border-slate-200">
            <label htmlFor="viewer-role" className="text-xs font-bold text-slate-600 whitespace-nowrap">
              Are you:
            </label>
            <select
              id="viewer-role"
              value={viewerRole}
              onChange={(e) => {
                const role = e.target.value as EmployeeTeam;
                setViewerRole(role);
                pushLog(`Viewing portal as ${role}.`, 'info');
              }}
              className="text-xs font-bold text-[#002060] bg-white border border-slate-300 rounded-md px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#002060]/30"
            >
              <option value="HR/CSR">HR/CSR</option>
              <option value="Manager">Manager</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={filterByTeam}
                onChange={(e) => {
                  setFilterByTeam(e.target.checked);
                  pushLog(
                    e.target.checked
                      ? `Filtering to ${viewerRole} team employees only.`
                      : 'Showing all team employees.',
                    'info'
                  );
                }}
                className="rounded border-slate-300 text-[#002060] focus:ring-[#002060]/30 cursor-pointer"
              />
              Show my team only
            </label>
          </div>
        )}

        {/* Right Side: user session + co-labelled corporate logos */}
        <div className="flex items-center gap-3 shrink-0 bg-slate-50/80 px-3 py-2 rounded-lg border border-slate-200">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Signed in as</p>
            <p className="text-sm font-semibold text-slate-900">{currentUser.username}</p>
            <p className="text-[11px] capitalize text-slate-500">{currentUser.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#002060] hover:text-[#002060]"
          >
            Logout
          </button>
          </div>
        <div className="flex items-center gap-4">
          {/* Innodata Logo Block */}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-[#0a4d92] flex items-center justify-center rounded-sm">
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
                <div className="w-0.75 h-0.75 bg-white rounded-full"></div>
              </div>
            </div>
            <span className="text-[#0a4d92] font-black text-base tracking-tight leading-none font-sans">Innodata</span>
          </div>

          <div className="w-px h-6 bg-slate-300"></div>

          {/* Savills Logo Block */}
          <div className="bg-[#ffcb05] px-2 py-0.5 flex items-center justify-center rounded">
            <span className="text-[#dd1c1a] font-black text-xs tracking-tighter italic font-serif leading-none">savills</span>
          </div>
        </div>

      </header>

      {/* ── Body: Sidebar + Page Content ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar Navigation ── */}
        <nav
          className="w-[220px] shrink-0 bg-[#002060] flex flex-col sticky top-0 z-40 shadow-xl"
          style={{ height: 'calc(100vh - 73px)', position: 'sticky', top: 73 }}
        >
          <div className="px-5 pt-6 pb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60">Navigation</span>
          </div>

          <div className="flex flex-col px-3 py-1 gap-0.5">

            {/* ── MAIN ── */}
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/40 px-1 mt-2 mb-0.5">Main</p>
            <button onClick={() => setActivePage('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'dashboard' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${activePage === 'dashboard' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Overview Dashboard</span>
            </button>
            <button onClick={() => setActivePage('executive')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'executive' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <TrendingUp className={`w-4 h-4 shrink-0 ${activePage === 'executive' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Executive Dashboard</span>
            </button>
            {isManagerUser ? (
              <button onClick={() => setActivePage('team-overview')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'team-overview' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
                <Users className={`w-4 h-4 shrink-0 ${activePage === 'team-overview' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
                <span className="flex-1 leading-tight">Team Overview</span>
              </button>
            ) : null}

            {/* ── CRISIS MONITORING ── */}
            <div className="mx-1 my-2.5 border-t border-white/10" />
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/40 px-1 mb-0.5">Crisis Monitoring</p>
            <button onClick={() => setActivePage('incidents')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'incidents' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <Siren className={`w-4 h-4 shrink-0 ${activePage === 'incidents' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Active Incidents</span>
              {calamityReports.length > 0 && (
                <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">{calamityReports.length}</span>
              )}
              {pendingEmployeeReports.filter(r => r.status === 'Pending').length > 0 && (
                <span className="bg-amber-400 text-amber-900 text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none animate-pulse" title="Pending employee reports">{pendingEmployeeReports.filter(r => r.status === 'Pending').length}</span>
              )}
            </button>
            <button onClick={() => setActivePage('safety')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'safety' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <ShieldCheck className={`w-4 h-4 shrink-0 ${activePage === 'safety' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Employee Safety</span>
              {employeeStatusCounts.red > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">{employeeStatusCounts.red}</span>
              )}
            </button>
            <button onClick={() => setActivePage('risk-map')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'risk-map' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <Layers className={`w-4 h-4 shrink-0 ${activePage === 'risk-map' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Risk Classification Map</span>
            </button>

            {/* ── AID MANAGEMENT ── */}
            <div className="mx-1 my-2.5 border-t border-white/10" />
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/40 px-1 mb-0.5">Aid Management</p>
            <button onClick={() => setActivePage('aid')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'aid' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <HeartHandshake className={`w-4 h-4 shrink-0 ${activePage === 'aid' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Aid Applications</span>
              {aidApplications.filter(a => a.status === 'Submitted').length > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">{aidApplications.filter(a => a.status === 'Submitted').length}</span>
              )}
            </button>

            {/* ── EMPLOYEES ── */}
            <div className="mx-1 my-2.5 border-t border-white/10" />
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-300/40 px-1 mb-0.5">Employees</p>
            <button onClick={() => setActivePage('directory')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left group ${activePage === 'directory' ? 'bg-white/15 text-white border border-white/10 shadow-inner' : 'text-blue-200/80 hover:bg-white/10 hover:text-white'}`}>
              <BookUser className={`w-4 h-4 shrink-0 ${activePage === 'directory' ? 'text-white' : 'text-blue-300 group-hover:text-white'}`} />
              <span className="flex-1 leading-tight">Employee Directory</span>
            </button>

          </div>

          <div className="mx-5 my-4 border-t border-white/10" />

          {/* Status card */}
          <div className="px-4">
            <div className="bg-white/8 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-300/60">System Status</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[11px] text-emerald-300 font-bold">Database Live</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ simulationActive ? 'bg-orange-400 animate-pulse' : 'bg-slate-600' }`} />
                <span className={`text-[11px] font-bold ${ simulationActive ? 'text-orange-300' : 'text-blue-300/60' }`}>
                  { simulationActive ? 'Incident Active' : 'No Active Alert' }
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-[10px] text-blue-300/50 font-mono">{employees.length} FTE</span>
                <span className="text-[10px] text-emerald-400/70 font-mono">
                  {employeeStatusCounts.green} safe
                </span>
              </div>
            </div>
          </div>
        </nav>

        {/* ── Page Content Area ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">

        {/* ──────────── DASHBOARD PAGE ──────────── */}
        {activePage === 'dashboard' && <>

      {/* Main Corporate Workspace */}
      <main className="flex-1 max-w-[1550px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">

        {/* Left Column: Region / Island Group Filter Panel */}
        <section className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[750px]">

          {/* Panel header */}
          <div className="bg-[#002060] px-4 py-2.5 border-b border-[#001848] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-white font-extrabold text-sm tracking-wide">Location Filter</span>
              <span className="text-blue-300 font-mono text-[10px] font-bold">{employees.length} FTE</span>
            </div>
            {/* Tab switcher */}
            <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => { setPanelTab('region'); setSelectedRegion(null); setSelectedIslandGroup(null); setSelectedCity(null); }}
                className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                  panelTab === 'region'
                    ? 'bg-white text-[#002060] shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                By Region
              </button>
              <button
                onClick={() => { setPanelTab('island'); setSelectedRegion(null); setSelectedIslandGroup(null); setSelectedCity(null); }}
                className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                  panelTab === 'island'
                    ? 'bg-white text-[#002060] shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                By Island
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ══ ALL PHILIPPINES ROW (always shown) ══ */}
            <button
              onClick={() => {
                setSelectedIslandGroup(null);
                setSelectedRegion(null);
                setSelectedCity(null);
                pushLog(`Viewing all Philippine island groups (${employees.length} employees).`, 'info');
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer border-b border-slate-200 hover:bg-[#ebf1fc] ${
                !selectedIslandGroup && !selectedRegion && !selectedCity
                  ? 'bg-[#d9e1f2] border-l-4 border-l-[#002060]'
                  : 'bg-slate-50'
              }`}
            >
              <span className="font-extrabold text-[#002060] text-sm">🇵🇭 Philippines (All)</span>
              <strong className="font-black text-[#002060] text-base">{employees.length}</strong>
            </button>

            {/* ══ BY REGION TAB ══ */}
            {panelTab === 'region' && (() => {
              // Group locations by region code
              const regionLocMap = new Map<string, typeof ALL_ISLAND_LOCATIONS>();
              ALL_ISLAND_LOCATIONS.forEach(loc => {
                const arr = regionLocMap.get(loc.region) ?? [];
                arr.push(loc);
                regionLocMap.set(loc.region, arr);
              });

              // Only show regions that have locations
              const activeRegions = PHILIPPINE_REGIONS.filter(r => regionLocMap.has(r.code));

              const colorMap: Record<string, { bg: string; text: string; dot: string; badge: string; border: string; hover: string }> = {
                violet: { bg: 'bg-violet-50',  text: 'text-violet-900', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-900 border-violet-200', border: 'border-l-violet-600', hover: 'hover:bg-violet-50' },
                emerald:{ bg: 'bg-emerald-50', text: 'text-emerald-900',dot: 'bg-emerald-500',badge: 'bg-emerald-100 text-emerald-900 border-emerald-200',border: 'border-l-emerald-600',hover: 'hover:bg-emerald-50' },
                sky:    { bg: 'bg-sky-50',     text: 'text-sky-900',    dot: 'bg-sky-500',    badge: 'bg-sky-100 text-sky-900 border-sky-200',           border: 'border-l-sky-600',    hover: 'hover:bg-sky-50' },
                teal:   { bg: 'bg-teal-50',    text: 'text-teal-900',   dot: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-900 border-teal-200',         border: 'border-l-teal-600',   hover: 'hover:bg-teal-50' },
                cyan:   { bg: 'bg-cyan-50',    text: 'text-cyan-900',   dot: 'bg-cyan-500',   badge: 'bg-cyan-100 text-cyan-900 border-cyan-200',         border: 'border-l-cyan-600',   hover: 'hover:bg-cyan-50' },
                lime:   { bg: 'bg-lime-50',    text: 'text-lime-900',   dot: 'bg-lime-500',   badge: 'bg-lime-100 text-lime-900 border-lime-200',         border: 'border-l-lime-600',   hover: 'hover:bg-lime-50' },
                green:  { bg: 'bg-green-50',   text: 'text-green-900',  dot: 'bg-green-500',  badge: 'bg-green-100 text-green-900 border-green-200',      border: 'border-l-green-600',  hover: 'hover:bg-green-50' },
                yellow: { bg: 'bg-yellow-50',  text: 'text-yellow-900', dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-900 border-yellow-200',   border: 'border-l-yellow-600', hover: 'hover:bg-yellow-50' },
                blue:   { bg: 'bg-blue-50',    text: 'text-blue-900',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-900 border-blue-200',         border: 'border-l-blue-600',   hover: 'hover:bg-blue-50' },
                indigo: { bg: 'bg-indigo-50',  text: 'text-indigo-900', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-900 border-indigo-200',   border: 'border-l-indigo-600', hover: 'hover:bg-indigo-50' },
                purple: { bg: 'bg-purple-50',  text: 'text-purple-900', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-900 border-purple-200',   border: 'border-l-purple-600', hover: 'hover:bg-purple-50' },
                orange: { bg: 'bg-orange-50',  text: 'text-orange-900', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-900 border-orange-200',   border: 'border-l-orange-600', hover: 'hover:bg-orange-50' },
                amber:  { bg: 'bg-amber-50',   text: 'text-amber-900',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-900 border-amber-200',      border: 'border-l-amber-600',  hover: 'hover:bg-amber-50' },
                rose:   { bg: 'bg-rose-50',    text: 'text-rose-900',   dot: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-900 border-rose-200',         border: 'border-l-rose-600',   hover: 'hover:bg-rose-50' },
                red:    { bg: 'bg-red-50',     text: 'text-red-900',    dot: 'bg-red-500',    badge: 'bg-red-100 text-red-900 border-red-200',             border: 'border-l-red-600',    hover: 'hover:bg-red-50' },
                pink:   { bg: 'bg-pink-50',    text: 'text-pink-900',   dot: 'bg-pink-500',   badge: 'bg-pink-100 text-pink-900 border-pink-200',         border: 'border-l-pink-600',   hover: 'hover:bg-pink-50' },
                fuchsia:{ bg: 'bg-fuchsia-50', text: 'text-fuchsia-900',dot: 'bg-fuchsia-500',badge: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200',border: 'border-l-fuchsia-600',hover: 'hover:bg-fuchsia-50' },
              };

              return activeRegions.map(region => {
                const locs = regionLocMap.get(region.code) ?? [];
                const regionFte = regionCounts.get(region.code) ?? 0;
                const c = colorMap[region.color] ?? colorMap.blue;
                const isRegionSelected = selectedRegion === region.code;
                const isCollapsed = collapsedRegions[region.code] ?? false;

                return (
                  <div key={region.code} className="border-b border-slate-100">
                    {/* Region header row */}
                    <div className={`flex items-center gap-0 ${ isRegionSelected ? `${c.bg} border-l-4 ${c.border}` : '' }`}>
                      <button
                        onClick={() => {
                          const newRegion = isRegionSelected ? null : region.code;
                          setSelectedRegion(newRegion);
                          setSelectedIslandGroup(newRegion ? region.islandGroup : null);
                          setSelectedCity(null);
                          if (newRegion) pushLog(`Filtering by ${region.name} — Region ${region.code} (${regionFte} employees).`, 'info');
                        }}
                        className={`flex-1 text-left px-4 py-2 flex items-center gap-2 transition-all cursor-pointer ${c.hover}`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`font-extrabold text-xs ${c.text}`}>
                            Region {region.code}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate leading-tight">{region.name}</div>
                        </div>
                        <span className={`font-mono font-black text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${c.badge}`}>
                          {regionFte}
                        </span>
                      </button>
                      {/* Collapse toggle */}
                      <button
                        onClick={() => setCollapsedRegions(prev => ({ ...prev, [region.code]: !isCollapsed }))}
                        className="px-2 py-2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
                        title={isCollapsed ? 'Expand' : 'Collapse'}
                      >
                        <svg className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* City rows under this region */}
                    {!isCollapsed && locs.map(loc => {
                      const cityEmp = cityCounts.get(loc.city) ?? 0;
                      const isCitySelected = selectedCity === loc.city;
                      return (
                        <button
                          key={loc.name}
                          onClick={() => {
                            setSelectedRegion(region.code);
                            setSelectedIslandGroup(region.islandGroup);
                            setSelectedCity(loc.city);
                            pushLog(`Focused: ${loc.name}, ${loc.city} — Region ${region.code} (${cityEmp} FTEs).`, 'info');
                          }}
                          className={`w-full text-left pl-8 pr-4 py-1.5 flex items-center justify-between transition-all cursor-pointer text-xs ${
                            isCitySelected ? `${c.bg} border-l-4 ${c.border}` : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                          <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0 text-[10px]">
                            {cityEmp}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}

            {/* ══ BY ISLAND GROUP TAB ══ */}
            {panelTab === 'island' && <>
              {/* ── LUZON ── */}
              <button
                onClick={() => {
                  setSelectedIslandGroup('Luzon');
                  setSelectedRegion(null);
                  setSelectedCity(null);
                  pushLog(`Filtering by Luzon island group (${islandCounts.Luzon} employees).`, 'info');
                }}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all hover:bg-emerald-50 cursor-pointer ${
                  selectedIslandGroup === 'Luzon' && !selectedCity ? 'bg-emerald-50 border-l-4 border-l-emerald-600 font-bold' : ''
                }`}
              >
                <span className="font-extrabold text-emerald-800 text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Luzon
                </span>
                <span className="font-mono font-black text-emerald-900 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                  {islandCounts.Luzon} fte
                </span>
              </button>
              {LUZON_LOCATIONS.map(loc => {
                const cityEmp = cityCounts.get(loc.city) ?? 0;
                const isSelected = selectedCity === loc.city;
                return (
                  <button
                    key={loc.name}
                    onClick={() => {
                      setSelectedIslandGroup('Luzon');
                      setSelectedRegion(loc.region);
                      setSelectedCity(loc.city);
                      pushLog(`Focused: ${loc.name}, ${loc.province} (${cityEmp} FTEs).`, 'info');
                    }}
                    className={`w-full text-left pl-8 pr-4 py-2 flex items-center justify-between transition-all hover:bg-slate-50 cursor-pointer text-xs ${
                      isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
                    }`}
                  >
                    <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                    <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                      {cityEmp} fte
                    </span>
                  </button>
                );
              })}

              {/* ── VISAYAS ── */}
              <button
                onClick={() => {
                  setSelectedIslandGroup('Visayas');
                  setSelectedRegion(null);
                  setSelectedCity(null);
                  pushLog(`Filtering by Visayas island group (${islandCounts.Visayas} employees).`, 'info');
                }}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all hover:bg-blue-50 cursor-pointer ${
                  selectedIslandGroup === 'Visayas' && !selectedCity ? 'bg-blue-50 border-l-4 border-l-blue-600 font-bold' : ''
                }`}
              >
                <span className="font-extrabold text-blue-800 text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  Visayas
                </span>
                <span className="font-mono font-black text-blue-900 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                  {islandCounts.Visayas} fte
                </span>
              </button>
              {VISAYAS_LOCATIONS.map(loc => {
                const cityEmp = cityCounts.get(loc.city) ?? 0;
                const isSelected = selectedCity === loc.city;
                return (
                  <button
                    key={loc.name}
                    onClick={() => {
                      setSelectedIslandGroup('Visayas');
                      setSelectedRegion(loc.region);
                      setSelectedCity(loc.city);
                      pushLog(`Focused: ${loc.name}, ${loc.province} (${cityEmp} FTEs).`, 'info');
                    }}
                    className={`w-full text-left pl-8 pr-4 py-2 flex items-center justify-between transition-all hover:bg-slate-50 cursor-pointer text-xs ${
                      isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
                    }`}
                  >
                    <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                    <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                      {cityEmp} fte
                    </span>
                  </button>
                );
              })}

              {/* ── MINDANAO ── */}
              <button
                onClick={() => {
                  setSelectedIslandGroup('Mindanao');
                  setSelectedRegion(null);
                  setSelectedCity(null);
                  pushLog(`Filtering by Mindanao island group (${islandCounts.Mindanao} employees).`, 'info');
                }}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all hover:bg-amber-50 cursor-pointer ${
                  selectedIslandGroup === 'Mindanao' && !selectedCity ? 'bg-amber-50 border-l-4 border-l-amber-600 font-bold' : ''
                }`}
              >
                <span className="font-extrabold text-amber-800 text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Mindanao
                </span>
                <span className="font-mono font-black text-amber-900 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                  {islandCounts.Mindanao} fte
                </span>
              </button>
              {MINDANAO_LOCATIONS.map(loc => {
                const cityEmp = cityCounts.get(loc.city) ?? 0;
                const isSelected = selectedCity === loc.city;
                return (
                  <button
                    key={loc.name}
                    onClick={() => {
                      setSelectedIslandGroup('Mindanao');
                      setSelectedRegion(loc.region);
                      setSelectedCity(loc.city);
                      pushLog(`Focused: ${loc.name}, ${loc.province} (${cityEmp} FTEs).`, 'info');
                    }}
                    className={`w-full text-left pl-8 pr-4 py-2 flex items-center justify-between transition-all hover:bg-slate-50 cursor-pointer text-xs ${
                      isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
                    }`}
                  >
                    <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                    <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                      {cityEmp} fte
                    </span>
                  </button>
                );
              })}
            </>}

          </div>

          {/* Panel footer */}
          <div className="bg-slate-50 p-3 border-t border-slate-200 text-[10px] font-mono text-slate-500 font-bold text-center flex flex-col gap-0.5">
            <span>DATABASE SYNCHRONIZED</span>
            <span>Total Headcount: {employees.length} fte</span>
            {(selectedRegion || selectedIslandGroup) && (
              <span className="text-[#002060] font-black">
                {selectedCity
                  ? `Viewing: ${selectedCity}`
                  : selectedRegion
                  ? `Region ${selectedRegion} · ${regionCounts.get(selectedRegion) ?? 0} fte`
                  : `${selectedIslandGroup} · ${islandCounts[selectedIslandGroup!] ?? 0} fte`
                }
              </span>
            )}
          </div>
        </section>

        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
          
          {/* Map column header: title left, crisis drill controls right */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            {/* Left: live indicator + title */}
            <span className="font-extrabold uppercase text-slate-800 text-xs flex items-center gap-1.5 font-mono shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
              {selectedCity
                ? `${selectedCity} — Local View`
                : selectedRegion
                ? `Region ${selectedRegion} — ${PHILIPPINE_REGIONS.find(r => r.code === selectedRegion)?.name ?? selectedRegion}`
                : selectedIslandGroup
                ? `${selectedIslandGroup} — Workforce Density`
                : 'Philippines — National Overview'}
            </span>

            {/* Right: Calamity Report + Reset controls */}
            <div className="flex flex-wrap items-center gap-2">

              {/* ── Calamity Report Button ── */}
              <button
                id="calamity-report-btn"
                onClick={() => setShowCalamityModal(true)}
                className="px-3 py-1.5 rounded-md text-[10px] font-extrabold transition-all duration-150 flex items-center gap-1.5 border cursor-pointer shrink-0 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-amber-700 text-white shadow-sm hover:shadow-orange-400/40 hover:shadow-md active:scale-95"
                title="File a manual calamity report — pinpoint location and set geofence"
              >
                <FileWarning className="w-3 h-3 shrink-0" />
                <span>Calamity Report</span>
              </button>

              {/* Reset button — always visible */}
              <button
                onClick={handleResetDatabase}
                className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white rounded-md text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition active:scale-95"
                title="Reset all employee statuses and clear active calamity report"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                <span>Reset</span>
              </button>

            </div>
          </div>

          {/* Map Layer container */}
          <div className="flex-1 relative min-h-[400px]">
            <InteractiveMap
              employees={visibleEmployees}
              epicenter={epicenter}
              selectedEmployee={selectedEmployee}
              onSelectEmployee={setSelectedEmployee}
              onEpicenterChange={handleEpicenterChange}
              onDispatchRescue={handleDispatchRescue}
              activeDisaster={activeDisaster}
              mapView={mapView}
              simulationActive={simulationActive}
              selectedCity={selectedCity}
              selectedIslandGroup={selectedIslandGroup}
              selectedRegion={selectedRegion}
            />

            {/* Static Overlay Card inside Metro Cebu Map View */}
            {mapView === 'metro' && (
              <div className="absolute bottom-5 right-5 bg-white/95 border border-slate-350 p-3 rounded-lg shadow-xl z-40 max-w-[210px] text-slate-800 font-sans backdrop-blur-sm">
                <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider block border-b border-slate-200 pb-1.5 mb-1.5 select-none text-right">
                  Number of Employees
                </span>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between gap-4 font-bold">
                    <span className="text-slate-600 font-mono">5 km Radius:</span>
                    <span className="text-indigo-900 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 font-mono font-black text-xs shrink-0 select-all">
                      {fteInside5km} FTE
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 font-semibold">
                    <span className="text-slate-500 font-mono">10 km Radius:</span>
                    <span className="text-indigo-900 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 font-mono font-black text-xs shrink-0 select-all">
                      {fteInside10kmAdditional} FTE
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Dynamic Insight Panel & Legend matching the layouts */}
        <section className="lg:col-span-3 flex flex-col gap-6 max-h-[750px] overflow-y-auto">
          
{/* Employee Roll-Call Panel */}
           <EmployeeRollCall
             employees={visibleEmployees}
             epicenter={epicenter}
             onSelectEmployee={setSelectedEmployee}
             selectedEmployee={selectedEmployee}
             onReportStatus={handleReportStatus}
             simulationActive={simulationActive}
             onSendCheckIn={handleSendCheckIn}
             onSendEmail={handleSendEmail}
             onDispatchRescue={handleDispatchRescue}
           />

          {/* Live Operations Logs feed */}
          <div className="bg-slate-950/95 border border-slate-850 rounded-xl p-4 flex flex-col font-mono text-white shadow-inner min-h-[200px] max-h-[320px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 font-sans text-xs uppercase font-extrabold tracking-wider">
              <span className="flex items-center gap-1 text-orange-400">
                <Activity className="w-4 h-4 text-orange-500 animate-pulse" />
                Live Operations Logs feed
              </span>
              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-400">
                {logs.length} EVENTS
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {logs.map((log) => {
                let logColor = 'text-slate-300';
                if (log.type === 'warn') logColor = 'text-amber-450';
                if (log.type === 'success') logColor = 'text-emerald-400 font-semibold';
                if (log.type === 'err') logColor = 'text-rose-400 font-extrabold animate-pulse';

                return (
                  <div key={log.id} className="text-[10px] leading-relaxed flex items-start gap-1 p-0.5 border-b border-slate-900/50">
                    <span className="text-slate-500 select-none font-bold">[{log.time}]</span>
                    <span className={logColor}>{log.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Calamity Report telemetry panel */}
          {simulationActive && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-mono text-[11px] shadow-2xl flex flex-col gap-3">
              <span className="text-blue-400 font-extrabold flex items-center gap-1.5 uppercase pb-2 border-b border-slate-800 text-[10px]">
                <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse shrink-0" />
                Live Calamity Report Telemetry
              </span>
              
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">Total inside conflagration:</span>
                <span className="text-rose-400 font-black text-sm">{affectedStaff} Personnel</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">Awaiting respond checkin:</span>
                <span className="text-amber-400 font-semibold">{pendingCount} sent</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">Transmission disconnect:</span>
                <span className="text-red-400 font-black">{offlineDangerCount} down</span>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 mt-1 text-[10px] text-zinc-400 font-sans leading-relaxed text-center">
                🔒 <strong>Manual Outreach Mode</strong>
                <p className="mt-1">Automated bulk alerts have been deactivated. Please contact individual personnel manually utilizing their designated check-in triggers.</p>
              </div>

            </div>
          )}

        </section>

      </main>

      {/* Footer inside dashboard */}
      <footer className="bg-[#002060] border-t border-[#001848] py-4 px-6 text-[11px] font-mono text-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-inner uppercase font-bold mt-auto">
        <span>WORKFORCE GEOGRAPHIC PROFILES PORTAL • SAVILLS &amp; INNODATA JOINT INFRASTRUCTURE MAP</span>
        <span className="flex items-center gap-1.5 tracking-wider text-slate-300">
          <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>DATABASE METRICS: OPERATIONAL</span>
        </span>
      </footer>

      {/* ──────────── END DASHBOARD PAGE ──────────── */}
      </>
      }

      {/* ──────────── TEAM OVERVIEW PAGE ──────────── */}
      {activePage === 'team-overview' && (() => {
        const reportCount = directReports.length;
        return (
          <div className="flex-1 p-6 bg-[#f8fafc]">
            <div className="max-w-[1550px] mx-auto flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                    <Users className="w-5 h-5" /> Team Overview
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Review direct report safety status and send quick check-ins from the manager portal.</p>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 px-4 py-3 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Direct Reports</p>
                  <p className="text-3xl font-black text-[#002060]">{reportCount}</p>
                </div>
              </div>

              {reportCount === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
                  No direct reports found for this manager.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {directReports.map((emp) => (
                    <div key={emp.id} className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{emp.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{emp.department} · {emp.role}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black ${emp.status === 'Green' ? 'bg-emerald-100 text-emerald-700' : emp.status === 'Yellow' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {emp.status}
                        </span>
                      </div>
                      <p className="mt-4 text-sm text-slate-600 min-h-[56px]">{emp.address ?? 'No address available'}</p>
                      <div className="mt-5 flex flex-col gap-2">
                        <button onClick={() => handleSendCheckIn(emp.id)} className="rounded-2xl bg-[#002060] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#001848]">Send Check-In</button>
                        <button onClick={() => handleSendEmail(emp.id)} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#002060] hover:text-[#002060]">Send Email Alert</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ──────────── EMPLOYEE DIRECTORY PAGE ──────────── */}
      {activePage === 'directory' && (() => {
        const departments = ['All Departments', ...Array.from(new Set(employees.map(e => e.department))).sort()];
        const regionCounts = new Map<string, number>();
        employees.forEach((e) => {
          const code = e.region === 'NEEDS_UPDATE'
            ? 'NEEDS_UPDATE'
            : (e.region ?? resolveEmployeeRegion({
                gpsLat: e.gpsLat,
                gpsLng: e.gpsLng,
                city: e.address?.split(',').slice(-2, -1)[0]?.trim(),
                province: e.address?.split(',').slice(-1)[0]?.trim(),
              }));
          if (code) regionCounts.set(code, (regionCounts.get(code) ?? 0) + 1);
        });
        const regionsByIsland = {
          Luzon: PHILIPPINE_REGIONS.filter((r) => r.islandGroup === 'Luzon'),
          Visayas: PHILIPPINE_REGIONS.filter((r) => r.islandGroup === 'Visayas'),
          Mindanao: PHILIPPINE_REGIONS.filter((r) => r.islandGroup === 'Mindanao'),
        };

        const getEmpRegion = (e: Employee) =>
          e.region ?? resolveEmployeeRegion({
            gpsLat: e.gpsLat,
            gpsLng: e.gpsLng,
            city: e.address?.split(',').slice(-2, -1)[0]?.trim(),
            province: e.address?.split(',').slice(-1)[0]?.trim(),
          });

        const filtered = employees.filter(e => {
          const q = dirSearch.toLowerCase();
          const empRegion = getEmpRegion(e);
          const matchSearch  = !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.department.toLowerCase().includes(q);
          const matchDept    = dirDept === 'All Departments' || e.department === dirDept;
          const matchIsland  = dirIsland === 'All' || e.islandGroup === dirIsland;
          const matchRegion  = dirRegion === 'All' || empRegion === dirRegion;
          const matchTeam    = !filterByTeam || e.team === viewerRole;
          return matchSearch && matchDept && matchIsland && matchRegion && matchTeam;
        });

        const islandColors: Record<string, string> = {
          Luzon:   'bg-emerald-600 border-emerald-700 text-white shadow-emerald-300/30',
          Visayas: 'bg-blue-600 border-blue-700 text-white shadow-blue-300/30',
          Mindanao:'bg-amber-600 border-amber-700 text-white shadow-amber-300/30',
        };
        const islandInactive = 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50';

        return (
          <div className="flex-1 p-6 bg-[#f8fafc]">
            <div className="max-w-[1550px] mx-auto flex flex-col gap-5">

              {/* Page header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                    <BookUser className="w-5 h-5" /> Employee Directory
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage employee records and residential location data across {employees.length} personnel.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddEmployeeModal(true)}
                  className="bg-[#002060] hover:bg-[#003399] text-white text-xs font-black px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition active:scale-95 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Employee
                </button>
              </div>

              {/* Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-col gap-3">
                {/* Row 1: search + dept + island + record count */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by name, ID, or department..."
                      value={dirSearch}
                      onChange={e => setDirSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 transition"
                    />
                  </div>

                  {/* Department dropdown */}
                  <select
                    value={dirDept}
                    onChange={e => setDirDept(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {departments.map(d => <option key={d}>{d}</option>)}
                  </select>

                  {/* Island Group toggle buttons */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                    {(['All', 'Luzon', 'Visayas', 'Mindanao'] as const).map(ig => {
                      const active = dirIsland === ig;
                      const activeStyle = ig === 'All'
                        ? 'bg-[#002060] border-[#001848] text-white shadow-blue-300/30'
                        : islandColors[ig];
                      return (
                        <button
                          key={ig}
                          onClick={() => {
                            setDirIsland(ig);
                            if (ig !== 'All' && dirRegion !== 'All') {
                              const selected = REGION_BY_CODE[dirRegion];
                              if (selected && selected.islandGroup !== ig) setDirRegion('All');
                            }
                          }}
                          className={`px-3 py-1.5 rounded-md text-[11px] font-black border transition-all duration-150 cursor-pointer ${
                            active ? activeStyle + ' shadow-sm' : islandInactive
                          }`}
                        >
                          {ig === 'All' ? '🇵🇭 All' : ig}
                        </button>
                      );
                    })}
                  </div>

                  {/* Region dropdown */}
                  <select
                    value={dirRegion}
                    onChange={(e) => {
                      const code = e.target.value;
                      setDirRegion(code);
                      if (code !== 'All') {
                        const region = REGION_BY_CODE[code];
                        if (region) setDirIsland(region.islandGroup);
                      }
                    }}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-[220px]"
                  >
                    <option value="All">All Regions</option>
                    <option value="NEEDS_UPDATE">⚠ Needs Update ({regionCounts.get('NEEDS_UPDATE') ?? 0})</option>
                    {(['Luzon', 'Visayas', 'Mindanao'] as const).map((ig) => (
                      <optgroup key={ig} label={ig}>
                        {regionsByIsland[ig].map((region) => {
                          const count = regionCounts.get(region.code) ?? 0;
                          return (
                            <option key={region.code} value={region.code}>
                              Region {region.code} — {region.name} ({count})
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>

                  {/* Record count */}
                  <span className="text-[10px] text-slate-400 font-mono ml-auto whitespace-nowrap">
                    {filtered.length} of {employees.length} records
                  </span>
                </div>

                {/* Row 2: active filter chips */}
                {(filterByTeam || dirIsland !== 'All' || dirRegion !== 'All' || dirDept !== 'All Departments' || dirSearch) && (
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active filters:</span>
                    {filterByTeam && (
                      <span className="flex items-center gap-1 bg-[#002060]/10 text-[#002060] border border-[#002060]/20 text-[10px] font-black px-2 py-0.5 rounded-full">
                        👤 {viewerRole} Team
                        <button onClick={() => setFilterByTeam(false)} className="ml-0.5 hover:text-rose-600 cursor-pointer">×</button>
                      </span>
                    )}
                    {dirRegion !== 'All' && (
                      <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                        📍 {getRegionLabel(dirRegion)}
                        <button onClick={() => setDirRegion('All')} className="ml-0.5 hover:text-rose-600 cursor-pointer">×</button>
                      </span>
                    )}
                    {dirIsland !== 'All' && (
                      <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        dirIsland === 'Luzon' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        dirIsland === 'Visayas' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        🌏 {dirIsland}
                        <button onClick={() => setDirIsland('All')} className="ml-0.5 hover:text-rose-600 cursor-pointer">×</button>
                      </span>
                    )}
                    {dirDept !== 'All Departments' && (
                      <span className="flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                        🏢 {dirDept}
                        <button onClick={() => setDirDept('All Departments')} className="ml-0.5 hover:text-rose-600 cursor-pointer">×</button>
                      </span>
                    )}
                    {dirSearch && (
                      <span className="flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                        🔍 "{dirSearch}"
                        <button onClick={() => setDirSearch('')} className="ml-0.5 hover:text-rose-600 cursor-pointer">×</button>
                      </span>
                    )}
                    <button
                      onClick={() => { setDirSearch(''); setDirDept('All Departments'); setDirIsland('All'); setDirRegion('All'); setFilterByTeam(false); }}
                      className="text-[10px] font-black text-rose-500 hover:text-rose-700 cursor-pointer ml-1 underline"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-visible">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#002060] text-white text-[10px] uppercase tracking-widest">
                      <th className="text-left px-5 py-3 font-black">Employee Info</th>
                      <th className="text-left px-5 py-3 font-black">Contact</th>
                      <th className="text-left px-5 py-3 font-black">Residential Address</th>
                      <th className="text-left px-5 py-3 font-black">Location Status</th>
                      <th className="text-right px-5 py-3 font-black w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-16 text-slate-400 text-sm">
                          No employees match your search.
                        </td>
                      </tr>
                    ) : filtered.map((emp, idx) => {
                      const empNum = String(idx + 1).padStart(4, '0');
                      return (
                        <tr
                          key={emp.id}
                          className={`border-t border-slate-100 transition-colors ${ idx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]' } hover:bg-blue-50/40`}
                        >
                          {/* Employee Info */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#002060] text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-sm">
                                {emp.avatar}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800 leading-tight">{emp.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  EMP-{empNum} • {emp.department}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Contact */}
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-slate-700">{emp.phone ?? '—'}</span>
                              <span className="text-[10px] text-slate-400">{emp.email ?? '—'}</span>
                            </div>
                          </td>

                          {/* Residential Address */}
                          <td className="px-5 py-3.5">
                            {emp.region === 'NEEDS_UPDATE' || emp.address === 'Needs Update' ? (
                              <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-black px-2.5 py-1 rounded-full">
                                ⚠ Needs Update
                              </span>
                            ) : emp.address ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-slate-700">
                                  {emp.address.split(',')[0]}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {emp.address.split(',').slice(1).join(',').trim()}
                                </span>
                              </div>
                            ) : <span className="text-slate-400">—</span>}
                          </td>

                          {/* Location Status */}
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col gap-1">
                              {emp.region === 'NEEDS_UPDATE' ? (
                                <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-black px-2.5 py-1 rounded-full w-fit">
                                  ⚠ Address Needs Update
                                </span>
                              ) : (() => {
                                const empRegion = emp.region ?? resolveEmployeeRegion({
                                  gpsLat: emp.gpsLat,
                                  gpsLng: emp.gpsLng,
                                  city: emp.address?.split(',').slice(-2, -1)[0]?.trim(),
                                  province: emp.address?.split(',').slice(-1)[0]?.trim(),
                                });
                                return empRegion ? (
                                <span className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-full w-fit">
                                  <MapPin className="w-3 h-3" /> Region {empRegion}
                                </span>
                              ) : emp.islandGroup ? (
                                <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full w-fit">
                                  {emp.islandGroup}
                                </span>
                              ) : null;
                              })()}
                              {emp.gpsLat ? (
                                <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full w-fit">
                                  <Crosshair className="w-3 h-3" /> GPS Verified
                                </span>
                              ) : emp.region !== 'NEEDS_UPDATE' ? (
                                <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold px-2.5 py-1 rounded-full w-fit">
                                  No GPS
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5 text-right relative">
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDirActionsMenuId(prev => prev === emp.id ? null : emp.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              aria-label={`Actions for ${emp.name}`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {dirActionsMenuId === emp.id && (
                              <div
                                className="absolute right-5 top-full mt-1 z-20 min-w-[160px] bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveEmployee(emp.id, emp.name);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  Remove Employee
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ──────────── ACTIVE INCIDENTS PAGE ──────────── */}
      {activePage === 'incidents' && (
        <div className="flex-1 p-6 bg-[#f8fafc]">
          <div className="max-w-[1550px] mx-auto flex flex-col gap-5">

            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                  <Siren className="w-5 h-5" /> Active Incidents
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  All filed incident reports — track status, affected personnel, and response progress.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {simulationActive && (
                  <span className="flex items-center gap-1.5 bg-red-100 border border-red-300 text-red-700 text-xs font-black px-3 py-1.5 rounded-full animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Incident Active
                  </span>
                )}
                <button
                  onClick={() => { setActivePage('dashboard'); setShowCalamityModal(true); }}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition active:scale-95 shadow-sm"
                >
                  <FileWarning className="w-3.5 h-3.5" /> File New Incident
                </button>
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Incidents', value: calamityReports.length, color: 'bg-white border-slate-200', textColor: 'text-slate-800' },
                { label: 'Currently Active', value: simulationActive ? 1 : 0, color: simulationActive ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200', textColor: simulationActive ? 'text-red-700' : 'text-slate-400' },
                { label: 'Employees in Zone', value: simulationActive ? employees.filter(e => getDistance(e) <= epicenter.radiusKm).length : 0, color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700' },
                { label: 'Aid Applications', value: aidApplications.length, color: 'bg-emerald-50 border-emerald-200', textColor: 'text-emerald-700' },
              ].map(({ label, value, color, textColor }) => (
                <div key={label} className={`${color} border rounded-xl p-4 flex flex-col gap-1`}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                  <span className={`text-3xl font-black ${textColor}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* Pending Employee Calamity Reports — Verification Queue */}
            {pendingEmployeeReports.filter(r => r.status === 'Pending').length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 bg-gradient-to-r from-amber-600 to-orange-500 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">⏳</span>
                    <div>
                      <p className="text-white font-black text-sm tracking-wide">Awaiting Manager Verification</p>
                      <p className="text-amber-100 text-xs mt-0.5">Employee self-reported calamity reports pending your review</p>
                    </div>
                  </div>
                  <span className="bg-white/20 border border-white/30 text-white text-xs font-black px-3 py-1 rounded-full">
                    {pendingEmployeeReports.filter(r => r.status === 'Pending').length} Pending
                  </span>
                </div>
                <div className="divide-y divide-amber-100">
                  {pendingEmployeeReports.filter(r => r.status === 'Pending').map(report => {
                    const typeEmoji = { Fire: '🔥', Earthquake: '🚨', Typhoon: '🌀', Other: '⚠️' }[report.type] ?? '⚠️';
                    return (
                      <div key={report.id} className="px-5 py-4 flex items-start gap-4 bg-white/60 hover:bg-white/90 transition">
                        <span className="text-2xl shrink-0 mt-0.5">{typeEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-slate-800 text-sm">{report.incidentName}</p>
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-amber-100 border-amber-300 text-amber-800">
                              {report.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="w-4 h-4 rounded-full bg-[#002060] text-white text-[9px] font-black flex items-center justify-center shrink-0">{report.employeeAvatar}</span>
                            <span className="text-xs text-slate-700 font-semibold">{report.employeeName}</span>
                            <span className="text-slate-400 text-xs">·</span>
                            <span className="text-slate-500 text-xs font-mono">{report.timestamp}</span>
                          </div>
                          <p className="text-slate-500 text-xs mt-1">📍 {report.locationLabel}</p>
                          {report.description && (
                            <p className="text-slate-600 text-xs mt-1.5 leading-relaxed italic">"{report.description}"</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0 ml-2">
                          <button
                            onClick={() => handleApproveEmployeeReport(report.id)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg transition flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleRejectEmployeeReport(report.id)}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-lg transition flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            {/* Status filter */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Status:</span>
              <div className="flex gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                {(['All', 'Active', 'Resolved'] as const).map(s => (
                  <button key={s} onClick={() => setIncidentStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-black border transition-all cursor-pointer ${
                      incidentStatusFilter === s ? 'bg-[#002060] border-[#001848] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}>{s}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[10px] text-slate-400 font-mono">
                {calamityReports.filter(r => incidentStatusFilter === 'All' ? true : incidentStatusFilter === 'Active' ? !resolvedReports[r.id] : resolvedReports[r.id]).length} of {calamityReports.length} incidents
              </span>
            </div>

            {/* Empty state */}
            {calamityReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400">
                <ClipboardList className="w-12 h-12 text-slate-200" />
                <p className="font-bold text-sm">No calamity reports filed yet.</p>
                <p className="text-xs">Use the <strong className="text-[#002060]">Calamity Report</strong> button to file an incident.</p>
                <button
                  onClick={() => { setActivePage('dashboard'); setShowCalamityModal(true); }}
                  className="mt-2 bg-[#002060] hover:bg-[#003399] text-white text-xs font-black px-5 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <FileWarning className="w-3.5 h-3.5" /> File a Report
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {calamityReports.map(r => {
                  const typeEmoji: Record<string, string> = { Fire: '🔥', Earthquake: '🚨', Typhoon: '🌀', Other: '⚠️' };
                  const typeBg: Record<string, string> = {
                    Fire: 'bg-orange-50 border-orange-200 text-orange-800',
                    Earthquake: 'bg-rose-50 border-rose-200 text-rose-800',
                    Typhoon: 'bg-cyan-50 border-cyan-200 text-cyan-800',
                    Other: 'bg-amber-50 border-amber-200 text-amber-800',
                  };

                  const affectedEmps = reportAffectedEmployeesById[r.id] ?? [];
                  const safeCount    = affectedEmps.filter(e => e.status === 'Green').length;
                  const awaitCount   = affectedEmps.filter(e => e.status === 'Yellow').length;
                  const mutedCount   = affectedEmps.filter(e => e.status === 'Red').length;
                  const isExpanded   = expandedReportId === r.id;

                  return (
                    <div key={r.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

                      {/* Card header */}
                      <div className="bg-gradient-to-r from-[#002060] to-[#0055cc] px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{typeEmoji[r.type] ?? '⚠️'}</span>
                          <div>
                            <p className="text-white font-black text-sm leading-tight">{r.incidentName}</p>
                            <p className="text-blue-200 text-[11px] font-mono">{r.timestamp}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase ${ typeBg[r.type] ?? typeBg['Other'] }`}>
                            {r.type}
                          </span>
                          {r.affectedCount > 0 && (
                            <span className="bg-red-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full">
                              {r.affectedCount} in zone
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-100">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Location</span>
                          <span className="text-xs font-semibold text-slate-700">{r.locationLabel || '—'}</span>
                          <span className="text-[10px] font-mono text-slate-400">{r.lat.toFixed(4)}°N, {r.lng.toFixed(4)}°E</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Radius</span>
                          <span className="text-xs font-semibold text-slate-700">{r.radiusKm.toFixed(2)} km</span>
                        </div>
                        {r.magnitude && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Magnitude</span>
                            <span className="text-xs font-semibold text-rose-700">{r.magnitude}</span>
                          </div>
                        )}
                        {r.signalLevel && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Signal Level</span>
                            <span className="text-xs font-semibold text-cyan-700">{r.signalLevel}</span>
                          </div>
                        )}
                        <div className="col-span-2 md:col-span-4 flex flex-col gap-0.5">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Description</span>
                          <span className="text-xs text-slate-600 leading-relaxed">{r.description}</span>
                        </div>
                      </div>

                      {/* Status summary + toggle */}
                      <div className="px-5 py-3 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Personnel Status:</span>
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            ✔ {safeCount} Safe
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            ⧖ {awaitCount} Awaiting
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                            ✕ {mutedCount} No Signal
                          </span>
                        </div>
                        {affectedEmps.length > 0 && (
                          <button
                            onClick={() => setExpandedReportId(isExpanded ? null : r.id)}
                            className="flex items-center gap-1.5 text-[11px] font-black text-[#002060] hover:text-[#003399] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" />
                            {isExpanded ? 'Hide' : 'Show'} Affected Employees ({affectedEmps.length})
                            <span className={`transition-transform duration-200 ${ isExpanded ? 'rotate-180' : '' }`}>&#x25BE;</span>
                          </button>
                        )}
                        {affectedEmps.length === 0 && (
                          <span className="text-[11px] text-slate-400 font-mono italic">No employees were in zone at time of filing.</span>
                        )}
                      </div>

                      {/* Expandable employee list */}
                      {isExpanded && affectedEmps.length > 0 && (
                        <div className="border-t border-slate-200">
                          <div className="px-4 py-2.5 flex items-center justify-between bg-[#f8fafc] border-b border-slate-100">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Affected Personnel ({affectedEmps.length})
                            </span>
                            <button
                              onClick={() => handleExportCalamityReport(r, affectedEmps)}
                              className="px-3 py-1.5 rounded-md text-[10px] font-extrabold transition-all duration-150 flex items-center gap-1.5 border cursor-pointer shrink-0 bg-emerald-600 hover:bg-emerald-500 border-emerald-700 text-white shadow-sm hover:shadow-emerald-400/30 active:scale-95"
                              title="Export affected employees for this calamity report to Excel"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                              <span>Export to Excel</span>
                            </button>
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-[#f0f4ff] text-[#002060] text-[10px] uppercase tracking-widest">
                                <th className="text-left px-4 py-2.5 font-black">#</th>
                                <th className="text-left px-4 py-2.5 font-black">Employee</th>
                                <th className="text-left px-4 py-2.5 font-black">Role / Department</th>
                                <th className="text-left px-4 py-2.5 font-black">Address</th>
                                <th className="text-left px-4 py-2.5 font-black">Check-in Sent</th>
                                <th className="text-left px-4 py-2.5 font-black">Last Response</th>
                                <th className="text-center px-4 py-2.5 font-black">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {affectedEmps.map((emp, idx) => {
                                const statusCfg = {
                                  Green:  { label: 'Safe',         bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
                                  Yellow: { label: 'Awaiting',     bg: 'bg-amber-100 text-amber-800 border-amber-300',       dot: 'bg-amber-400'  },
                                  Red:    { label: 'No Signal',    bg: 'bg-rose-100 text-rose-800 border-rose-300',           dot: 'bg-rose-500'   },
                                }[emp.status];
                                return (
                                  <tr key={emp.id} className={`border-t border-slate-100 ${ idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50' } hover:bg-blue-50/40 transition-colors`}>
                                    <td className="px-4 py-3 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-[#002060] text-white text-[10px] font-black flex items-center justify-center shrink-0">
                                          {emp.avatar || emp.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-slate-800">{emp.name}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                      <div className="flex flex-col">
                                        <span className="font-semibold">{emp.role}</span>
                                        <span className="text-[10px] text-slate-400">{emp.department}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-[11px] max-w-[180px]">
                                      <span className="truncate block">{emp.address || '—'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-[11px]">
                                      {emp.contacted || emp.lastMessageSent
                                        ? <span className="text-emerald-600 font-bold">✔ Sent {emp.lastMessageSent ? `· ${emp.lastMessageSent}` : ''}</span>
                                        : <span className="text-slate-400 italic">Not yet</span>
                                      }
                                    </td>
                                    <td className="px-4 py-3 text-[11px]">
                                      {emp.lastResponseRecv
                                        ? <span className="text-blue-700 font-semibold">{emp.lastResponseRecv}</span>
                                        : emp.unresponsive
                                        ? <span className="text-rose-500 font-bold">Unresponsive</span>
                                        : <span className="text-slate-400 italic">—</span>
                                      }
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black ${ statusCfg.bg }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${ statusCfg.dot }`} />
                                        {statusCfg.label}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ──────────── EMPLOYEE SAFETY STATUS PAGE ──────────── */}
      {activePage === 'safety' && (() => {
        const safetyFiltered = employees.filter(emp => {
          const q = safetySearch.toLowerCase();
          const matchSearch = !q || emp.name.toLowerCase().includes(q) || (emp.department || '').toLowerCase().includes(q);
          const matchIsland = safetyIslandFilter === 'All' || emp.islandGroup === safetyIslandFilter;
          const matchStatus = safetyStatusFilter === 'All' ? true
            : safetyStatusFilter === 'Uncontacted' ? !emp.contacted
            : emp.status === safetyStatusFilter;
          return matchSearch && matchIsland && matchStatus;
        });
        const safeCount   = employees.filter(e => e.status === 'Green').length;
        const awaitCount  = employees.filter(e => e.status === 'Yellow').length;
        const noSigCount  = employees.filter(e => e.status === 'Red').length;
        const respRate    = employees.length > 0 ? Math.round(((safeCount + awaitCount) / employees.length) * 100) : 100;
        return (
          <div className="flex-1 p-6 bg-[#f8fafc]">
            <div className="max-w-[1550px] mx-auto flex flex-col gap-5">

              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" /> Employee Safety Status
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {simulationActive ? 'Real-time safety roll call for the active incident zone.' : 'No active incident — showing all employee safety records.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {simulationActive && (
                    <span className="flex items-center gap-1.5 bg-orange-100 border border-orange-300 text-orange-700 text-xs font-black px-3 py-1.5 rounded-full animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-orange-500" /> Incident Active
                    </span>
                  )}
                  <button onClick={handleSendCheckInAllAffected} disabled={!simulationActive}
                    className="bg-[#002060] hover:bg-[#003399] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-black px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition active:scale-95 shadow-sm">
                    <Send className="w-3.5 h-3.5" /> Contact All Affected
                  </button>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Total Personnel', value: employees.length, color: 'bg-white border-slate-200', textColor: 'text-slate-800', Icon: Users },
                  { label: 'Safe / Confirmed', value: safeCount, color: 'bg-emerald-50 border-emerald-200', textColor: 'text-emerald-700', Icon: CheckCircle },
                  { label: 'Awaiting Reply', value: awaitCount, color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700', Icon: Clock },
                  { label: 'No Signal / SOS', value: noSigCount, color: 'bg-rose-50 border-rose-200', textColor: 'text-rose-700', Icon: ShieldAlert },
                  { label: 'Response Rate', value: `${respRate}%`, color: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700', Icon: TrendingUp },
                ].map(({ label, value, color, textColor, Icon }) => (
                  <div key={label} className={`${color} border rounded-xl p-4 flex flex-col gap-1`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                      <Icon className={`w-4 h-4 ${textColor}`} />
                    </div>
                    <span className={`text-2xl font-black ${textColor}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="text" placeholder="Search by name or department..."
                    value={safetySearch} onChange={e => setSafetySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 transition" />
                </div>
                <div className="flex gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                  {(['All', 'Luzon', 'Visayas', 'Mindanao'] as const).map(ig => (
                    <button key={ig} onClick={() => setSafetyIslandFilter(ig)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-black border transition-all cursor-pointer ${
                        safetyIslandFilter === ig ? 'bg-[#002060] border-[#001848] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}>{ig === 'All' ? '🇵🇭 All' : ig}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 flex-wrap">
                  {[{k:'All',l:'All'},{k:'Green',l:'✔ Safe'},{k:'Yellow',l:'⧖ Awaiting'},{k:'Red',l:'✕ No Signal'},{k:'Uncontacted',l:'— Not Contacted'}].map(({k,l}) => (
                    <button key={k} onClick={() => setSafetyStatusFilter(k as typeof safetyStatusFilter)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-black border transition-all cursor-pointer ${
                        safetyStatusFilter === k ? 'bg-[#002060] border-[#001848] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}>{l}</button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 font-mono ml-auto">{safetyFiltered.length} of {employees.length}</span>
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#002060] text-white text-[10px] uppercase tracking-widest">
                      <th className="text-left px-4 py-3 font-black">#</th>
                      <th className="text-left px-4 py-3 font-black">Employee</th>
                      <th className="text-left px-4 py-3 font-black">Island / Dept</th>
                      <th className="text-left px-4 py-3 font-black">Home Address</th>
                      <th className="text-left px-4 py-3 font-black">Check-in Sent</th>
                      <th className="text-left px-4 py-3 font-black">Last Message</th>
                      <th className="text-center px-4 py-3 font-black">Safety Status</th>
                      <th className="text-center px-4 py-3 font-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safetyFiltered.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-16 text-slate-400 text-sm">No employees match your filters.</td></tr>
                    ) : safetyFiltered.map((emp, idx) => {
                      const sc = {
                        Green:  { label: 'Safe',      bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
                        Yellow: { label: 'Awaiting',  bg: 'bg-amber-100 text-amber-800 border-amber-300',       dot: 'bg-amber-400'  },
                        Red:    { label: 'No Signal', bg: 'bg-rose-100 text-rose-800 border-rose-300',           dot: 'bg-rose-500'   },
                      }[emp.status];
                      return (
                        <tr key={emp.id} className={`border-t border-slate-100 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'} hover:bg-blue-50/40`}>
                          <td className="px-4 py-3 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#002060] text-white text-[11px] font-black flex items-center justify-center shrink-0">{emp.avatar}</div>
                              <div>
                                <p className="font-bold text-slate-800 leading-tight">{emp.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{emp.role}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block w-fit ${
                                emp.islandGroup === 'Luzon' ? 'bg-emerald-100 text-emerald-700' :
                                emp.islandGroup === 'Visayas' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                              }`}>{emp.islandGroup}</span>
                              <span className="text-[10px] text-slate-500">{emp.department}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[11px] max-w-[200px]">
                            <span className="block truncate">{emp.address || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            {emp.contacted
                              ? <span className="text-emerald-600 font-bold text-[10px]">✔ Sent {emp.lastMessageSent ? `· ${emp.lastMessageSent}` : ''}</span>
                              : <span className="text-slate-400 italic text-[10px]">Not yet contacted</span>}
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            {emp.safetyMessage
                              ? <span className="text-[10px] text-slate-600 italic block truncate">"{emp.safetyMessage}"</span>
                              : emp.unresponsive
                              ? <span className="text-rose-500 font-bold text-[10px]">Unresponsive</span>
                              : <span className="text-slate-300 text-[10px]">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black ${sc.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              {!emp.contacted && (
                                <button onClick={() => handleSendCheckIn(emp.id)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-md transition cursor-pointer" title="Send SMS">SMS</button>
                              )}
                              {emp.contacted && emp.status === 'Yellow' && (<>
                                <button onClick={() => handleSimulateReply(emp.id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black rounded-md transition cursor-pointer">Safe</button>
                                <button onClick={() => handleSimulateReply(emp.id, 'Red')}
                                  className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black rounded-md transition cursor-pointer">SOS</button>
                              </>)}
                              {emp.status === 'Red' && !emp.rescueDispatched && (
                                <button onClick={() => handleDispatchRescue(emp.id)}
                                  className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black rounded-md transition cursor-pointer">Aid</button>
                              )}
                              {emp.rescueDispatched && (
                                <span className="text-[10px] text-emerald-600 font-black whitespace-nowrap">✔ Aid Sent</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ──────────── AID APPLICATIONS PAGE ──────────── */}
      {activePage === 'aid' && (() => {
        const statusCfgMap: Record<string, { bg: string; dot: string }> = {
          'Submitted':    { bg: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-400' },
          'Under Review': { bg: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
          'Approved':     { bg: 'bg-blue-100 text-blue-800 border-blue-300', dot: 'bg-blue-500' },
          'Disbursed':    { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
          'Rejected':     { bg: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' },
        };
        const filteredAid = aidApplications.filter(a => aidStatusFilter === 'All' || a.status === aidStatusFilter);
        const totalPhp    = aidApplications.filter(a => a.status === 'Disbursed' || a.status === 'Approved').reduce((s, a) => s + (a.amountPhp || 0), 0);
        const pendingCnt  = aidApplications.filter(a => a.status === 'Submitted' || a.status === 'Under Review').length;
        const approvedCnt = aidApplications.filter(a => a.status === 'Approved' || a.status === 'Disbursed').length;
        return (
          <div className="flex-1 p-6 bg-[#f8fafc]">
            <div className="max-w-[1550px] mx-auto flex flex-col gap-5">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                    <HeartHandshake className="w-5 h-5" /> Aid Applications
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Track, review, and approve Crisis Aid applications from assessment through disbursement.</p>
                </div>
                <button onClick={() => setShowAidModal(true)}
                  className="bg-[#002060] hover:bg-[#003399] text-white text-xs font-black px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition active:scale-95 shadow-sm">
                  <Plus className="w-4 h-4" /> New Application
                </button>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Applications', value: aidApplications.length, color: 'bg-white border-slate-200', textColor: 'text-slate-800' },
                  { label: 'Pending Review', value: pendingCnt, color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700' },
                  { label: 'Approved / Disbursed', value: approvedCnt, color: 'bg-emerald-50 border-emerald-200', textColor: 'text-emerald-700' },
                  { label: 'Total Aid Value (PHP)', value: `₱${totalPhp.toLocaleString()}`, color: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700' },
                ].map(({ label, value, color, textColor }) => (
                  <div key={label} className={`${color} border rounded-xl p-4 flex flex-col gap-1`}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                    <span className={`text-2xl font-black ${textColor}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Workflow stepper */}
              <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Workflow:</span>
                {['Submitted', 'Under Review', 'Approved', 'Disbursed'].map((step, i) => (
                  <React.Fragment key={step}>
                    {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${statusCfgMap[step]?.bg || ''}`}>{step}</span>
                  </React.Fragment>
                ))}
                <span className="mx-2 text-slate-200">|</span>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${statusCfgMap['Rejected'].bg}`}>Rejected</span>
              </div>

              {/* Status filter */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Filter:</span>
                <div className="flex gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 flex-wrap">
                  {(['All', 'Submitted', 'Under Review', 'Approved', 'Disbursed', 'Rejected'] as const).map(s => (
                    <button key={s} onClick={() => setAidStatusFilter(s)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-black border transition-all cursor-pointer ${
                        aidStatusFilter === s ? 'bg-[#002060] border-[#001848] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}>{s}</button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 font-mono ml-auto">{filteredAid.length} of {aidApplications.length} records</span>
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#002060] text-white text-[10px] uppercase tracking-widest">
                      <th className="text-left px-4 py-3 font-black">Case ID</th>
                      <th className="text-left px-4 py-3 font-black">Employee</th>
                      <th className="text-left px-4 py-3 font-black">Incident</th>
                      <th className="text-left px-4 py-3 font-black">Aid Type</th>
                      <th className="text-left px-4 py-3 font-black">Amount</th>
                      <th className="text-left px-4 py-3 font-black">Priority</th>
                      <th className="text-left px-4 py-3 font-black">Filed Date</th>
                      <th className="text-center px-4 py-3 font-black">Status</th>
                      <th className="text-left px-4 py-3 font-black">Approver</th>
                      {isManagerUser && <th className="text-left px-4 py-3 font-black">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAid.length === 0
                      ? <tr><td colSpan={9} className="text-center py-16 text-slate-400 text-sm">No applications match your filter.</td></tr>
                      : filteredAid.map((app, idx) => {
                          const sc = statusCfgMap[app.status] || statusCfgMap['Submitted'];
                          return (
                            <tr key={app.id} className={`border-t border-slate-100 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'} hover:bg-blue-50/40`}>
                              <td className="px-4 py-3 font-mono font-black text-[#002060] text-[11px]">{app.id}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-slate-800">{app.employeeName}</span>
                                  <span className="text-[10px] text-slate-400">{app.department} · {app.islandGroup}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 max-w-[180px]">
                                <span className="text-slate-700 font-medium block truncate text-[11px]">{app.incidentName}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                  app.aidType === 'Cash' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                  app.aidType === 'Relief Goods' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                  'bg-purple-50 border-purple-200 text-purple-700'
                                }`}>{app.aidType}</span>
                              </td>
                              <td className="px-4 py-3 font-black text-slate-800">{app.amountPhp ? `₱${app.amountPhp.toLocaleString()}` : '—'}</td>
                              <td className="px-4 py-3">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                  app.priority === 'Urgent' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}>{app.priority}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{app.filedDate}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black ${sc.bg}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`} />{app.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-[11px]">{app.approver || '—'}</td>
                              {isManagerUser && (
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-2 justify-end">
                                    {app.status === 'Submitted' && (
                                      <button
                                        onClick={() => handleApproveAidApplication(app.id)}
                                        className="rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-blue-500 transition"
                                      >Approve</button>
                                    )}
                                    {(app.status === 'Approved' || app.status === 'Under Review') && (
                                      <button
                                        onClick={() => handleDisburseAidApplication(app.id)}
                                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-emerald-500 transition"
                                      >Disburse</button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ──────────── RISK CLASSIFICATION MAP PAGE ──────────── */}
      {activePage === 'risk-map' && (
        <RiskMap employees={employees} />
      )}

      {/* ──────────── EXECUTIVE DASHBOARD PAGE ──────────── */}
      {activePage === 'executive' && (() => {
        const totalImpacted  = simulationActive ? employees.filter(e => getDistance(e) <= epicenter.radiusKm).length : 0;
        const exSafeCount    = employees.filter(e => e.status === 'Green').length;
        const exAwaitCount   = employees.filter(e => e.status === 'Yellow').length;
        const exNoSigCount   = employees.filter(e => e.status === 'Red').length;
        const exRespRate     = employees.length > 0 ? Math.round(((exSafeCount + exAwaitCount) / employees.length) * 100) : 100;
        const exDisbursed    = aidApplications.filter(a => a.status === 'Disbursed').reduce((s, a) => s + (a.amountPhp || 0), 0);
        const exApproved     = aidApplications.filter(a => a.status === 'Approved').reduce((s, a) => s + (a.amountPhp || 0), 0);
        const islandBreakdown = (['Luzon', 'Visayas', 'Mindanao'] as const).map(ig => {
          const emps  = employees.filter(e => e.islandGroup === ig);
          const safe  = emps.filter(e => e.status === 'Green');
          const impacted = simulationActive ? emps.filter(e => getDistance(e) <= epicenter.radiusKm).length : 0;
          const colorKey = ig === 'Luzon' ? 'emerald' : ig === 'Visayas' ? 'blue' : 'amber';
          return { name: ig, total: emps.length, impacted, safe: safe.length, safeRate: emps.length > 0 ? Math.round((safe.length / emps.length) * 100) : 100, colorKey };
        });
        const incidentAidMap: Record<string, { submitted: number; approved: number; total: number }> = {};
        aidApplications.forEach(a => {
          if (!incidentAidMap[a.incidentName]) incidentAidMap[a.incidentName] = { submitted: 0, approved: 0, total: 0 };
          incidentAidMap[a.incidentName].submitted++;
          if (a.status === 'Approved' || a.status === 'Disbursed') { incidentAidMap[a.incidentName].approved++; incidentAidMap[a.incidentName].total += (a.amountPhp || 0); }
        });
        // SVG donut helpers
        const donutTotal = exSafeCount + exAwaitCount + exNoSigCount || 1;
        const polarXY = (cx: number, cy: number, r: number, deg: number) => ({ x: cx + r * Math.cos((deg - 90) * Math.PI / 180), y: cy + r * Math.sin((deg - 90) * Math.PI / 180) });
        const arc = (cx: number, cy: number, r: number, s: number, e: number) => { const sp = polarXY(cx,cy,r,s); const ep = polarXY(cx,cy,r,e); return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${e-s>180?1:0} 1 ${ep.x} ${ep.y}`; };
        const seg1e = (exSafeCount / donutTotal) * 360;
        const seg2e = seg1e + (exAwaitCount / donutTotal) * 360;
        return (
          <div className="flex-1 p-6 bg-[#f8fafc]">
            <div className="max-w-[1550px] mx-auto flex flex-col gap-6">

              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" /> Executive Dashboard
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Real-time management overview — crisis response KPIs and aid distribution summary.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">Updated: {new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                  {simulationActive && (
                    <span className="flex items-center gap-1.5 bg-red-100 border border-red-300 text-red-700 text-xs font-black px-3 py-1.5 rounded-full animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> Active Incident
                    </span>
                  )}
                </div>
              </div>

              {/* Top KPI gradient cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Active Incidents', value: calamityReports.length, sub: simulationActive ? '1 currently active' : 'No active alert', grad: 'from-[#002060] to-[#0055cc]', Icon: Siren },
                  { label: 'Employees Impacted', value: totalImpacted, sub: `of ${employees.length} total personnel`, grad: 'from-rose-600 to-rose-500', Icon: Users },
                  { label: 'Response Rate', value: `${exRespRate}%`, sub: `${exSafeCount} confirmed safe`, grad: 'from-emerald-700 to-emerald-500', Icon: ShieldCheck },
                  { label: 'Aid Disbursed (PHP)', value: `₱${exDisbursed.toLocaleString()}`, sub: `₱${exApproved.toLocaleString()} pending`, grad: 'from-amber-600 to-amber-500', Icon: DollarSign },
                ].map(({ label, value, sub, grad, Icon }) => (
                  <div key={label} className={`bg-gradient-to-br ${grad} rounded-2xl p-5 text-white shadow-lg`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/70">{label}</span>
                      <div className="bg-white/15 p-1.5 rounded-lg"><Icon className="w-4 h-4 text-white" /></div>
                    </div>
                    <p className="text-3xl font-black leading-none mb-1">{value}</p>
                    <p className="text-[11px] text-white/60 font-medium">{sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Safety donut */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#002060]" /> Safety Distribution
                  </h3>
                  <div className="flex items-center gap-6">
                    <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
                      {donutTotal <= 1 ? (
                        <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="18" />
                      ) : (<>
                        {exSafeCount > 0 && <path d={arc(60,60,45,0,seg1e)} fill="none" stroke="#10b981" strokeWidth="18" />}
                        {exAwaitCount > 0 && <path d={arc(60,60,45,seg1e,seg2e)} fill="none" stroke="#f59e0b" strokeWidth="18" />}
                        {exNoSigCount > 0 && <path d={arc(60,60,45,seg2e,360)} fill="none" stroke="#f43f5e" strokeWidth="18" />}
                      </>)}
                      <circle cx="60" cy="60" r="32" fill="white" />
                      <text x="60" y="57" textAnchor="middle" fontSize="14" fontWeight="900" fill="#002060">{exRespRate}%</text>
                      <text x="60" y="70" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="700">Response</text>
                    </svg>
                    <div className="flex flex-col gap-2.5 flex-1">
                      {[{label:'Safe',count:exSafeCount,color:'bg-emerald-500'},{label:'Awaiting',count:exAwaitCount,color:'bg-amber-400'},{label:'No Signal',count:exNoSigCount,color:'bg-rose-500'},{label:'Not Contacted',count:employees.filter(e=>!e.contacted).length,color:'bg-slate-300'}].map(({label,count,color})=>(
                        <div key={label} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`}/><span className="text-xs text-slate-600 font-medium">{label}</span></div>
                          <span className="text-xs font-black text-slate-800 font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Island Breakdown */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#002060]" /> Island Group Breakdown
                  </h3>
                  <div className="flex flex-col gap-3">
                    {islandBreakdown.map(({ name, total, impacted, safe, safeRate, colorKey }) => (
                      <div key={name} className={`bg-${colorKey}-50 border border-${colorKey}-200 rounded-xl p-3.5`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-black text-${colorKey}-800 text-sm`}>{name}</span>
                          <span className={`font-mono text-[11px] text-${colorKey}-700 bg-${colorKey}-100 px-2 py-0.5 rounded font-black`}>{total} FTE</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div><p className="text-[10px] text-slate-500 uppercase font-black">Impacted</p><p className={`font-black text-${colorKey}-700 text-base`}>{impacted}</p></div>
                          <div><p className="text-[10px] text-slate-500 uppercase font-black">Safe</p><p className="font-black text-emerald-600 text-base">{safe}</p></div>
                          <div><p className="text-[10px] text-slate-500 uppercase font-black">Safe %</p><p className="font-black text-slate-700 text-base">{safeRate}%</p></div>
                        </div>
                        <div className="mt-2 bg-white/60 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${safeRate}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Feed */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col gap-3 text-white">
                  <h3 className="text-sm font-black text-orange-400 uppercase tracking-wide flex items-center gap-2">
                    <Activity className="w-4 h-4 animate-pulse" /> Live Activity Feed
                  </h3>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[280px]">
                    {logs.slice(0, 15).map(log => {
                      const color = log.type==='warn' ? 'text-amber-400' : log.type==='success' ? 'text-emerald-400' : log.type==='err' ? 'text-rose-400' : 'text-slate-400';
                      return (
                        <div key={log.id} className="text-[10px] border-b border-slate-900 pb-1.5 flex gap-2">
                          <span className="text-slate-600 font-mono shrink-0">[{log.time}]</span>
                          <span className={color}>{log.msg}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Aid Summary by Incident */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-[#002060] to-[#0055cc] px-5 py-3.5 flex items-center justify-between">
                  <span className="text-white font-black text-sm flex items-center gap-2"><DollarSign className="w-4 h-4" /> Aid Summary by Incident</span>
                  <span className="text-blue-200 text-xs font-mono">{aidApplications.length} total applications</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#f0f4ff] text-[#002060] text-[10px] uppercase tracking-widest">
                      <th className="text-left px-5 py-2.5 font-black">Incident</th>
                      <th className="text-center px-5 py-2.5 font-black">Applications</th>
                      <th className="text-center px-5 py-2.5 font-black">Approved</th>
                      <th className="text-right px-5 py-2.5 font-black">Total Aid (PHP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(incidentAidMap).map(([name, data], idx) => (
                      <tr key={name} className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-5 py-3 font-semibold text-slate-700">{name}</td>
                        <td className="px-5 py-3 text-center font-bold text-slate-700">{data.submitted}</td>
                        <td className="px-5 py-3 text-center"><span className="text-emerald-700 font-black">{data.approved}</span></td>
                        <td className="px-5 py-3 text-right font-black text-[#002060]">₱{data.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {Object.keys(incidentAidMap).length === 0 && (
                      <tr><td colSpan={4} className="text-center py-10 text-slate-400">No aid applications filed yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* KPI targets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: '24hr Assessment Target', value: simulationActive ? `${employees.filter(e=>e.contacted).length} / ${Math.max(employees.filter(e=>getDistance(e)<=epicenter.radiusKm).length,1)} contacted` : 'No active incident', sub: simulationActive ? 'within first 24 hours' : '—', Icon: Clock, color: 'bg-blue-50 border-blue-200 text-blue-700' },
                  { label: 'Aid Cases Tracked', value: `${aidApplications.length} / ${aidApplications.length}`, sub: '100% visibility maintained', Icon: BadgeCheck, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                  { label: 'Manual Effort Saved', value: '~62%', sub: 'vs. manual spreadsheet consolidation', Icon: Zap, color: 'bg-amber-50 border-amber-200 text-amber-700' },
                ].map(({ label, value, sub, Icon, color }) => (
                  <div key={label} className={`${color} border rounded-xl p-5 flex items-start gap-4`}>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-white/60 shrink-0"><Icon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{label}</p>
                      <p className="text-base font-black leading-tight">{value}</p>
                      <p className="text-[11px] opacity-60 mt-0.5">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        );
      })()}

        </div>{/* end page content */}
      </div>{/* end body row */}

      {/* ── Add Employee Modal ───────────────────────────────────────────── */}
      {showAddEmployeeModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,10,40,0.70)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowAddEmployeeModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-blue-100 w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#002060] via-[#003399] to-[#0055cc] px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 p-2 rounded-lg border border-white/20">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-black text-base tracking-tight">Add Employee</h2>
                  <p className="text-blue-200 text-xs font-medium">Register a new personnel record</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddEmployeeModal(false)}
                className="text-white/60 hover:text-white hover:bg-white/15 p-2 rounded-lg transition-all cursor-pointer border border-transparent hover:border-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployeeFromDirectory} className="p-6 flex flex-col gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maria Clara Lopez"
                  value={newEmpForm.name}
                  onChange={e => setNewEmpForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Role</label>
                  <input
                    type="text"
                    placeholder="Data Analyst"
                    value={newEmpForm.role}
                    onChange={e => setNewEmpForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Department</label>
                  <select
                    value={newEmpForm.department}
                    onChange={e => setNewEmpForm(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {['AI Operations', 'GIS & Remote Sensing', 'Valuation Services', 'Real Estate Analytics', 'Data Engineering', 'QC & Audit', 'Solutions Group', 'Infrastructure Management', 'People Operations', 'Finance', 'Security', 'Field Services'].map(d => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Phone</label>
                  <input
                    type="text"
                    placeholder="0917 123 4567"
                    value={newEmpForm.phone}
                    onChange={e => setNewEmpForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Email</label>
                  <input
                    type="email"
                    placeholder="name@innodata.com"
                    value={newEmpForm.email}
                    onChange={e => setNewEmpForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Residential Address</label>
                <input
                  type="text"
                  placeholder="e.g. Makati CBD, Makati City, Metro Manila"
                  value={newEmpForm.address}
                  onChange={e => setNewEmpForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Island Group</label>
                <div className="flex gap-2">
                  {(['Luzon', 'Visayas', 'Mindanao'] as const).map(ig => {
                    const defaults = { Luzon: { lat: 14.5995, lng: 120.9842 }, Visayas: { lat: 10.3157, lng: 123.8854 }, Mindanao: { lat: 7.0708, lng: 125.6087 } };
                    return (
                      <button
                        key={ig}
                        type="button"
                        onClick={() => setNewEmpForm(prev => ({ ...prev, islandGroup: ig, gpsLat: defaults[ig].lat, gpsLng: defaults[ig].lng }))}
                        className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          newEmpForm.islandGroup === ig
                            ? 'border-[#002060] bg-blue-50 text-[#002060] ring-1 ring-blue-300'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {ig}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">GPS Latitude</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={newEmpForm.gpsLat}
                    onChange={e => setNewEmpForm(prev => ({ ...prev, gpsLat: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">GPS Longitude</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={newEmpForm.gpsLng}
                    onChange={e => setNewEmpForm(prev => ({ ...prev, gpsLng: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEmployeeModal(false)}
                  className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#002060] hover:bg-[#003399] text-white font-bold py-2.5 rounded-lg text-xs transition cursor-pointer active:scale-95"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Calamity Report Modal ────────────────────────────────────────── */}
      {showCalamityModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,10,40,0.70)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-blue-100 w-full max-w-4xl max-h-[92vh] overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#002060] via-[#003399] to-[#0055cc] px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 p-2 rounded-lg border border-white/20">
                  <FileWarning className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-black text-base tracking-tight">Calamity Report</h2>
                  <p className="text-blue-200 text-xs font-medium">HR / Manager Manual Incident Filing</p>
                </div>
              </div>
              <button
                onClick={() => setShowCalamityModal(false)}
                className="text-white/60 hover:text-white hover:bg-white/15 p-2 rounded-lg transition-all cursor-pointer border border-transparent hover:border-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-col lg:flex-row gap-0 flex-1 min-h-0">

              {/* Left: Form Fields */}
              <div className="lg:w-[320px] shrink-0 flex flex-col gap-5 p-6 border-r border-blue-50 bg-[#f5f8ff]">

                {/* Calamity Type */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    Calamity Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Fire', 'Earthquake', 'Typhoon', 'Other'] as const).map(t => {
                      const icons: Record<string, string> = { Fire: '🔥', Earthquake: '🚨', Typhoon: '🌀', Other: '⚠️' };
                      const active = calamityForm.type === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setCalamityForm(prev => ({ ...prev, type: t }))}
                          className={`flex items-center gap-2 py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all cursor-pointer ${
                            active
                              ? 'border-[#003399] bg-blue-50 text-[#002060] ring-2 ring-offset-1 ring-blue-400 shadow-sm'
                              : 'border-blue-100 bg-white text-slate-500 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          <span className="text-base leading-none shrink-0">{icons[t]}</span>
                          <span>{t}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Type-specific extra fields ── */}

                {/* Other: Hazard Name */}
                {calamityForm.type === 'Other' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      Hazard Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Chemical Spill, Landslide, Explosion..."
                      value={calamityForm.hazardName}
                      onChange={e => setCalamityForm(prev => ({ ...prev, hazardName: e.target.value }))}
                      className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 transition"
                    />
                  </div>
                )}

                {/* Earthquake: Magnitude / Intensity */}
                {calamityForm.type === 'Earthquake' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      Magnitude / Intensity
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Magnitude 6.2, Intensity V (Strong)..."
                      value={calamityForm.magnitude}
                      onChange={e => setCalamityForm(prev => ({ ...prev, magnitude: e.target.value }))}
                      className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 transition"
                    />
                    <p className="text-[10px] text-slate-400 font-mono leading-snug">
                      PHIVOLCS Intensity Scale I (Scarcely Perceptible) – X (Completely Devastating)
                    </p>
                  </div>
                )}

                {/* Typhoon: Signal Level */}
                {calamityForm.type === 'Typhoon' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      PAGASA Signal Level
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['Signal No. 1', 'Signal No. 2', 'Signal No. 3', 'Signal No. 4', 'Signal No. 5'].map(sig => {
                        const sigColors: Record<string, string> = {
                          'Signal No. 1': 'border-yellow-400 bg-yellow-50 text-yellow-800',
                          'Signal No. 2': 'border-orange-400 bg-orange-50 text-orange-800',
                          'Signal No. 3': 'border-red-400 bg-red-50 text-red-800',
                          'Signal No. 4': 'border-rose-600 bg-rose-50 text-rose-900',
                          'Signal No. 5': 'border-purple-600 bg-purple-50 text-purple-900',
                        };
                        const active = calamityForm.signalLevel === sig;
                        return (
                          <button
                            key={sig}
                            onClick={() => setCalamityForm(prev => ({ ...prev, signalLevel: sig }))}
                            className={`py-1.5 px-2 rounded-lg border-2 text-[10px] font-bold transition-all cursor-pointer text-center ${
                              active
                                ? sigColors[sig] + ' ring-2 ring-offset-1 ring-blue-400 shadow-sm'
                                : 'border-blue-100 bg-white text-slate-500 hover:border-blue-200'
                            }`}
                          >
                            {sig}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono leading-snug">
                      No. 1 = 30–60 km/h · No. 3 = 89–117 km/h · No. 5 = &gt;220 km/h
                    </p>
                  </div>
                )}

                {/* Location Label + Geocode */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    Location / Area Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cebu IT Park, Barangay Guadalupe..."
                    value={calamityForm.locationLabel}
                    onChange={e => {
                      setCalamityForm(prev => ({ ...prev, locationLabel: e.target.value }));
                      setGeocodeError(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGeocode(); } }}
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 transition"
                  />
                  {/* Auto-Pin button */}
                  <button
                    id="geocode-auto-pin-btn"
                    onClick={handleGeocode}
                    disabled={isGeocoding || !calamityForm.locationLabel.trim()}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${
                      isGeocoding
                        ? 'bg-blue-50 border-blue-200 text-blue-400 cursor-wait'
                        : !calamityForm.locationLabel.trim()
                        ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                        : 'bg-[#002060] hover:bg-[#003399] border-[#001848] text-white cursor-pointer shadow hover:shadow-md active:scale-95'
                    }`}
                  >
                    {isGeocoding ? (
                      <>
                        <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>Auto-Pin Location</span>
                      </>
                    )}
                  </button>
                  {/* Geocode error */}
                  {geocodeError && (
                    <div className="flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-red-500 text-[10px] mt-px">⚠</span>
                      <span className="text-red-600 text-[10px] font-semibold leading-tight">{geocodeError}</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    Incident Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe the calamity details, source, hazard scope..."
                    value={calamityForm.description}
                    onChange={e => setCalamityForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 transition resize-none"
                  />
                </div>

                {/* Radius Slider */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-black text-[#002060] uppercase tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      Geofence Radius
                    </span>
                    <span className="text-[#003399] font-black text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                      {calamityForm.radiusKm.toFixed(2)} km
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={calamityForm.radiusKm}
                    onChange={e => setCalamityForm(prev => ({ ...prev, radiusKm: Number(e.target.value) }))}
                    className="w-full accent-blue-600 cursor-pointer h-2"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0.1 km</span>
                    <span>0.5 km</span>
                    <span>1 km</span>
                  </div>
                </div>

                {/* Coordinates display */}
                {calamityForm.locationPinned && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-[10px] font-black text-[#002060] uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-blue-600" /> Pinned Location
                    </span>
                    <span className="font-mono text-[11px] text-[#003399] font-bold">
                      {calamityForm.lat.toFixed(5)}°N, {calamityForm.lng.toFixed(5)}°E
                    </span>
                  </div>
                )}

                {/* Affected count badge */}
                <div className={`rounded-xl border p-4 flex flex-col items-center gap-1 transition-all ${
                  calamityForm.locationPinned
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-slate-100 border-slate-200'
                }`}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel in Zone</span>
                  <span className={`text-4xl font-black tabular-nums ${
                    calamityAffectedCount > 0 ? 'text-[#002060]' : 'text-slate-300'
                  }`}>{calamityAffectedCount}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {calamityForm.locationPinned ? `within ${calamityForm.radiusKm.toFixed(2)} km` : 'Pin a location to preview'}
                  </span>
                </div>

                {/* Submit */}
                <button
                  id="submit-calamity-report-btn"
                  onClick={handleSubmitCalamityReport}
                  disabled={!calamityForm.locationPinned}
                  className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                    calamityForm.locationPinned
                      ? 'bg-gradient-to-r from-[#002060] to-[#0055cc] hover:from-[#001848] hover:to-[#003faa] text-white shadow-lg hover:shadow-xl cursor-pointer active:scale-95'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  }`}
                >
                  <FileWarning className="w-4 h-4 shrink-0" />
                  {calamityForm.locationPinned ? 'File Calamity Report & Activate' : 'Pin a Location First'}
                </button>
              </div>

              {/* Right: Leaflet Map for pinpointing */}
              <div className="flex-1 flex flex-col min-h-[420px]">
                <div className="bg-[#002060] px-4 py-2.5 flex items-center justify-between border-b border-[#001848]">
                  <span className="text-white text-xs font-bold flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5 text-blue-300" />
                    Click anywhere on the map to pinpoint the calamity location
                  </span>
                  {calamityForm.locationPinned && (
                    <span className="text-emerald-400 text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Location Pinned
                    </span>
                  )}
                </div>
                <div ref={calamityMapRef} className="flex-1 min-h-[400px] w-full z-0" />
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Aid Application Modal ──────────────────────────────────────────── */}
      {showAidModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,10,40,0.70)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowAidModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-blue-100 w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#002060] via-[#003399] to-[#0055cc] px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 p-2 rounded-lg border border-white/20">
                  <HeartHandshake className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-black text-base tracking-tight">New Aid Application</h2>
                  <p className="text-blue-200 text-xs font-medium">File a crisis aid request for an employee</p>
                </div>
              </div>
              <button onClick={() => setShowAidModal(false)}
                className="text-white/60 hover:text-white hover:bg-white/15 p-2 rounded-lg transition-all cursor-pointer border border-transparent hover:border-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (!aidForm.employeeName.trim()) return;
                const newApp: AidApplication = {
                  id: `AID-${String(aidApplications.length + 1).padStart(3, '0')}`,
                  employeeId: '',
                  employeeName: aidForm.employeeName.trim(),
                  incidentId: '',
                  incidentName: aidForm.incidentName || 'General Crisis Aid',
                  aidType: aidForm.aidType,
                  amountPhp: aidForm.amountPhp ? parseFloat(aidForm.amountPhp) : undefined,
                  description: aidForm.description.trim(),
                  status: 'Submitted',
                  priority: aidForm.priority,
                  filedDate: new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
                  department: aidForm.department,
                  islandGroup: aidForm.islandGroup,
                };
                setAidApplications(prev => [newApp, ...prev]);
                setShowAidModal(false);
                setAidForm({ employeeName: '', incidentName: '', aidType: 'Cash', amountPhp: '', description: '', priority: 'Normal', department: 'AI Operations', islandGroup: 'Luzon' });
                pushLog(`📋 Aid Application filed: ${newApp.id} for ${newApp.employeeName} — ${newApp.aidType} · ${newApp.incidentName}`, 'success');
              }}
              className="p-6 flex flex-col gap-4"
            >
              {/* Employee Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Employee Full Name *</label>
                <input type="text" required placeholder="e.g. Maria Clara Santos"
                  value={aidForm.employeeName} onChange={e => setAidForm(p => ({ ...p, employeeName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

{/* Incident */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Related Incident</label>
                  <select
                    value={aidForm.incidentName}
                    onChange={e => setAidForm(p => ({ ...p, incidentName: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Fire, Earthquake, Typhoon, or Other</option>
                    <option value="Fire">🔥 Fire</option>
                    <option value="Earthquake">🚨 Earthquake</option>
                    <option value="Typhoon">🌀 Typhoon</option>
                    <option value="Other">⚠️ Other</option>
                  </select>
                </div>

              {/* Aid Type */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Aid Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'Relief Goods', 'Both'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setAidForm(p => ({ ...p, aidType: t }))}
                      className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all cursor-pointer ${
                        aidForm.aidType === t ? 'border-[#003399] bg-blue-50 text-[#002060] ring-1 ring-blue-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Amount + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Amount (PHP)</label>
                  <input type="number" min="0" placeholder="e.g. 10000"
                    value={aidForm.amountPhp} onChange={e => setAidForm(p => ({ ...p, amountPhp: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Priority</label>
                  <div className="flex gap-2">
                    {(['Normal', 'Urgent'] as const).map(p => (
                      <button key={p} type="button" onClick={() => setAidForm(prev => ({ ...prev, priority: p }))}
                        className={`flex-1 py-2 rounded-lg border-2 text-xs font-bold transition-all cursor-pointer ${
                          aidForm.priority === p
                            ? p === 'Urgent' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-[#003399] bg-blue-50 text-[#002060]'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Department + Island */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Department</label>
                  <select value={aidForm.department} onChange={e => setAidForm(p => ({ ...p, department: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                    {['AI Operations', 'GIS & Remote Sensing', 'Valuation Services', 'Real Estate Analytics', 'Data Engineering', 'QC & Audit', 'Solutions Group', 'Infrastructure Management', 'People Operations', 'Finance', 'Security', 'Field Services'].map(d => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Island Group</label>
                  <div className="flex gap-1.5">
                    {(['Luzon', 'Visayas', 'Mindanao'] as const).map(ig => (
                      <button key={ig} type="button" onClick={() => setAidForm(p => ({ ...p, islandGroup: ig }))}
                        className={`flex-1 py-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                          aidForm.islandGroup === ig ? 'border-[#002060] bg-blue-50 text-[#002060]' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}>{ig}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#002060] uppercase tracking-widest">Damage / Situation Description *</label>
                <textarea required rows={3} placeholder="Describe the damage or situation requiring aid..."
                  value={aidForm.description} onChange={e => setAidForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAidModal(false)}
                  className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 bg-[#002060] hover:bg-[#003399] text-white font-bold py-2.5 rounded-lg text-xs transition cursor-pointer active:scale-95">
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}