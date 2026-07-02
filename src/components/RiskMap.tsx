import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { Employee, HazardType, HazardZone } from '../types';
import {
  HAZARD_TYPE_CONFIG,
  HAZARD_ZONES,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_OPACITY,
  countEmployeesInZone,
  getZonesAtPoint,
} from '../data_hazard_zones';
import { PHILIPPINE_REGIONS } from '../data_islands';
import {
  Layers, MapPin, Search, Info, Users, ChevronRight, AlertTriangle,
  Droplets, Mountain, Wind, Zap, Flame, Waves, Eye, EyeOff,
} from 'lucide-react';

const HAZARD_ICONS: Record<HazardType, React.ReactNode> = {
  flood: <Droplets className="w-4 h-4" />,
  landslide: <Mountain className="w-4 h-4" />,
  storm_surge: <Wind className="w-4 h-4" />,
  earthquake: <Zap className="w-4 h-4" />,
  volcanic: <Flame className="w-4 h-4" />,
  tsunami: <Waves className="w-4 h-4" />,
};

const ALL_HAZARD_TYPES: HazardType[] = [
  'flood', 'landslide', 'storm_surge', 'earthquake', 'volcanic', 'tsunami',
];

interface RiskMapProps {
  employees: Employee[];
}

export default function RiskMap({ employees }: RiskMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoneLayersRef = useRef<L.LayerGroup | null>(null);
  const employeeLayerRef = useRef<L.LayerGroup | null>(null);

  const [activeTypes, setActiveTypes] = useState<Record<HazardType, boolean>>({
    flood: true,
    landslide: true,
    storm_surge: true,
    earthquake: true,
    volcanic: true,
    tsunami: true,
  });
  const [showEmployees, setShowEmployees] = useState(true);
  const [selectedZone, setSelectedZone] = useState<HazardZone | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const visibleZones = useMemo(() => {
    return HAZARD_ZONES.filter((z) => {
      if (!activeTypes[z.type]) return false;
      if (selectedRegion && z.region !== selectedRegion) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          z.name.toLowerCase().includes(q) ||
          z.province?.toLowerCase().includes(q) ||
          z.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeTypes, selectedRegion, searchQuery]);

  const hazardStats = useMemo(() => {
    return ALL_HAZARD_TYPES.map((type) => {
      const zones = HAZARD_ZONES.filter((z) => z.type === type);
      const empCount = zones.reduce((sum, z) => sum + countEmployeesInZone(z, employees), 0);
      return { type, zoneCount: zones.length, empCount };
    });
  }, [employees]);

  const toggleType = useCallback((type: HazardType) => {
    setActiveTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const getZoneStyle = (zone: HazardZone) => {
    const config = HAZARD_TYPE_CONFIG[zone.type];
    const opacity = RISK_LEVEL_OPACITY[zone.riskLevel];
    const rgb = hexToRgb(config.color);
    return {
      color: config.color,
      weight: zone.riskLevel === 'high' ? 2.5 : 1.5,
      opacity: 0.85,
      fillColor: config.color,
      fillOpacity: opacity,
      dashArray: zone.riskLevel === 'low' ? '6 4' : undefined,
    };
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.5, 122.0],
      zoom: 6,
      zoomControl: false,
      preferCanvas: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    zoneLayersRef.current = L.layerGroup().addTo(map);
    employeeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 300);

    return () => {
      map.remove();
      mapRef.current = null;
      zoneLayersRef.current = null;
      employeeLayerRef.current = null;
    };
  }, []);

  // Draw hazard zone polygons
  useEffect(() => {
    const group = zoneLayersRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    group.clearLayers();

    visibleZones.forEach((zone) => {
      const config = HAZARD_TYPE_CONFIG[zone.type];
      const style = getZoneStyle(zone);

      const polygon = L.polygon(
        zone.polygon.map(([lat, lng]) => [lat, lng] as L.LatLngExpression),
        style
      );

      const empInZone = countEmployeesInZone(zone, employees);

      polygon.bindPopup(`
        <div style="min-width:220px;font-family:system-ui,sans-serif">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="font-size:18px">${config.icon}</span>
            <strong style="color:${config.color};font-size:13px">${zone.name}</strong>
          </div>
          <div style="font-size:11px;color:#64748b;margin-bottom:4px">${config.label} · ${RISK_LEVEL_LABELS[zone.riskLevel]}</div>
          ${zone.province ? `<div style="font-size:11px;color:#475569;margin-bottom:6px">📍 ${zone.province}</div>` : ''}
          <p style="font-size:11px;color:#334155;margin:0 0 8px;line-height:1.4">${zone.description}</p>
          ${empInZone > 0 ? `<div style="font-size:11px;background:#f1f5f9;padding:4px 8px;border-radius:6px;color:#475569">👥 ${empInZone} employee${empInZone !== 1 ? 's' : ''} in this zone</div>` : ''}
        </div>
      `);

      polygon.on('click', () => setSelectedZone(zone));
      polygon.on('mouseover', () => polygon.setStyle({ weight: 3.5, fillOpacity: Math.min(0.7, (RISK_LEVEL_OPACITY[zone.riskLevel] ?? 0.3) + 0.15) }));
      polygon.on('mouseout', () => polygon.setStyle(getZoneStyle(zone)));

      polygon.addTo(group);
    });
  }, [visibleZones, employees]);

  // Employee markers overlay
  useEffect(() => {
    const group = employeeLayerRef.current;
    if (!group) return;

    group.clearLayers();
    if (!showEmployees) return;

    employees.forEach((emp) => {
      if (emp.gpsLat == null || emp.gpsLng == null) return;

      const zonesHere = getZonesAtPoint(emp.gpsLat, emp.gpsLng);
      const inVisibleZone = zonesHere.some((z) => activeTypes[z.type] && visibleZones.some((v) => v.id === z.id));
      if (!inVisibleZone && visibleZones.length > 0) return;

      const highestRisk = zonesHere.find((z) => z.riskLevel === 'high') ?? zonesHere[0];
      const color = highestRisk ? HAZARD_TYPE_CONFIG[highestRisk.type].color : '#64748b';

      const marker = L.circleMarker([emp.gpsLat, emp.gpsLng], {
        radius: 4,
        color: '#fff',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(emp.name, { direction: 'top', offset: [0, -6] });
      marker.addTo(group);
    });
  }, [employees, showEmployees, visibleZones, activeTypes]);

  // Fly to selected zone
  useEffect(() => {
    if (!mapRef.current || !selectedZone) return;
    const bounds = L.latLngBounds(selectedZone.polygon.map(([lat, lng]) => [lat, lng]));
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 11, animate: true });
  }, [selectedZone]);

  // Fly to region
  useEffect(() => {
    if (!mapRef.current || !selectedRegion) return;
    const region = PHILIPPINE_REGIONS.find((r) => r.code === selectedRegion);
    if (!region) return;
    const b = region.bounds;
    mapRef.current.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [30, 30], animate: true });
  }, [selectedRegion]);

  return (
    <div className="flex flex-1 min-h-0 bg-[#f0f4f8]">
      {/* Left panel — hazard layer controls (NOAH-style) */}
      <aside className="w-[300px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-[#002060] px-4 py-4 border-b border-[#001848]">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-blue-300" />
            <h2 className="text-white font-black text-sm tracking-wide">Know Your Hazards</h2>
          </div>
          <p className="text-blue-300/70 text-[10px] leading-relaxed">
            Toggle hazard layers to identify risk-prone areas across the Philippines.
          </p>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search hazard zones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
        </div>

        {/* Region filter */}
        <div className="px-3 pb-2">
          <select
            value={selectedRegion ?? ''}
            onChange={(e) => setSelectedRegion(e.target.value || null)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">All Regions</option>
            {PHILIPPINE_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Hazard layer toggles */}
        <div className="px-3 flex-1 overflow-y-auto">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2 px-1">Hazard Layers</p>
          <div className="flex flex-col gap-1.5">
            {ALL_HAZARD_TYPES.map((type) => {
              const config = HAZARD_TYPE_CONFIG[type];
              const stats = hazardStats.find((s) => s.type === type);
              const isActive = activeTypes[type];

              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all border ${
                    isActive
                      ? 'bg-white border-slate-200 shadow-sm'
                      : 'bg-slate-50 border-transparent opacity-60'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: isActive ? config.color + '22' : '#f1f5f9', color: config.color }}
                  >
                    {HAZARD_ICONS[type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-800 leading-tight">{config.label}</span>
                      {isActive ? <Eye className="w-3 h-3 text-emerald-500 shrink-0" /> : <EyeOff className="w-3 h-3 text-slate-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="inline-block w-3 h-3 rounded-sm border border-white shadow-sm shrink-0"
                        style={{ backgroundColor: config.color }}
                      />
                      <span className="text-[10px] text-slate-500">{stats?.zoneCount} zones · {stats?.empCount} FTE</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Employee overlay toggle */}
          <div className="mt-4 mb-2">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2 px-1">Overlay</p>
            <button
              onClick={() => setShowEmployees((v) => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                showEmployees ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <Users className={`w-4 h-4 ${showEmployees ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="text-[11px] font-bold text-slate-700">Show Employees in Zones</span>
            </button>
          </div>

          {/* Color legend */}
          <div className="mt-2 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Color Legend</p>
            <div className="flex flex-col gap-1.5">
              {ALL_HAZARD_TYPES.filter((t) => activeTypes[t]).map((type) => {
                const config = HAZARD_TYPE_CONFIG[type];
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="w-4 h-3 rounded-sm shrink-0 border border-white shadow-sm" style={{ backgroundColor: config.color }} />
                    <span className="text-[10px] text-slate-600 font-medium">{config.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 flex flex-col gap-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Risk Intensity</p>
              {(['high', 'moderate', 'low'] as const).map((level) => (
                <div key={level} className="flex items-center gap-2">
                  <span
                    className="w-4 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: `rgba(37,99,235,${RISK_LEVEL_OPACITY[level]})`, border: level === 'low' ? '1px dashed #94a3b8' : 'none' }}
                  />
                  <span className="text-[10px] text-slate-500">{RISK_LEVEL_LABELS[level]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer attribution */}
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
          <p className="text-[9px] text-slate-400 leading-relaxed flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            Simplified hazard zones for workforce risk awareness. For official hazard maps visit{' '}
            <a href="https://noah.up.edu.ph/know-your-hazards" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
              NOAH
            </a>.
          </p>
        </div>
      </aside>

      {/* Map + detail panel */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Map toolbar */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
          <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-3 py-2 shadow-md flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#002060]" />
            <span className="text-xs font-bold text-slate-700">Risk Classification Map</span>
            <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
              {visibleZones.length} zones active
            </span>
          </div>
        </div>

        {/* Leaflet map */}
        <div ref={mapContainerRef} className="flex-1 min-h-[500px] z-0" />

        {/* Selected zone detail card */}
        {selectedZone && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[360px] z-[1000]">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: HAZARD_TYPE_CONFIG[selectedZone.type].color + '18' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{HAZARD_TYPE_CONFIG[selectedZone.type].icon}</span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">{selectedZone.name}</h3>
                    <p className="text-[10px] font-bold" style={{ color: HAZARD_TYPE_CONFIG[selectedZone.type].color }}>
                      {HAZARD_TYPE_CONFIG[selectedZone.type].label} · {RISK_LEVEL_LABELS[selectedZone.riskLevel]}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
                >
                  ×
                </button>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                {selectedZone.province && (
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {selectedZone.province}
                    {selectedZone.region && ` · Region ${selectedZone.region}`}
                  </p>
                )}
                <p className="text-xs text-slate-600 leading-relaxed">{selectedZone.description}</p>
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-[11px] font-bold text-amber-700">{RISK_LEVEL_LABELS[selectedZone.riskLevel]}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] font-bold text-blue-700">
                      {countEmployeesInZone(selectedZone, employees)} employees
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Zone list (bottom strip on mobile, hidden when detail open) */}
        {!selectedZone && visibleZones.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 z-[999] hidden md:block">
            <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg px-3 py-2 flex gap-2 overflow-x-auto">
              {visibleZones.slice(0, 8).map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => setSelectedZone(zone)}
                  className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: HAZARD_TYPE_CONFIG[zone.type].color }}
                  />
                  <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{zone.name}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
              ))}
              {visibleZones.length > 8 && (
                <span className="text-[10px] text-slate-400 self-center shrink-0 px-1">+{visibleZones.length - 8} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
