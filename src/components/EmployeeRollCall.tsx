import React, { useState, useMemo, useEffect } from 'react';
import { Employee, SafetyStatus } from '../types';
import { 
  Search, Users, AlertCircle, CheckCircle, HelpCircle, 
  Send, Mail, AlertTriangle, Shield, Check, Volume2, Landmark, Phone, X
} from 'lucide-react';

interface EmployeeRollCallProps {
  employees: Employee[];
  epicenter: { lat: number; lng: number; radiusKm: number };
  onSelectEmployee: (emp: Employee | null) => void;
  selectedEmployee: Employee | null;
  onReportStatus: (employeeId: string, status: SafetyStatus, isUnresponsive?: boolean) => void;
  simulationActive?: boolean;
  onSendCheckIn?: (employeeId: string) => void;
  onDispatchRescue?: (employeeId: string) => void;
}

export default function EmployeeRollCall({
  employees,
  epicenter,
  onSelectEmployee,
  selectedEmployee,
  onReportStatus,
  simulationActive = false,
  onSendCheckIn,
  onDispatchRescue,
}: EmployeeRollCallProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tab state matching picture: All, In zone, Contacted, Safe, Need help, Unresponsive
  const [activeTab, setActiveTab] = useState<'All' | 'In zone' | 'Contacted' | 'Safe' | 'Need help' | 'Unresponsive'>('All');
  
  // Track manual contact dispatching state locally
  const [contactedIds, setContactedIds] = useState<Record<string, boolean>>({});

  // Reset contacted tracker when simulation turns off
  useEffect(() => {
    if (!simulationActive) {
      setContactedIds({});
      setActiveTab('All');
    } else {
      setActiveTab('In zone'); // Auto-focus on affected zone when crisis begins
    }
  }, [simulationActive]);

  // Update search when a new employee is selected from the map
  useEffect(() => {
    if (selectedEmployee) {
      setSearchQuery(selectedEmployee.name);
      setActiveTab('All');
    }
  }, [selectedEmployee]);

  // Compute GPS Haversine distance (km) from epicenter to employee home
  const getDistance = (emp: Employee) => {
    const R = 6371;
    const lat1 = epicenter.lat, lng1 = epicenter.lng;
    const lat2 = emp.gpsLat ?? emp.lat;
    const lng2 = emp.gpsLng ?? emp.lng;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Employees located in the zone
  const inZoneEmployees = useMemo(() => {
    return employees.filter((emp) => getDistance(emp) <= epicenter.radiusKm);
  }, [employees, epicenter]);

  // Counts for high fidelity metrics
  const uncontactedInZoneCount = useMemo(() => {
    return inZoneEmployees.filter(emp => emp.contacted !== true).length;
  }, [inZoneEmployees]);

  const contactedCount = useMemo(() => {
    return inZoneEmployees.filter(emp => emp.contacted === true && emp.status === 'Yellow' && emp.unresponsive !== true).length;
  }, [inZoneEmployees]);

  const safeCount = useMemo(() => {
    return inZoneEmployees.filter(emp => emp.status === 'Green').length;
  }, [inZoneEmployees]);

  const helpCount = useMemo(() => {
    return inZoneEmployees.filter(emp => emp.status === 'Red').length;
  }, [inZoneEmployees]);

  const unresponsiveCount = useMemo(() => {
    return inZoneEmployees.filter(emp => emp.unresponsive === true).length;
  }, [inZoneEmployees]);

  // Filter list matching active selection
  const filteredEmployees = useMemo(() => {
    let list = [...employees];

    if (simulationActive) {
      // Focus on active disaster target zone residents
      list = [...inZoneEmployees];

      if (activeTab === 'In zone') {
        // Show all in-zone employees
      } else if (activeTab === 'Contacted') {
        list = list.filter(emp => emp.contacted === true && emp.status === 'Yellow' && emp.unresponsive !== true);
      } else if (activeTab === 'Safe') {
        list = list.filter(emp => emp.status === 'Green');
      } else if (activeTab === 'Need help') {
        list = list.filter(emp => emp.status === 'Red');
      } else if (activeTab === 'Unresponsive') {
        list = list.filter(emp => emp.unresponsive === true);
      }
    } else {
      // Off-disaster nominal state list filtering
      if (activeTab === 'In zone') {
        list = inZoneEmployees;
      } else if (activeTab === 'Contacted') {
        list = list.filter(emp => emp.status === 'Yellow' && emp.unresponsive !== true);
      } else if (activeTab === 'Safe') {
        list = list.filter(emp => emp.status === 'Green');
      } else if (activeTab === 'Need help') {
        list = list.filter(emp => emp.status === 'Red');
      } else if (activeTab === 'Unresponsive') {
        list = list.filter(emp => emp.unresponsive === true);
      }
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (emp) =>
          emp.name.toLowerCase().includes(q) ||
          emp.role.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          (emp.address && emp.address.toLowerCase().includes(q))
      );
    }

    // Sort to prioritize "Need Help" (Red) status at the top, followed by unresponsive and yellows
    list.sort((a, b) => {
      const scoreA = a.status === 'Red' && !a.rescueDispatched ? 4 : a.status === 'Red' ? 3 : a.unresponsive ? 2 : a.status === 'Yellow' ? 1 : 0;
      const scoreB = b.status === 'Red' && !b.rescueDispatched ? 4 : b.status === 'Red' ? 3 : b.unresponsive ? 2 : b.status === 'Yellow' ? 1 : 0;
      return scoreB - scoreA;
    });

    return list;
  }, [employees, activeTab, inZoneEmployees, simulationActive, searchQuery]);

  // Trigger bulk alert beacon checks
  const handleBulkAlertBeacon = () => {
    inZoneEmployees.forEach(emp => {
      if (onSendCheckIn) {
        onSendCheckIn(emp.id);
      }
    });
  };

  return (
    <div className="bg-[#18181b] border border-zinc-805 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 font-sans text-zinc-200">
      
      {/* 1. HEADER SECTION (warning logo, title, capsule tag, timer) */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
          <div className="flex flex-wrap items-center gap-1.5 leading-snug">
            <span className="text-zinc-100 font-extrabold text-xs md:text-[13px] tracking-tight">
              Employee roll-call
            </span>
            <span className="text-zinc-500 text-xs">—</span>
            <span className="text-zinc-400 text-xs md:text-[13px] max-w-[200px] truncate">
              {simulationActive ? "Active Drill Scenario" : "Nominal Status Monitor"}
            </span>
            <span className="bg-[#ef4444]/15 border border-[#ef4444]/30 text-rose-400 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full select-none ml-1 animate-pulse">
              Active
            </span>
          </div>
        </div>
        <span className="text-xs text-zinc-500 font-mono font-medium select-none text-right shrink-0">
          05:50 PM
        </span>
      </div>

      {/* 2. ACCOUNTED FOR PROGRESS RULER */}
      <div className="space-y-1.5 bg-[#202023]/30 p-1.5 rounded-lg">
        <div className="flex items-center justify-between text-xs select-none">
          <span className="text-zinc-300 font-extrabold text-[12px]">Accounted for</span>
          <span className="text-zinc-100 font-mono font-black text-[12px]">
            {safeCount} / {simulationActive ? inZoneEmployees.length : employees.length} in zone
          </span>
        </div>
        <div className="w-full h-1.5 bg-[#2d2d30] rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#34d399] transition-all duration-550 rounded-full" 
            style={{ width: `${(simulationActive ? inZoneEmployees.length : employees.length) > 0 ? (safeCount / (simulationActive ? inZoneEmployees.length : employees.length)) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* 3. METRICS FOUR-COLUMN DIVIDER BLOCK LAYOUT */}
      <div className="grid grid-cols-4 border-y border-zinc-800 py-3.5 text-center bg-[#202023]/10 select-none">
        <div className="cursor-pointer hover:bg-zinc-800/10 py-1 rounded transition-all" onClick={() => setActiveTab('In zone')}>
          <span className="block text-xl md:text-2xl font-black font-sans text-rose-450 leading-none mb-1">
            {inZoneEmployees.length}
          </span>
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">In zone</span>
        </div>
        
        <div className="border-l border-zinc-800 cursor-pointer hover:bg-zinc-800/10 py-1 rounded transition-all" onClick={() => setActiveTab('Contacted')}>
          <span className="block text-xl md:text-2xl font-black font-sans text-amber-400 leading-none mb-1">
            {contactedCount}
          </span>
          <span className="text-[9px] text-[#9ca3af] font-bold uppercase tracking-widest">Contacted</span>
        </div>
        
        <div className="border-l border-zinc-800 cursor-pointer hover:bg-zinc-800/10 py-1 rounded transition-all" onClick={() => setActiveTab('Safe')}>
          <span className="block text-xl md:text-2xl font-black font-sans text-emerald-400 leading-none mb-1">
            {safeCount}
          </span>
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Safe</span>
        </div>
        
        <div className="border-l border-zinc-800 cursor-pointer hover:bg-zinc-800/10 py-1 rounded transition-all" onClick={() => setActiveTab('Need help')}>
          <span className="block text-xl md:text-2xl font-black font-sans text-red-500 leading-none mb-1">
            {helpCount}
          </span>
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Need help</span>
        </div>
      </div>

      {/* 4. WORKFLOW STEPS SUB-BANNER NAVIGATION */}
      <div className="flex flex-wrap items-center justify-center gap-1 xl:gap-2 text-[10px] sm:text-[11px] text-zinc-400 border-b border-zinc-800/40 pb-2.5">
        <button 
          onClick={() => setActiveTab('In zone')}
          className={`flex items-center gap-1.5 transition-colors select-none ${activeTab === 'In zone' ? 'text-zinc-100 font-black' : 'hover:text-zinc-200'}`}
        >
          <span className="w-4.5 h-4.5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-[10px] font-bold border border-emerald-500/30">✓</span>
          <span>Review affected</span>
        </button>
        
        <span className="text-zinc-700 font-mono font-bold select-none">›</span>
        
        <button 
          onClick={() => setActiveTab('Contacted')}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all select-none border border-transparent 
            ${activeTab === 'Contacted' ? 'bg-[#27272a] text-[#f4f4f5] border-[#3f3f46] font-bold shadow-sm' : 'hover:text-zinc-200'}`}
        >
          <span className="w-4 h-4 bg-zinc-800 rounded-full flex items-center justify-center text-[9px] text-zinc-300 font-bold">2</span>
          <span>Contact them</span>
        </button>
        
        <span className="text-zinc-700 font-mono font-bold select-none">›</span>
        
        <button 
          onClick={() => setActiveTab('Safe')}
          className={`flex items-center gap-1.5 transition-colors select-none ${activeTab === 'Safe' ? 'text-zinc-100 font-black' : 'hover:text-zinc-200'}`}
        >
          <span className="w-4 h-4 bg-zinc-800 rounded-full flex items-center justify-center text-[9px] text-zinc-400 font-bold">3</span>
          <span>Log response</span>
        </button>
        
        <span className="text-zinc-700 font-mono font-bold select-none">›</span>
        
        <button 
          onClick={() => setActiveTab('Need help')}
          className={`flex items-center gap-1.5 transition-colors select-none ${activeTab === 'Need help' ? 'text-zinc-100 font-black' : 'hover:text-zinc-200'}`}
        >
          <span className="w-4 h-4 bg-zinc-800 rounded-full flex items-center justify-center text-[9px] text-zinc-400 font-bold">4</span>
          <span>Escalate</span>
        </button>
      </div>

      {/* 5. TABS & SEARCH ROW */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-zinc-800 rounded-lg pl-8 p-1.5 pr-10 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-650"
            placeholder="Search name, role, department..."
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* PILLS ROW IN IMAGE: All, In zone, Contacted, Safe, Need help, Unresponsive */}
        <div className="flex flex-wrap gap-1 items-center pb-1">
          {[
            { key: 'All', label: 'All' },
            { key: 'In zone', label: 'In zone' },
            { key: 'Contacted', label: 'Contacted' },
            { key: 'Safe', label: 'Safe' },
            { key: 'Need help', label: 'Need help' },
            { key: 'Unresponsive', label: 'Unresponsive' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg select-none cursor-pointer border transition-colors
                ${activeTab === tab.key 
                  ? 'bg-[#27272a] text-[#f4f4f5] border-[#3f3f46]' 
                  : 'bg-[#18181b] text-zinc-400 border-zinc-900 hover:text-zinc-200 hover:bg-[#27272a]/40'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. EMPLOYEES ROSTER LIST */}
      <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
        {filteredEmployees.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-zinc-800 bg-[#202023]/10 rounded-xl text-zinc-500 text-xs font-semibold select-none flex flex-col items-center justify-center gap-2">
            <Users className="w-6 h-6 text-zinc-700" />
            <span>No employees found in this criteria.</span>
          </div>
        ) : (
          filteredEmployees.map((emp) => {
            const isSelected = selectedEmployee?.id === emp.id;
            const isInRiskZone = getDistance(emp) <= epicenter.radiusKm;

            // Determine badge next to name based on status
            let headerBadgeText = 'Uncontacted';
            let headerBadgeClass = 'bg-zinc-800 text-zinc-400 border border-zinc-700';

            if (emp.unresponsive === true) {
              headerBadgeText = 'Unresponsive';
              headerBadgeClass = 'bg-purple-950/40 text-purple-300 border border-purple-800/40';
            } else if (emp.status === 'Green') {
              headerBadgeText = 'Safe';
              headerBadgeClass = 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40';
            } else if (emp.status === 'Red') {
              headerBadgeText = 'Needs help';
              headerBadgeClass = 'bg-rose-950/30 text-rose-300 border border-rose-800/40 animate-pulse';
            } else if (emp.contacted === true && emp.status === 'Yellow') {
              headerBadgeText = 'Contacted — awaiting reply';
              headerBadgeClass = 'bg-amber-950/40 text-amber-305 border border-amber-800/40';
            }

            // Determine Initials Circle avatar background
            let avatarClass = 'bg-zinc-800 text-zinc-400 border border-zinc-700'; // Default gray for uncontacted
            if (emp.unresponsive === true) {
              avatarClass = 'bg-purple-600 text-purple-100';
            } else if (emp.status === 'Green') {
              avatarClass = 'bg-[#10b981] text-emerald-100'; // Green
            } else if (emp.status === 'Red') {
              avatarClass = 'bg-[#ef4444] text-rose-100'; // Red/Tan-orange
            } else if (emp.contacted === true && emp.status === 'Yellow') {
              avatarClass = 'bg-amber-500 text-amber-950'; // Amber/Yellow
            }

            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(isSelected ? null : emp)}
                className={`border border-[#27272a]/50 p-3 rounded-xl transition-all cursor-pointer relative flex flex-col gap-2.5
                  ${isSelected ? 'bg-[#202023] border-[#3f3f46] shadow-md' : 'bg-[#18181b]/40 hover:bg-[#202023]/60'}`}
              >
                {/* upper content block */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Circle Initials Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs select-none shrink-0 ${avatarClass}`}>
                      {emp.avatar || emp.name.split(' ').map(n => n[0]).join('')}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-zinc-100 text-sm hover:text-zinc-200">
                          {emp.name}
                        </span>
                        
                        {/* Dynamic status badge displayed immediately after name */}
                        <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 select-none ${headerBadgeClass}`}>
                          {headerBadgeText === 'Safe' ? '✓ ' : ''}{headerBadgeText}
                        </span>

                        {/* Interactive HR Contact Badges */}
                        <div className="flex items-center gap-1 shrink-0 ml-1 bg-zinc-900/50 p-0.5 rounded border border-zinc-800">
                          <a
                            href={`tel:+63917555${(emp.id || '').replace(/\D/g, '').padEnd(4, '0').slice(0, 4)}`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Call ${emp.name}: +63 917 ${(emp.id || '').replace(/\D/g, '').padEnd(4, '0').slice(0, 4)}`}
                            className="p-0.5 text-zinc-400 hover:text-emerald-450 hover:bg-zinc-800 rounded transition-colors"
                          >
                            <Phone className="w-3 h-3" />
                          </a>
                          <a
                            href={`mailto:${(emp.name || '').toLowerCase().replace(/\s+/g, '.')}@company.com`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Email ${emp.name}: ${(emp.name || '').toLowerCase().replace(/\s+/g, '.')}@company.com`}
                            className="p-0.5 text-zinc-400 hover:text-sky-450 hover:bg-zinc-800 rounded transition-colors"
                          >
                            <Mail className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <span className="text-[11px] text-zinc-400 block mt-1">
                        {emp.role} • {emp.department}
                      </span>
                      
                      {emp.address && (
                        <span className="text-[10px] text-zinc-500 block mt-0.5">
                          📍 Cebu City Residential Home
                        </span>
                      )}
                    </div>
                  </div>

                  {emp.contacted && emp.lastMessageSent ? (
                    <span className="text-[10px] text-zinc-400 font-mono font-bold select-none text-right shrink-0 mt-1" title={`Contacted at ${emp.lastMessageSent}`}>
                      ✉️ {emp.lastMessageSent}
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-600 font-mono select-none text-right shrink-0 mt-1">
                      —
                    </span>
                  )}
                </div>

                {/* Simulated Comms Interaction block in card bottom */}
                <div className="border-t border-zinc-800/50 pt-2.5 flex flex-wrap items-center justify-between gap-2 pl-12">
                  
                  {/* UNCONTACTED CASE */}
                  {emp.contacted !== true && (
                    <div className="w-full flex items-center justify-between gap-2">
                      <span className="text-[10px] text-zinc-500 font-medium">Pending manual reachout</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSendCheckIn) {
                            onSendCheckIn(emp.id);
                          }
                        }}
                        className="bg-sky-600 hover:bg-sky-500 text-white rounded px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                      >
                        <Send className="w-3 h-3 text-white" />
                        Manual SMS
                      </button>
                    </div>
                  )}

                  {/* UNRESPONSIVE CASE */}
                  {emp.unresponsive === true && (
                    <div className="w-full flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1 select-none">
                        <AlertCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>No reply • Telemetry offline</span>
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSendCheckIn) {
                              onSendCheckIn(emp.id);
                            }
                          }}
                          className="border border-zinc-700 bg-zinc-95/40 hover:bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors"
                        >
                          Retry
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReportStatus(emp.id, 'Red');
                            if (onDispatchRescue) {
                              onDispatchRescue(emp.id);
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors uppercase tracking-widest text-[9px]"
                        >
                          Send Corporate Aid
                        </button>
                      </div>
                    </div>
                  )}

                  {/* GREEN SAFE CONFIRMED TEXT STATE */}
                  {emp.contacted === true && emp.status === 'Green' && emp.unresponsive !== true && (
                    <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 select-none">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Confirmed safe</span>
                    </div>
                  )}

                  {/* YELLOW PENDING REPLY STATE -> RECORD USER ACTION DECISIONS */}
                  {emp.contacted === true && emp.status === 'Yellow' && emp.unresponsive !== true && (
                    <div className="flex flex-wrap items-center gap-1 w-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReportStatus(emp.id, 'Green');
                        }}
                        className="flex-1 min-w-[55px] border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-200 hover:text-white px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        Safe
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReportStatus(emp.id, 'Red');
                        }}
                        className="flex-1 min-w-[70px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-transparent shadow-sm"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-white shrink-0" />
                        Needs help
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Simulates "No reply / Unresponsive" behavior
                          onReportStatus(emp.id, 'Yellow', true);
                        }}
                        className="flex-1 min-w-[60px] border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-200 hover:text-white px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        No reply
                      </button>
                    </div>
                  )}

                  {/* RED HELP ACTIVE STATE -> DISPATCH RESCUE BUTTON */}
                  {emp.contacted === true && emp.status === 'Red' && emp.unresponsive !== true && (
                    <div className="w-full">
                      {emp.rescueDispatched ? (
                        <div className="text-[11px] text-emerald-400 font-black flex items-center gap-1.5 select-none bg-emerald-950/20 border border-emerald-900/40 p-1.5 rounded-lg w-full">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Aid Package (Funds + Care Kit) Sent</span>
                        </div>
                      ) : isSelected ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReportStatus(emp.id, 'Red');
                            if (onDispatchRescue) {
                              onDispatchRescue(emp.id);
                            }
                          }}
                          className="w-full border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-900/20 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer uppercase shadow"
                        >
                          <Send className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          Allocate Corporate Aid
                        </button>
                      ) : (
                        <div className="text-[11px] text-rose-400 font-bold flex items-center gap-1.5 select-none bg-rose-950/20 border border-rose-900/20 px-2 py-1.5 rounded-lg w-full">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                          <span>Needs Help requested (Click to allocate corporate aid)</span>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            );
          })
        )}
      </div>

      {inZoneEmployees.length > 0 && activeTab === 'All' && (
        <div className="border-t border-zinc-800/40 pt-3.5 pb-1 flex items-start gap-2.5 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-[10px] text-amber-450 font-black uppercase tracking-wider">Manual Contact Mandate</span>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
              To conserve local telecom power reserves, automated broadcasting is deactivated. Manually check in the <strong>{inZoneEmployees.length} personnel in zone</strong> individually.
            </p>
          </div>
        </div>
      )}

      {/* 7. FOOTER BRANDING LINE */}
      <div className="border-t border-zinc-800/40 pt-2 text-[9px] text-zinc-600 font-mono font-bold flex items-center justify-center gap-1 select-none">
        <span>🌋 Sentinel Guard EMNS • Core Comms Module</span>
      </div>
    </div>
  );
}
