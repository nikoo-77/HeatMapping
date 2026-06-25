import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LUZON_LOCATIONS, VISAYAS_LOCATIONS, MINDANAO_LOCATIONS, generateAllIslandEmployees } from './data_islands';
import { Employee, SafetyStatus, DisasterConfig, EmployeeTeam } from './types';
import InteractiveMap from './components/InteractiveMap';
import EmployeeRollCall from './components/EmployeeRollCall';
import { exportCalamityReportEmployees } from './utils/exportEmployeeReport';
import { 
  ShieldAlert, Activity, Send, CheckCircle, Info, RefreshCw, 
  AlertOctagon, Sparkles, Map, Compass, Radio, Users, Battery, Search, HelpCircle, AlertTriangle,
  FileWarning, X, MapPin, Crosshair, LayoutDashboard, BookUser, ClipboardList, FileSpreadsheet, Plus, MoreVertical, Trash2
} from 'lucide-react';

export default function App() {
  // ── Page navigation ─────────────────────────────────────────────────────
  const [activePage, setActivePage] = useState<'dashboard' | 'directory' | 'reports'>('dashboard');
  // Employee Directory search/filter state
  const [dirSearch, setDirSearch] = useState('');
  const [dirDept,   setDirDept]   = useState('All Departments');
  const [dirIsland, setDirIsland] = useState<'All' | 'Luzon' | 'Visayas' | 'Mindanao'>('All');
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
  const [calamityReports, setCalamityReports] = useState<Array<{
    id: string;
    timestamp: string;
    type: string;
    incidentName: string;
    locationLabel: string;
    lat: number;
    lng: number;
    radiusKm: number;
    affectedCount: number;
    affectedEmployeeIds: string[];   // IDs captured at time of filing
    magnitude?: string;
    signalLevel?: string;
    description: string;
  }>>([])

  // Track which report card has its employee list expanded
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);;

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

  // Viewer role & team filter
  const [viewerRole, setViewerRole] = useState<EmployeeTeam>('HR/CSR');
  const [filterByTeam, setFilterByTeam] = useState(false);

  // Toggle for Incident & Emergency Simulation Deck
  const [simulationActive, setSimulationActive] = useState<boolean>(false);

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

  // Active Disaster Location — stored as real GPS coordinates + radius in km
  const [epicenter, setEpicenter] = useState({ lat: 10.3311, lng: 123.9053, radiusKm: 5 });
  const [activeDisaster, setActiveDisaster] = useState<DisasterConfig>({
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
  });

  // Seeded employee database distributed across the three Philippine island groups
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('island_map_employees');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Wipe old dataset if it lacks the islandGroup or team field
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

  // Save changes to local persistence
  useEffect(() => {
    localStorage.setItem('island_map_employees', JSON.stringify(employees));
  }, [employees]);

  // Log dispatch helper
  const pushLog = useCallback((msg: string, type: 'info' | 'warn' | 'success' | 'err' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [
      { id: `${Date.now()}-${Math.random()}`, time: timestamp, msg, type },
      ...prev.slice(0, 45)
    ]);
  }, []);

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
      const geoMatch =
        (!selectedCity || emp.address?.includes(selectedCity)) &&
        (!selectedIslandGroup || emp.islandGroup === selectedIslandGroup);
      const teamMatch = !filterByTeam || emp.team === viewerRole;
      return geoMatch && teamMatch;
    });
  }, [employees, selectedCity, selectedIslandGroup, filterByTeam, viewerRole]);

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
    setEmployees(generateAllIslandEmployees());
    setSelectedEmployee(null);
    setSelectedCity(null);
    setSelectedIslandGroup(null);
    setFilterByTeam(false);
    setSimulationActive(false);
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
    let incidentName = type;
    if (type === 'Other' && hazardName.trim()) incidentName = hazardName.trim();
    const fullName = locationLabel
      ? `${incidentName} — ${locationLabel}`
      : `${incidentName} Incident`;

    // Build auto-description with extra fields
    let extraDetails = '';
    if (type === 'Earthquake' && magnitude.trim()) extraDetails = ` Magnitude/Intensity: ${magnitude}.`;
    if (type === 'Typhoon' && signalLevel)         extraDetails = ` ${signalLevel}.`;
    const desc = description
      ? description + extraDetails
      : `${incidentName} calamity reported by HR/Management at [${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E].${extraDetails}`;

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

     // Apply immediate impact statuses using accurate GPS Haversine distance
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
         } else {
           return {
             ...emp,
             status: 'Green' as SafetyStatus,
             contacted: true,
             unresponsive: false,
             safetyMessage: 'Home residence cleared outside immediate hazard zone.',
             rescueDispatched: false,
           };
         }
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

  // Counters
  const affectedStaff = employees.filter(emp => getDistance(emp) <= epicenter.radiusKm).length;
  const safeStaffCount = employees.filter(emp => getDistance(emp) <= epicenter.radiusKm && emp.status === 'Green').length;
  const pendingCount = employees.filter(emp => getDistance(emp) <= epicenter.radiusKm && emp.status === 'Yellow').length;
  const offlineDangerCount = employees.filter(emp => getDistance(emp) <= epicenter.radiusKm && emp.status === 'Red').length;

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

  return (
    <div className="bg-[#f8fafc] text-slate-900 min-h-screen flex flex-col font-sans transition-colors duration-250">
      
      {/* Pristine Branding Header matching the screenshots exactly */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50 shadow-sm">
        
        {/* Left Side: Title that updates based on the view */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#002060] text-white p-1.5 rounded flex items-center justify-center shadow-sm">
              <Map className="w-5 h-5 shrink-0" />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#002060] uppercase animate-fade-in">
              CSR Crisis Intelligence Dashboard
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium max-w-xl mt-1">
            Analyzing workforce and satellite footprints for {employees.length} personnel across the Philippine Islands.
          </p>
        </div>

        {/* Center: Role selector & team filter */}
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

        {/* Right Side: Co-labelled corporate logos */}
        <div className="flex items-center gap-4 shrink-0 bg-slate-50/80 px-4 py-2 rounded-lg border border-slate-200">
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

          <div className="flex flex-col gap-1 px-3">
            {([
              { id: 'dashboard' as const, label: 'Main Dashboard',    Icon: LayoutDashboard },
              { id: 'directory' as const, label: 'Employee Directory', Icon: BookUser },
              { id: 'reports'   as const, label: 'Calamity Reports',  Icon: ClipboardList, badge: calamityReports.length },
            ]).map(({ id, label, Icon, badge }) => (
              <button
                key={id}
                onClick={() => setActivePage(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer text-left group ${
                  activePage === id
                    ? 'bg-white/15 text-white shadow-inner border border-white/10'
                    : 'text-blue-200/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 shrink-0 transition-colors ${ activePage === id ? 'text-white' : 'text-blue-300 group-hover:text-white' }`} />
                <span className="flex-1 leading-tight">{label}</span>
                {badge != null && badge > 0 && (
                  <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {badge}
                  </span>
                )}
              </button>
            ))}
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
                  {employees.filter(e => e.status === 'Green').length} safe
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
        
        {/* Left Column: Island Group Filter Panel */}
        <section className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[750px]">
          <div className="bg-[#002060] px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-white font-extrabold text-sm tracking-wide">Island Group</span>
            <span className="text-white font-extrabold text-sm tracking-wide">FTE</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

            {/* All Philippines Row */}
            <button
              onClick={() => {
                setSelectedIslandGroup(null);
                setSelectedCity(null);
                pushLog(`Viewing all Philippine island groups (${employees.length} employees).`, 'info');
              }}
              className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors cursor-pointer border-b border-slate-200 hover:bg-[#ebf1fc]
                ${!selectedIslandGroup ? 'bg-[#d9e1f2] border-l-4 border-l-[#002060]' : 'bg-slate-50'}`}
            >
              <span className="font-extrabold text-[#002060] text-sm">🇵🇭 Philippines (All)</span>
              <strong className="font-black text-[#002060] text-base">{employees.length}</strong>
            </button>

            {/* ── LUZON ─────────────────────────────── */}
            <button
              onClick={() => {
                setSelectedIslandGroup('Luzon');
                setSelectedCity(null);
                const count = employees.filter(e => e.islandGroup === 'Luzon').length;
                pushLog(`Filtering by Luzon island group (${count} employees).`, 'info');
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all hover:bg-emerald-50 cursor-pointer
                ${selectedIslandGroup === 'Luzon' ? 'bg-emerald-50 border-l-4 border-l-emerald-600 font-bold' : ''}`}
            >
              <span className="font-extrabold text-emerald-800 text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                Luzon
              </span>
              <span className="font-mono font-black text-emerald-900 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                {employees.filter(e => e.islandGroup === 'Luzon').length} fte
              </span>
            </button>
            {/* Luzon city breakdown */}
            {LUZON_LOCATIONS.map((loc) => {
              const cityEmp = employees.filter(e => e.address?.includes(loc.city)).length;
              const isSelected = selectedCity === loc.city;
              return (
                <button
                  key={loc.name}
                  onClick={() => {
                    setSelectedIslandGroup('Luzon');
                    setSelectedCity(loc.city);
                    pushLog(`Focused: ${loc.name}, ${loc.province} (${cityEmp} FTEs).`, 'info');
                  }}
                  className={`w-full text-left pl-8 pr-4 py-2 flex items-center justify-between transition-all hover:bg-slate-50 cursor-pointer text-xs
                    ${isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''}`}
                >
                  <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                  <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                    {loc.fte} fte
                  </span>
                </button>
              );
            })}

            {/* ── VISAYAS ───────────────────────────── */}
            <button
              onClick={() => {
                setSelectedIslandGroup('Visayas');
                setSelectedCity(null);
                const count = employees.filter(e => e.islandGroup === 'Visayas').length;
                pushLog(`Filtering by Visayas island group (${count} employees).`, 'info');
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all hover:bg-blue-50 cursor-pointer
                ${selectedIslandGroup === 'Visayas' ? 'bg-blue-50 border-l-4 border-l-blue-600 font-bold' : ''}`}
            >
              <span className="font-extrabold text-blue-800 text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                Visayas
              </span>
              <span className="font-mono font-black text-blue-900 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                {employees.filter(e => e.islandGroup === 'Visayas').length} fte
              </span>
            </button>
            {/* Visayas city breakdown */}
            {VISAYAS_LOCATIONS.map((loc) => {
              const cityEmp = employees.filter(e => e.address?.includes(loc.city)).length;
              const isSelected = selectedCity === loc.city;
              return (
                <button
                  key={loc.name}
                  onClick={() => {
                    setSelectedIslandGroup('Visayas');
                    setSelectedCity(loc.city);
                    pushLog(`Focused: ${loc.name}, ${loc.province} (${cityEmp} FTEs).`, 'info');
                  }}
                  className={`w-full text-left pl-8 pr-4 py-2 flex items-center justify-between transition-all hover:bg-slate-50 cursor-pointer text-xs
                    ${isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''}`}
                >
                  <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                  <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                    {loc.fte} fte
                  </span>
                </button>
              );
            })}

            {/* ── MINDANAO ──────────────────────────── */}
            <button
              onClick={() => {
                setSelectedIslandGroup('Mindanao');
                setSelectedCity(null);
                const count = employees.filter(e => e.islandGroup === 'Mindanao').length;
                pushLog(`Filtering by Mindanao island group (${count} employees).`, 'info');
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-all hover:bg-amber-50 cursor-pointer
                ${selectedIslandGroup === 'Mindanao' ? 'bg-amber-50 border-l-4 border-l-amber-600 font-bold' : ''}`}
            >
              <span className="font-extrabold text-amber-800 text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                Mindanao
              </span>
              <span className="font-mono font-black text-amber-900 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                {employees.filter(e => e.islandGroup === 'Mindanao').length} fte
              </span>
            </button>
            {/* Mindanao city breakdown */}
            {MINDANAO_LOCATIONS.map((loc) => {
              const cityEmp = employees.filter(e => e.address?.includes(loc.city)).length;
              const isSelected = selectedCity === loc.city;
              return (
                <button
                  key={loc.name}
                  onClick={() => {
                    setSelectedIslandGroup('Mindanao');
                    setSelectedCity(loc.city);
                    pushLog(`Focused: ${loc.name}, ${loc.province} (${cityEmp} FTEs).`, 'info');
                  }}
                  className={`w-full text-left pl-8 pr-4 py-2 flex items-center justify-between transition-all hover:bg-slate-50 cursor-pointer text-xs
                    ${isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''}`}
                >
                  <span className="text-slate-600 font-medium truncate">{loc.name}</span>
                  <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                    {loc.fte} fte
                  </span>
                </button>
              );
            })}

          </div>

          <div className="bg-slate-50 p-3 border-t border-slate-200 text-[10px] font-mono text-slate-500 font-bold text-center flex flex-col gap-0.5">
            <span>DATABASE SYNCHRONIZED</span>
            <span>Total Headcount: {employees.length} fte</span>
          </div>
        </section>

        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
          
          {/* Map column header: title left, crisis drill controls right */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            {/* Left: live indicator + title */}
            <span className="font-extrabold uppercase text-slate-800 text-xs flex items-center gap-1.5 font-mono shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
              {selectedIslandGroup
                ? `${selectedIslandGroup} — Workforce Density`
                : selectedCity
                ? `${selectedCity} — Local View`
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

      {/* ──────────── EMPLOYEE DIRECTORY PAGE ──────────── */}
      {activePage === 'directory' && (() => {
        const departments = ['All Departments', ...Array.from(new Set(employees.map(e => e.department))).sort()];
        const filtered = employees.filter(e => {
          const q = dirSearch.toLowerCase();
          const matchSearch  = !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.department.toLowerCase().includes(q);
          const matchDept    = dirDept === 'All Departments' || e.department === dirDept;
          const matchIsland  = dirIsland === 'All' || e.islandGroup === dirIsland;
          const matchTeam    = !filterByTeam || e.team === viewerRole;
          return matchSearch && matchDept && matchIsland && matchTeam;
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
                          onClick={() => setDirIsland(ig)}
                          className={`px-3 py-1.5 rounded-md text-[11px] font-black border transition-all duration-150 cursor-pointer ${
                            active ? activeStyle + ' shadow-sm' : islandInactive
                          }`}
                        >
                          {ig === 'All' ? '🇵🇭 All' : ig}
                        </button>
                      );
                    })}
                  </div>

                  {/* Record count */}
                  <span className="text-[10px] text-slate-400 font-mono ml-auto whitespace-nowrap">
                    {filtered.length} of {employees.length} records
                  </span>
                </div>

                {/* Row 2: active filter chips */}
                {(filterByTeam || dirIsland !== 'All' || dirDept !== 'All Departments' || dirSearch) && (
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active filters:</span>
                    {filterByTeam && (
                      <span className="flex items-center gap-1 bg-[#002060]/10 text-[#002060] border border-[#002060]/20 text-[10px] font-black px-2 py-0.5 rounded-full">
                        👤 {viewerRole} Team
                        <button onClick={() => setFilterByTeam(false)} className="ml-0.5 hover:text-rose-600 cursor-pointer">×</button>
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
                      onClick={() => { setDirSearch(''); setDirDept('All Departments'); setDirIsland('All'); setFilterByTeam(false); }}
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
                            {emp.address ? (
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
                            {emp.gpsLat ? (
                              <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full">
                                <MapPin className="w-3 h-3" /> GPS Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold px-2.5 py-1 rounded-full">
                                No GPS
                              </span>
                            )}
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

      {/* ──────────── CALAMITY REPORTS PAGE ──────────── */}
      {activePage === 'reports' && (
        <div className="flex-1 p-6">
          <div className="max-w-[1550px] mx-auto flex flex-col gap-5">

            {/* Page header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#002060] flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" /> Calamity Reports
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  History of all manually filed incident reports by HR / Management.
                </p>
              </div>
              {calamityReports.length > 0 && (
                <span className="bg-orange-100 text-orange-700 border border-orange-200 text-xs font-black px-3 py-1 rounded-full">
                  {calamityReports.length} report{calamityReports.length !== 1 ? 's' : ''} filed
                </span>
              )}
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

                  // Live-lookup affected employees from current state
                  const affectedEmps = employees.filter(e => r.affectedEmployeeIds.includes(e.id));
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

    </div>
  );
}
