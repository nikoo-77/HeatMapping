import React, { useState } from 'react';
import { Employee, SafetyStatus, DisasterConfig } from '../types';
import { 
  Search, Send, ShieldAlert, Plus, HelpCircle, Flame, MapPin, 
  Users, Battery, RefreshCw, Phone, Mail, Signal, CheckCircle, 
  AlertCircle, AlertOctagon, UserCheck, HeartHandshake, Compass
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StatusTrackerProps {
  employees: Employee[];
  epicenter: { x: number; y: number; radius: number };
  onSelectEmployee: (emp: Employee | null) => void;
  selectedEmployee: Employee | null;
  onSimulateReply: (employeeId: string, forcedStatus?: SafetyStatus) => void;
  onSendCheckIn: (employeeId: string) => void;
  onSendCheckInAllAffected: () => void;
  onAddEmployee: (newEmp: Employee) => void;
  onResetDatabase: () => void;
  onDispatchRescue: (employeeId: string) => void;
  activeDisaster: DisasterConfig;
}

export default function StatusTracker({
  employees,
  epicenter,
  onSelectEmployee,
  selectedEmployee,
  onSimulateReply,
  onSendCheckIn,
  onSendCheckInAllAffected,
  onAddEmployee,
  onResetDatabase,
  onDispatchRescue,
  activeDisaster,
}: StatusTrackerProps) {
  const [activeTab, setActiveTab] = useState<'AFFECTED' | 'ALL_EMPLOYEES' | 'ADD_NEW'>('AFFECTED');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSimulations, setShowSimulations] = useState<Record<string, boolean>>({});
  
  // High-performance filter substate for severity metrics (clicking red/yellow/green counters)
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'Red' | 'Yellow' | 'Green'>('ALL');

  // Custom states for creating new employee
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('Safety Associate');
  const [newEmpDept, setNewEmpDept] = useState('Operations');
  const [newEmpAddress, setNewEmpAddress] = useState('');
  const [newEmpX, setNewEmpX] = useState(38);
  const [newEmpY, setNewEmpY] = useState(42);
  
  // Geographic conversion bounds (kept in sync with InteractiveMap constants)
  const LAT_MIN = 10.245;
  const LAT_MAX = 10.355;
  const LNG_MIN = 123.82;
  const LNG_MAX = 123.99;

  // Helper converters between grid (0-100) and GPS
  const gridToGps = (gridX: number, gridY: number) => {
    const lat = LAT_MAX - (gridY / 100) * (LAT_MAX - LAT_MIN);
    const lng = LNG_MIN + (gridX / 100) * (LNG_MAX - LNG_MIN);
    return { lat, lng };
  };

  const gpsToGrid = (lat: number, lng: number) => {
    const customLat = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100;
    const customLng = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
    return {
      x: Math.max(0, Math.min(100, parseFloat(customLng.toFixed(1)))),
      y: Math.max(0, Math.min(100, parseFloat(customLat.toFixed(1))))
    };
  };

  // Store GPS inputs (text/number) and keep grid coords synced
  const [newEmpGpsLat, setNewEmpGpsLat] = useState(() => gridToGps(38, 42).lat);
  const [newEmpGpsLng, setNewEmpGpsLng] = useState(() => gridToGps(38, 42).lng);

  const toggleSimulation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSimulations(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDisasterCategory = (name: string) => {
    if (name.includes('Fire')) return 'Fire';
    if (name.includes('Flood')) return 'Flood';
    if (name.includes('Gas')) return 'Gas Leak';
    if (name.includes('Blast')) return 'Blast';
    if (name.includes('Earthquake')) return 'Earthquake';
    return 'Hazard';
  };

  const getDisasterEmoji = (icon: string) => {
    if (icon === 'typhoon') return '🌊';
    if (icon === 'earthquake') return '🚨';
    return '🔥';
  };

  // Helper to generate simulated contact numbers
  const getSimulatedPhoneNumber = (emp: Employee) => {
    const rawId = emp.id.replace(/\D/g, '').padEnd(4, '0').slice(-4);
    const prefix = emp.carrier === 'Globe' ? '917' : emp.carrier === 'Smart' ? '919' : '999';
    return `+63 (${prefix}) 555-${rawId}`;
  };

  const getSimulatedEmail = (emp: Employee) => {
    const userName = emp.name.toLowerCase().replace(/\s+/g, '.');
    return `${userName}@innodata.com`;
  };

  // Compute affected employees (inside conflagration radius)
  const getDistance = (emp: Employee) => {
    const dx = emp.lng - epicenter.x;
    const dy = emp.lat - epicenter.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const affectedEmployees = employees.filter((emp) => {
    const dist = getDistance(emp);
    return dist <= epicenter.radius;
  });

  // Filter lists based on search and severity clicks
  const matchesSearch = (emp: Employee) => {
    const matchesQuery = (
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.address && emp.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      emp.carrier.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return matchesQuery;
  };

  // Filter and sort strictly inside the affected scope
  const filteredAffected = React.useMemo(() => {
    const list = affectedEmployees.filter(emp => {
      const searchOk = matchesSearch(emp);
      const severityOk = severityFilter === 'ALL' || emp.status === severityFilter;
      return searchOk && severityOk;
    });

    // Sort to prioritize "Red" (Need Help) status at the top
    list.sort((a, b) => {
      const scoreA = a.status === 'Red' && !a.rescueDispatched ? 4 : a.status === 'Red' ? 3 : a.unresponsive ? 2 : a.status === 'Yellow' ? 1 : 0;
      const scoreB = b.status === 'Red' && !b.rescueDispatched ? 4 : b.status === 'Red' ? 3 : b.unresponsive ? 2 : b.status === 'Yellow' ? 1 : 0;
      return scoreB - scoreA;
    });
    return list;
  }, [affectedEmployees, searchQuery, severityFilter]);

  const filteredAll = React.useMemo(() => {
    const list = employees.filter(matchesSearch);
    list.sort((a, b) => {
      const scoreA = a.status === 'Red' && !a.rescueDispatched ? 4 : a.status === 'Red' ? 3 : a.unresponsive ? 2 : a.status === 'Yellow' ? 1 : 0;
      const scoreB = b.status === 'Red' && !b.rescueDispatched ? 4 : b.status === 'Red' ? 3 : b.unresponsive ? 2 : b.status === 'Yellow' ? 1 : 0;
      return scoreB - scoreA;
    });
    return list;
  }, [employees, searchQuery]);

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;

    const avatar = newEmpName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'EM';
    const newEmp: Employee = {
      id: `emp-custom-${Date.now()}`,
      name: newEmpName,
      role: newEmpRole,
      department: newEmpDept,
      // Map back coordinates cleanly
      lat: Number(newEmpY),
      lng: Number(newEmpX),
      gpsLat: Number(newEmpGpsLat),
      gpsLng: Number(newEmpGpsLng),
      carrier: 'Globe',
      normalSignalStrength: -75,
      battery: Math.round(50 + Math.random() * 50),
      status: 'Yellow', // defaults to yellow on placement during crisis
      avatar: avatar,
      address: newEmpAddress || 'Cebu City, PH',
    };

    onAddEmployee(newEmp);
    
    // Reset form and return to index
    setNewEmpName('');
    setNewEmpAddress('');
    setActiveTab('AFFECTED');
  };

  // Quick stats computed for personnel inside hazard limit
  const greenInRiskCount = affectedEmployees.filter(e => e.status === 'Green').length;
  const pendingInRiskCount = affectedEmployees.filter(e => e.status === 'Yellow').length;
  const unresponsiveCount = affectedEmployees.filter(e => e.status === 'Red').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 shadow-sm text-slate-800 font-sans h-full min-h-[500px]">
      
      {/* 1. Header Segment with Tab Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-205">
          
          <button
            onClick={() => {
              setActiveTab('AFFECTED');
              setSeverityFilter('ALL');
            }}
            className={`text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-md transition-all duration-150 cursor-pointer flex items-center gap-1.5
              ${activeTab === 'AFFECTED'
                ? 'bg-[#002060] text-white font-extrabold shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }
            `}
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>AFFECTED RESIDENCES ({affectedEmployees.length})</span>
          </button>
          
          <button
            onClick={() => setActiveTab('ALL_EMPLOYEES')}
            className={`text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-md transition-all duration-150 cursor-pointer flex items-center gap-1.5
              ${activeTab === 'ALL_EMPLOYEES'
                ? 'bg-[#002060] text-white font-extrabold shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }
            `}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>ALL CEBU STAFF ({employees.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ADD_NEW')}
            className={`text-xs font-bold tracking-wide px-3.5 py-1.5 rounded-md transition-all duration-150 cursor-pointer flex items-center gap-1.5
              ${activeTab === 'ADD_NEW'
                ? 'bg-[#002060] text-white font-extrabold shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }
            `}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>ADD RESIDENT</span>
          </button>
        </div>
        
        {/* Reset Database option */}
        <button
          onClick={onResetDatabase}
          className="text-xs uppercase font-mono font-black text-slate-400 hover:text-red-700 flex items-center gap-1 cursor-pointer transition-colors px-2 py-1 hover:bg-red-50 rounded"
          title="Reset database to initial Cebu employees list"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" />
          <span>RESET DATABASE</span>
        </button>
      </div>

      {/* 2. LIVE CRISIS SEVERITY CONTROLLERS (AFFECTED TAB PANEL ONLY) */}
      {activeTab === 'AFFECTED' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center select-none" id="crisis-severity-grid">
          
          <button
            onClick={() => setSeverityFilter('ALL')}
            className={`p-2.5 rounded-lg border transition-all text-left flex flex-col justify-between cursor-pointer ${
              severityFilter === 'ALL'
                ? 'bg-slate-105 border-slate-400 ring-1 ring-slate-300'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider">ALL AFFECTED</span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-xl font-black text-slate-900">{affectedEmployees.length}</span>
              <span className="text-[9px] text-slate-400 font-mono">FTEs</span>
            </div>
          </button>

          <button
            onClick={() => setSeverityFilter('Red')}
            className={`p-2.5 rounded-lg border transition-all text-left flex flex-col justify-between cursor-pointer ${
              severityFilter === 'Red'
                ? 'bg-red-50 border-red-400 ring-1 ring-red-300'
                : 'bg-red-50/30 hover:bg-red-50/60 border-red-150'
            }`}
          >
            <span className="text-[10px] text-red-700 font-bold uppercase flex items-center gap-1 block tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
              MUTED (🔴)
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-xl font-black text-red-700">{unresponsiveCount}</span>
              <span className="text-[9px] text-red-500 font-mono">CRITICAL</span>
            </div>
          </button>

          <button
            onClick={() => setSeverityFilter('Yellow')}
            className={`p-2.5 rounded-lg border transition-all text-left flex flex-col justify-between cursor-pointer ${
              severityFilter === 'Yellow'
                ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300'
                : 'bg-amber-50/35 hover:bg-amber-50/60 border-amber-150'
            }`}
          >
            <span className="text-[10px] text-amber-700 font-bold uppercase flex items-center gap-1 block tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              PENDING (🟡)
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-xl font-black text-amber-700">{pendingInRiskCount}</span>
              <span className="text-[9px] text-amber-500 font-mono">AWAITING</span>
            </div>
          </button>

          <button
            onClick={() => setSeverityFilter('Green')}
            className={`p-2.5 rounded-lg border transition-all text-left flex flex-col justify-between cursor-pointer ${
              severityFilter === 'Green'
                ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300'
                : 'bg-emerald-50/35 hover:bg-emerald-50/60 border-emerald-150'
            }`}
          >
            <span className="text-[10px] text-emerald-700 font-bold uppercase flex items-center gap-1 block tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              SECURE (🟢)
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-xl font-black text-emerald-700">{greenInRiskCount}</span>
              <span className="text-[9px] text-emerald-500 font-mono">SAFE</span>
            </div>
          </button>

        </div>
      )}

      {/* 3. DYNAMIC SEARCH COMPONENT */}
      {activeTab !== 'ADD_NEW' && (
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              activeTab === 'AFFECTED' 
                ? `Search by name, carrier, title or road inside ${severityFilter === 'ALL' ? 'Affected' : severityFilter} roster...` 
                : "Search all Cebu workforce directory..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#002060] focus:border-[#002060] transition-colors font-mono"
            id="sidebar-search-input"
          />
        </div>
      )}

      {/* 4. MAIN TELEMETRY CONTENT SECTION */}
      <AnimatePresence mode="wait">
        {activeTab === 'AFFECTED' ? (
          <motion.div
            key="affected-segment-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 flex-1 min-h-[350px] overflow-hidden"
          >
            {/* Header control for affected employees */}
            <div className="bg-red-50/50 border border-red-200/60 rounded-xl p-3.5 space-y-3 text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-slate-800 font-mono">
                <span className="flex items-center gap-1.5 uppercase font-bold text-red-700">
                  <ShieldAlert className="w-4 h-4 text-red-650 animate-pulse shrink-0" />
                  Crisis Communication &amp; Alerts Desk
                </span>
                <span className="text-red-750 font-black tracking-wider text-[10px] bg-red-100/70 border border-red-200 px-2 py-0.5 rounded">
                  {filteredAffected.length} EMPLOYEES MATCHED FILTER
                </span>
              </div>
              <p className="text-[11px] text-slate-650 leading-relaxed font-sans font-medium">
                The {getDisasterCategory(activeDisaster.name).toLowerCase()} epicenter bounds encompass these personnel residences. Deploy distress SMS alerts and evaluate status responses. Click on an employee card to pinpoint their home on the maps.
              </p>

              {affectedEmployees.length > 0 && (
                <div className="w-full bg-slate-50 border border-slate-205 p-3.5 rounded-xl text-xs font-sans text-slate-600 leading-relaxed shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <span className="text-amber-500 font-extrabold text-sm shrink-0">⚠️</span>
                    <div>
                      <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-0.5">Manual Reachout Protocol Active</p>
                      <p className="text-[10.5px]">To optimize network bandwidth and comply with Filipino disaster drills, automated bulk SMS dispatching is deactivated. Please contact the <strong>{affectedEmployees.length} matching personnel</strong> individually below.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AFFECTED CARD LISTINGS */}
            <div className="flex-1 overflow-y-auto space-y-3.5 max-h-[380px] pr-1">
              {filteredAffected.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-205 rounded-xl leading-normal">
                  <Flame className="w-10 h-10 text-orange-500 mx-auto mb-2.5 animate-bounce" />
                  <p className="text-xs font-mono font-bold text-slate-400">No personnel match current filters.</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    {severityFilter !== 'ALL' 
                      ? `Try switching from "${severityFilter}" filter to "ALL AFFECTED" to see safe or pending employees.` 
                      : "Drag the fire hazard emblem on the map to place it over highly populated housing sectors."
                    }
                  </p>
                </div>
              ) : (
                filteredAffected.map((emp) => {
                  const isSelected = selectedEmployee?.id === emp.id;
                  const dist = getDistance(emp).toFixed(1);
                  const isSimOpen = !!showSimulations[emp.id];
                  const telNum = getSimulatedPhoneNumber(emp);
                  const emailName = getSimulatedEmail(emp);
                  
                  return (
                    <div
                      key={emp.id}
                      onClick={() => onSelectEmployee(emp)}
                      className={`border p-4 rounded-xl cursor-pointer transition-all duration-150 relative overflow-hidden flex flex-col gap-3 shadow-xs
                        ${isSelected
                          ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/30'
                          : emp.status === 'Red'
                            ? 'bg-red-50/10 border-slate-205 hover:border-red-300'
                            : 'bg-white border-slate-200 hover:border-orange-200 hover:bg-slate-50/80'
                        }
                      `}
                      id={`affected-card-${emp.id}`}
                    >
                      {/* Safety Indicator Ribbon */}
                      <div className={`absolute top-0 left-0 w-2 h-full ${
                        emp.status === 'Green' 
                          ? 'bg-emerald-500' 
                          : emp.status === 'Yellow' 
                            ? 'bg-amber-500' 
                            : 'bg-red-600 animate-[pulse_1.2s_infinite]'
                      }`} />

                      {/* Header block: Info, Status indicators, Distance */}
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-2.5 pl-2">
                        
                        <div className="flex items-start gap-2.5">
                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black border shadow-sm shrink-0 font-sans
                            ${emp.status === 'Green' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : ''}
                            ${emp.status === 'Yellow' ? 'bg-amber-100 border-amber-300 text-amber-800 animate-pulse' : ''}
                            ${emp.status === 'Red' ? 'bg-rose-100 border-rose-300 text-rose-800' : ''}
                          `}>
                            {emp.avatar}
                          </div>

                          <div className="leading-snug">
                            <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                              {emp.name}
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.25 rounded font-mono font-bold tracking-tight">
                                {emp.department}
                              </span>
                            </h4>
                            <p className="text-[10px] text-slate-500 font-semibold tracking-tight">{emp.role}</p>
                          </div>
                        </div>

                        {/* Top Right Status indicators */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[9px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded border leading-none text-center block
                            ${emp.status === 'Green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                            ${emp.status === 'Yellow' ? 'bg-amber-50 text-amber-750 border-amber-300' : ''}
                            ${emp.status === 'Red' ? 'bg-rose-100 text-rose-700 border-rose-300' : ''}
                          `}>
                            {emp.status === 'Green' 
                              ? '🛡️ SECURE & HEALTHY' 
                              : emp.status === 'Yellow' 
                                ? '⏳ BEACON SENT / REPLY PENDING' 
                                : '⚠️ TRANSMISSION MUTED'}
                          </span>
                          
                          <span className="text-[9px] font-mono text-red-650 font-black uppercase tracking-wider mt-0.5">
                            📍 {dist} range units to conflagrate
                          </span>
                        </div>

                      </div>

                      {/* DETAILED EMPLOYEE DOSSIER DATA (Answer to "Where is employee info") */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono pl-2">
                        
                        {/* Column 1: Communication Linkages */}
                        <div className="bg-slate-50 border border-slate-150 p-2 rounded-lg flex flex-col gap-1.5">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block border-b pb-1">COMMUNICATION VECTOR</span>
                          
                          <div className="flex items-center gap-1.5 text-slate-800">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <strong className="tracking-tight select-all">{telNum}</strong>
                          </div>

                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate select-all" title={emailName}>{emailName}</span>
                          </div>
                        </div>

                        {/* Column 2: Devices & Satellite signals */}
                        <div className="bg-slate-50 border border-slate-150 p-2 rounded-lg flex flex-col gap-1.5">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block border-b pb-1">DEVICE TELEMETRY</span>
                          
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-slate-800">
                              <Signal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{emp.carrier} Link:</span>
                            </div>
                            <strong className={`${
                              emp.carrier === 'DITO' ? 'text-red-600 font-black' : 'text-slate-700'
                            }`}>
                              {emp.normalSignalStrength} dBm {emp.carrier === 'DITO' ? '(Blocked)' : '(Atypical)'}
                            </strong>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 text-slate-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>GSM Carrier Link:</span>
                            </span>
                            <strong className="text-slate-700">
                              {emp.carrier} (Active)
                            </strong>
                          </div>
                        </div>

                      </div>

                      {/* PHYSICAL RESIDENCE PATH */}
                      <div className="bg-slate-50 border border-slate-205 p-2.5 rounded-lg pl-3 ml-2 shadow-inner text-slate-800 leading-tight">
                        <span className="text-[8px] uppercase tracking-widest font-black text-slate-400 block font-mono">PRIMARY REGISTERED RESIDENCE:</span>
                        <strong className="text-xs font-extrabold text-slate-900 block mt-1 tracking-tight flex items-start gap-1.5 font-sans">
                          <MapPin className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <span>{emp.address || 'Cebu Province, PH'}</span>
                        </strong>
                        {emp.gpsLat && (
                          <span className="text-[9px] text-slate-400 font-mono block mt-1 ml-5.5">
                            Precise GPS coordinates: [{emp.gpsLat}°N, {emp.gpsLng}°E]
                          </span>
                        )}
                      </div>

                      {/* Rescue Force Dispatch Banner if active */}
                      {emp.rescueDispatched && (
                        <div className="pl-2 select-none">
                          <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-600 text-white font-mono font-extrabold px-2.5 py-1 rounded-md shadow-sm border border-emerald-700">
                            🎁 CORPORATE CALAMITY RELIEF & PHP 10K BALANCES PROVISIONED
                          </span>
                        </div>
                      )}

                      {/* Msg payload / simulation buttons */}
                      <div className="pl-2 border-t border-slate-100 pt-2 flex flex-col gap-2">
                        {emp.status === 'Green' ? (
                          <div className="bg-emerald-50/60 p-2.5 rounded border border-emerald-100 text-[11px] text-emerald-800 font-sans font-semibold italic flex items-start gap-1.5">
                            <span className="text-base leading-none">💬</span>
                            <span>Broadcast Report: &ldquo;{emp.safetyMessage || 'Evacuated sector safely.'}&rdquo;</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              {/* Send SMS ping */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSendCheckIn(emp.id);
                                }}
                                className="flex-1 bg-amber-55 text-amber-900 hover:bg-amber-100/80 text-[10.5px] font-mono font-black uppercase px-2.5 py-2 rounded-lg border border-amber-300 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                                title="Send manual disaster notification SMS"
                              >
                                <Send className="w-3 h-3 text-amber-700" />
                                <span>{!emp.contacted ? "Send Manual SMS" : "Manual SMS Re-Send"}</span>
                              </button>

                              {/* Toggle developer panel */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSimulation(emp.id, e);
                                }}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-mono py-2 px-2.5 rounded-lg border border-slate-300 transition cursor-pointer select-none"
                                title="Simulate crisis answer code"
                              >
                                {isSimOpen ? '🔒 Closed Sim' : '🛠️ Force Safety Response'}
                              </button>
                            </div>

                            {/* Collapsible Simulation controls helper */}
                            {isSimOpen && (
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col gap-2 animate-fade-in">
                                <span className="text-[9px] font-mono font-black text-slate-400">DECISION DRILL SIMULATOR:</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSimulateReply(emp.id, 'Green');
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-mono font-black uppercase py-1.5 px-2 rounded transition cursor-pointer shadow-xs active:scale-95 text-center"
                                    title="Simulate self-report safe response"
                                  >
                                    SIMULATE SAFE
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSimulateReply(emp.id, 'Red');
                                    }}
                                    className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-mono font-black uppercase py-1.5 px-2 rounded transition cursor-pointer shadow-xs active:scale-95 text-center"
                                    title="Simulate urgent SOS help request"
                                  >
                                    SIMULATE HELP
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Dispatch Rescue and Lock View Action */}
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  onDispatchRescue(emp.id);
                                  onSelectEmployee(emp); 
                              }}
                              className={`w-full text-[10px] font-mono font-black uppercase py-2.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs border border-b-4 ${
                                emp.rescueDispatched 
                                  ? 'bg-emerald-600 border-emerald-800 text-white hover:bg-emerald-700'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 hover:border-emerald-300'
                              } active:scale-[0.99]`}
                              title="Allocate corporate relief funds, goods, and lodging vouchers"
                            >
                              <span>🎁 {emp.rescueDispatched ? 'Corporate Aid Approved & Sent' : 'Allocate Company Relief (Funds/Relief Goods)'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        ) : activeTab === 'ALL_EMPLOYEES' ? (
          <motion.div
            key="all-employees-segment-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3 flex-1 min-h-[350px] overflow-hidden"
          >
            <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between border-b border-slate-100 pb-1 mb-1 font-black uppercase tracking-wider">
              <span>UNIFIED CEBU STAFF GEOGRAPHIC REGISTRY</span>
              <span>COUNT: {employees.length} HEADCOUNT</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[380px] pr-1">
              {filteredAll.map((emp) => {
                const isSelected = selectedEmployee?.id === emp.id;
                const isAffected = getDistance(emp) <= epicenter.radius;

                return (
                  <div
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between text-xs
                      ${isSelected
                        ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-300'
                        : isAffected
                          ? 'bg-amber-50/20 border-orange-200 hover:bg-amber-50/40'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-extrabold border shrink-0
                        ${emp.status === 'Green' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-slate-100 text-slate-650'}
                      `}>
                        {emp.avatar}
                      </div>
                      <div className="leading-tight">
                        <span className="font-bold text-slate-800 block text-xs">{emp.name}</span>
                        <span className="text-[10px] text-slate-400 block font-medium font-mono">{emp.role} • {emp.department}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isAffected ? (
                        <span className="bg-red-55 text-red-700 border border-red-200 text-[8px] font-mono font-black rounded px-1.5 uppercase tracking-wide">
                          {getDisasterEmoji(activeDisaster.icon)} {getDisasterCategory(activeDisaster.name).toUpperCase()} PLUME
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-250 text-[8px] font-mono font-black rounded px-1.5 uppercase tracking-wide">
                          Secure Outside
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400 font-mono tracking-tighter">
                        🏡 {emp.address ? emp.address.split(',')[0] || emp.address : 'Cebu PH'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="add-new-segment-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-3.5 flex-1 min-h-[350px] overflow-hidden bg-slate-50 p-4 rounded-xl border border-slate-205 text-xs font-mono"
          >
            <div className="flex items-center gap-1.5 font-bold uppercase border-b pb-2 mb-2 text-slate-800">
              <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Plot New Staff Residence Profile</span>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500 mb-1 font-medium font-sans">
              Enter any employee residential profile below to test dynamic distance mapping calculations inside the {getDisasterCategory(activeDisaster.name).toLowerCase()} buffer.
            </p>

            <form onSubmit={handleCreateEmployee} className="space-y-3.5 pb-2">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">STAFF FULL NAME:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maria Clara Lopez"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#002060] font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">ROLE TITLE:</label>
                  <input
                    type="text"
                    placeholder="Operations Fellow"
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#002060] font-sans"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">DEPARTMENT:</label>
                  <select
                    value={newEmpDept}
                    onChange={(e) => setNewEmpDept(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none cursor-pointer font-sans"
                  >
                    <option value="AI Operations">AI Operations</option>
                    <option value="GIS & Remote Sensing">GIS &amp; Remote Sensing</option>
                    <option value="QC & Audit">QC &amp; Audit</option>
                    <option value="Infrastructure Management">Infrastructure</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">MUNICIPAL RESIDENTIAL ADDRESS:</label>
                <input
                  type="text"
                  placeholder="e.g. Barangay Labangon, Cebu City"
                  value={newEmpAddress}
                  onChange={(e) => setNewEmpAddress(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#002060] font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 bg-white border p-3 rounded-lg shadow-inner">
                <div className="space-y-1">
                  <label className="text-[8.5px] font-extrabold text-slate-400 block uppercase font-mono">GPS Latitude (decimal)</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={newEmpGpsLat}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value || '0');
                      setNewEmpGpsLat(v);
                      const g = gpsToGrid(v, newEmpGpsLng);
                      setNewEmpX(g.x);
                      setNewEmpY(g.y);
                    }}
                    placeholder="e.g. 10.3157"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#002060] font-sans"
                  />
                  <div className="text-[10px] text-slate-400 font-mono">Grid Y: <strong className="text-slate-700">{newEmpY}%</strong></div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8.5px] font-extrabold text-slate-400 block uppercase font-mono">GPS Longitude (decimal)</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={newEmpGpsLng}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value || '0');
                      setNewEmpGpsLng(v);
                      const g = gpsToGrid(newEmpGpsLat, v);
                      setNewEmpX(g.x);
                      setNewEmpY(g.y);
                    }}
                    placeholder="e.g. 123.8854"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#002060] font-sans"
                  />
                  <div className="text-[10px] text-slate-400 font-mono">Grid X: <strong className="text-slate-700">{newEmpX}%</strong></div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#002060] hover:bg-[#001848] text-white font-mono font-bold py-2.5 rounded-lg text-xs transition duration-150 uppercase cursor-pointer shadow active:scale-95"
              >
                Save &amp; Vector Resident Coordinates
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
