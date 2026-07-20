import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { Employee, HazardType, HazardZone, RegionHazardProfile } from '../types';
import {
  HAZARD_TYPE_CONFIG,
  HAZARD_ZONES,
  countEmployeesInZone,
} from '../data_hazard_zones';
import {
  REGION_HAZARD_BY_CODE,
  resolveRegionCodeFromFeature,
} from '../data_region_hazards';
import { PHILIPPINE_REGIONS } from '../data_islands';
import {
  Layers, MapPin, Search, Info, Users, ChevronRight, AlertTriangle,
  Droplets, Mountain, Wind, Zap, Flame, Waves,
} from 'lucide-react';

/**
 * NOAH Know-Your-Hazards intensity palette
 * https://noah.up.edu.ph/know-your-hazards
 * Low = yellow, Medium = orange, High = red (same scale for every hazard type)
 */
const NOAH_INTENSITY = {
  low: { color: '#facc15', label: 'Low', fillOpacity: 0.28 },
  moderate: { color: '#f97316', label: 'Medium', fillOpacity: 0.38 },
  high: { color: '#ef4444', label: 'High', fillOpacity: 0.48 },
} as const;

const HAZARD_ICONS: Record<HazardType, React.ReactNode> = {
  flood: <Droplets className="w-4 h-4" />,
  landslide: <Mountain className="w-4 h-4" />,
  storm_surge: <Wind className="w-4 h-4" />,
  earthquake: <Zap className="w-4 h-4" />,
  volcanic: <AlertTriangle className="w-4 h-4" />,
  tsunami: <Waves className="w-4 h-4" />,
  fire: <Flame className="w-4 h-4" />,
};

/** Primary NOAH tabs first, then additional workforce hazards */
const HAZARD_TABS: HazardType[] = [
  'flood', 'landslide', 'storm_surge', 'earthquake', 'volcanic', 'tsunami', 'fire',
];

interface RiskMapProps {
  employees: Employee[];
}

function polygonCentroid(polygon: [number, number][]): { lat: number; lng: number } {
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const lng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  return { lat, lng };
}

/** Rough radius (meters) from polygon extent — used for nested intensity rings */
function polygonRadiusMeters(polygon: [number, number][]): number {
  const c = polygonCentroid(polygon);
  let maxM = 800;
  polygon.forEach(([lat, lng]) => {
    const dLat = (lat - c.lat) * 111_320;
    const dLng = (lng - c.lng) * 111_320 * Math.cos((c.lat * Math.PI) / 180);
    maxM = Math.max(maxM, Math.sqrt(dLat * dLat + dLng * dLng));
  });
  return maxM;
}

export default function RiskMap({ employees }: RiskMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hazardLayerRef = useRef<L.LayerGroup | null>(null);
  const regionTintRef = useRef<L.GeoJSON | null>(null);
  const employeeLayerRef = useRef<L.LayerGroup | null>(null);
  const geoJsonRef = useRef<GeoJSON.FeatureCollection | null>(null);

  const [geoReady, setGeoReady] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [activeHazard, setActiveHazard] = useState<HazardType>('flood');
  const [showEmployees, setShowEmployees] = useState(false);
  const [selectedZone, setSelectedZone] = useState<HazardZone | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RegionHazardProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const zonesForHazard = useMemo(() => {
    return HAZARD_ZONES.filter((z) => {
      if (z.type !== activeHazard) return false;
      if (selectedRegion && z.region !== selectedRegion) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        z.name.toLowerCase().includes(q) ||
        z.province?.toLowerCase().includes(q) ||
        z.description.toLowerCase().includes(q)
      );
    });
  }, [activeHazard, selectedRegion, searchQuery]);

  const hazardConfig = HAZARD_TYPE_CONFIG[activeHazard];

  // Init map
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
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    map.createPane('noah-region-tint');
    const tintPane = map.getPane('noah-region-tint');
    if (tintPane) {
      tintPane.style.zIndex = '410';
      tintPane.style.pointerEvents = 'none';
    }

    map.createPane('noah-hazard');
    const hazardPane = map.getPane('noah-hazard');
    if (hazardPane) {
      hazardPane.style.zIndex = '450';
    }

    hazardLayerRef.current = L.layerGroup().addTo(map);
    employeeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    let cancelled = false;
    fetch('/ph_regions.geojson')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load map boundaries (${res.status})`);
        return res.json();
      })
      .then((data: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        geoJsonRef.current = data;
        setGeoReady(true);
        setGeoError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setGeoError(err.message || 'Could not load Philippines region boundaries.');
      });

    setTimeout(() => map.invalidateSize(), 300);

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      hazardLayerRef.current = null;
      regionTintRef.current = null;
      employeeLayerRef.current = null;
      geoJsonRef.current = null;
    };
  }, []);

  // Soft region tint for areas that carry the active hazard (NOAH-style ambient coverage)
  useEffect(() => {
    const map = mapRef.current;
    const data = geoJsonRef.current;
    if (!map || !data || !geoReady) return;

    if (regionTintRef.current) {
      map.removeLayer(regionTintRef.current);
      regionTintRef.current = null;
    }

    const features = data.features.filter((feature) => {
      const code = resolveRegionCodeFromFeature(feature.properties as Record<string, unknown>);
      if (!code) return false;
      if (selectedRegion && code !== selectedRegion) return false;
      const profile = REGION_HAZARD_BY_CODE[code];
      return profile?.hazards.some((h) => h.type === activeHazard) ?? false;
    });

    if (features.length === 0) return;

    const layer = L.geoJSON(
      { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
      {
        pane: 'noah-region-tint',
        style: (feature) => {
          const code = feature
            ? resolveRegionCodeFromFeature(feature.properties as Record<string, unknown>)
            : null;
          const entry = code
            ? REGION_HAZARD_BY_CODE[code]?.hazards.find((h) => h.type === activeHazard)
            : undefined;
          const level = entry?.riskLevel ?? 'low';
          const tint = NOAH_INTENSITY[level];
          return {
            stroke: false,
            weight: 0,
            fillColor: tint.color,
            fillOpacity: 0.12,
          };
        },
        interactive: false,
      }
    );
    layer.addTo(map);
    regionTintRef.current = layer;
  }, [geoReady, activeHazard, selectedRegion]);

  /**
   * NOAH nested intensity rings:
   * High → yellow fringe + orange mid + red core
   * Medium → yellow fringe + orange core
   * Low → yellow only
   * No borders — soft fill rings so it reads as color-inside-color, not polygons.
   */
  useEffect(() => {
    const group = hazardLayerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    const pane = 'noah-hazard';

    zonesForHazard.forEach((zone) => {
      const center = polygonCentroid(zone.polygon);
      const baseR = polygonRadiusMeters(zone.polygon);
      const isSelected = selectedZone?.id === zone.id;

      const rings: { level: keyof typeof NOAH_INTENSITY; radius: number }[] = [];
      if (zone.riskLevel === 'high') {
        rings.push(
          { level: 'low', radius: baseR * 2.4 },
          { level: 'moderate', radius: baseR * 1.5 },
          { level: 'high', radius: baseR * 0.85 }
        );
      } else if (zone.riskLevel === 'moderate') {
        rings.push(
          { level: 'low', radius: baseR * 2.0 },
          { level: 'moderate', radius: baseR * 1.0 }
        );
      } else {
        rings.push({ level: 'low', radius: baseR * 1.35 });
      }

      // Draw outer → inner so red sits inside orange inside yellow
      rings.forEach(({ level, radius }) => {
        const style = NOAH_INTENSITY[level];
        const circle = L.circle([center.lat, center.lng], {
          pane,
          radius,
          stroke: false,
          weight: 0,
          fillColor: style.color,
          fillOpacity: isSelected ? style.fillOpacity + 0.15 : style.fillOpacity,
          interactive: level === rings[rings.length - 1].level,
        });

        if (level === rings[rings.length - 1].level) {
          const empInZone = countEmployeesInZone(zone, employees);
          circle.bindPopup(`
            <div style="min-width:220px;font-family:system-ui,sans-serif">
              <strong style="font-size:13px;color:#0f172a">${zone.name}</strong>
              <div style="font-size:11px;margin:4px 0;display:flex;align-items:center;gap:6px">
                <span style="width:12px;height:12px;border-radius:2px;background:${NOAH_INTENSITY[zone.riskLevel].color};display:inline-block"></span>
                <span style="color:#475569">${hazardConfig.label} · ${NOAH_INTENSITY[zone.riskLevel].label} Hazard</span>
              </div>
              ${zone.province ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px">📍 ${zone.province}${zone.region ? ` · Region ${zone.region}` : ''}</div>` : ''}
              <p style="font-size:11px;color:#334155;margin:0 0 8px;line-height:1.4">${zone.description}</p>
              ${empInZone > 0 ? `<div style="font-size:11px;background:#f1f5f9;padding:4px 8px;border-radius:6px;color:#475569">👥 ${empInZone} employee${empInZone !== 1 ? 's' : ''} nearby</div>` : ''}
            </div>
          `);
          circle.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            setSelectedProfile(null);
            setSelectedZone(zone);
          });
        }

        circle.addTo(group);
      });
    });
  }, [zonesForHazard, employees, selectedZone, hazardConfig.label]);

  useEffect(() => {
    const group = employeeLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showEmployees) return;

    employees.forEach((emp) => {
      if (emp.gpsLat == null || emp.gpsLng == null) return;
      const inZone = zonesForHazard.some((z) => countEmployeesInZone(z, [emp]) > 0);
      const inRegion =
        emp.region &&
        REGION_HAZARD_BY_CODE[emp.region]?.hazards.some((h) => h.type === activeHazard);
      if (!inZone && !inRegion) return;
      if (selectedRegion && emp.region !== selectedRegion) return;

      L.circleMarker([emp.gpsLat, emp.gpsLng], {
        radius: 4,
        color: '#fff',
        weight: 1,
        fillColor: '#002060',
        fillOpacity: 0.9,
      })
        .bindTooltip(emp.name, { direction: 'top', offset: [0, -6] })
        .addTo(group);
    });
  }, [employees, showEmployees, zonesForHazard, activeHazard, selectedRegion]);

  useEffect(() => {
    if (!mapRef.current || !selectedZone) return;
    const c = polygonCentroid(selectedZone.polygon);
    const r = polygonRadiusMeters(selectedZone.polygon);
    mapRef.current.fitBounds(
      L.latLng(c.lat, c.lng).toBounds(r * 3),
      { padding: [60, 60], maxZoom: 12, animate: true }
    );
  }, [selectedZone]);

  useEffect(() => {
    if (!mapRef.current || !selectedRegion) return;
    const region = PHILIPPINE_REGIONS.find((r) => r.code === selectedRegion);
    if (!region) return;
    const b = region.bounds;
    mapRef.current.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [30, 30], animate: true });
    const profile = REGION_HAZARD_BY_CODE[selectedRegion];
    if (profile) {
      setSelectedZone(null);
      setSelectedProfile(profile);
    }
  }, [selectedRegion]);

  const onSelectHazardTab = useCallback((type: HazardType) => {
    setActiveHazard(type);
    setSelectedZone(null);
  }, []);

  return (
    <div className="flex flex-1 min-h-0 bg-[#f0f4f8]">
      {/* Left: NOAH-style hazard tabs + info */}
      <aside className="w-[320px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden shadow-sm">
        <div className="bg-[#002060] px-4 py-4 border-b border-[#001848]">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-blue-300" />
            <h2 className="text-white font-black text-sm tracking-wide">Know Your Hazards</h2>
          </div>
          <p className="text-blue-300/70 text-[10px] leading-relaxed">
            Styled after UP Project NOAH — pick one hazard, then read Low / Medium / High intensity on the map.
          </p>
        </div>

        {/* Hazard type tabs */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-100">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2 px-1">Hazard</p>
          <div className="grid grid-cols-2 gap-1.5">
            {HAZARD_TABS.map((type) => {
              const config = HAZARD_TYPE_CONFIG[type];
              const active = activeHazard === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelectHazardTab(type)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left border transition-all ${
                    active
                      ? 'bg-[#002060] text-white border-[#001848] shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
                  }`}
                >
                  <span className={active ? 'text-blue-200' : 'text-slate-500'}>{HAZARD_ICONS[type]}</span>
                  <span className="text-[10px] font-bold leading-tight">{config.label.replace('-Prone Areas', '').replace(' Zones', '').replace(' Areas', '')}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-3 pt-3 pb-2">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search location / zone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
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

        <div className="px-3 flex-1 overflow-y-auto">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 mb-3">
            <h3 className="text-xs font-black text-[#002060] mb-1">
              Know Your Hazard: {hazardConfig.label.replace('-Prone Areas', '').replace(' Zones', '')}
            </h3>
            <p className="text-[11px] text-slate-600 leading-relaxed">{hazardConfig.description}</p>
          </div>

          {/* NOAH intensity legend */}
          <div className="rounded-2xl border border-slate-200 p-3 mb-3">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Hazard Level</p>
            <div className="flex items-center gap-3">
              {(['low', 'moderate', 'high'] as const).map((level) => (
                <div key={level} className="flex items-center gap-1.5">
                  <span
                    className="w-4 h-4 rounded-sm border border-black/5 shadow-sm"
                    style={{ backgroundColor: NOAH_INTENSITY[level].color }}
                  />
                  <span className="text-[11px] font-bold text-slate-700">{NOAH_INTENSITY[level].label}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Yellow surrounds orange surrounds red — higher intensity nests inside lower, like Project NOAH.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowEmployees((v) => !v)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all mb-3 ${
              showEmployees ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Users className={`w-4 h-4 ${showEmployees ? 'text-blue-600' : 'text-slate-400'}`} />
            <span className="text-[11px] font-bold text-slate-700">Show Employees</span>
          </button>

          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2 px-1">
            Mapped areas ({zonesForHazard.length})
          </p>
          <div className="flex flex-col gap-1.5 pb-4">
            {zonesForHazard.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => {
                  setSelectedProfile(null);
                  setSelectedZone(zone);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                  selectedZone?.id === zone.id
                    ? 'bg-white border-slate-300 shadow-sm'
                    : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800 truncate">{zone.name}</span>
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: NOAH_INTENSITY[zone.riskLevel].color + '33',
                      color: '#7c2d12',
                    }}
                  >
                    {NOAH_INTENSITY[zone.riskLevel].label}
                  </span>
                </div>
                {zone.province && (
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{zone.province}</p>
                )}
              </button>
            ))}
            {zonesForHazard.length === 0 && (
              <p className="text-[11px] text-slate-500 px-1 py-4 text-center">
                No mapped areas for this hazard in the current filter.
              </p>
            )}
          </div>
        </div>

        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
          <p className="text-[9px] text-slate-400 leading-relaxed flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            Visual style inspired by{' '}
            <a
              href="https://noah.up.edu.ph/know-your-hazards"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              UP Project NOAH
            </a>
            . Simplified for workforce awareness — not official hazard maps.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
          <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-3 py-2 shadow-md flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#002060]" />
            <span className="text-xs font-bold text-slate-700">
              {hazardConfig.label.replace('-Prone Areas', '').replace(' Zones', '')} Hazard Map
            </span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
              {zonesForHazard.length} areas
            </span>
          </div>
        </div>

        {/* Floating NOAH legend on map */}
        <div className="absolute bottom-4 right-4 z-[1000] hidden md:block">
          <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-3 py-2.5 shadow-lg">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Hazard Level</p>
            <div className="flex flex-col gap-1.5">
              {(['low', 'moderate', 'high'] as const).map((level) => (
                <div key={level} className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: NOAH_INTENSITY[level].color }} />
                  <span className="text-[11px] font-bold text-slate-700">{NOAH_INTENSITY[level].label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!geoReady && !geoError && (
          <div className="absolute inset-0 z-[900] flex items-center justify-center bg-slate-100/70 pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-600 shadow-sm">
              Loading hazard map…
            </div>
          </div>
        )}

        {geoError && (
          <div className="absolute top-14 left-3 right-3 z-[1000]">
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl px-3 py-2">
              {geoError}
            </div>
          </div>
        )}

        <div ref={mapContainerRef} className="flex-1 min-h-[500px] z-0" />

        {selectedZone && (
          <div className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:w-[360px] z-[1000]">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: NOAH_INTENSITY[selectedZone.riskLevel].color + '33' }}
              >
                <div>
                  <h3 className="text-sm font-black text-slate-800">{selectedZone.name}</h3>
                  <p className="text-[10px] font-bold text-slate-700">
                    {hazardConfig.label} · {NOAH_INTENSITY[selectedZone.riskLevel].label} Hazard
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedZone(null)}
                  className="text-slate-500 hover:text-slate-800 text-lg leading-none px-1"
                >
                  ×
                </button>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                {(selectedZone.province || selectedZone.region) && (
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {selectedZone.province}
                    {selectedZone.region && ` · Region ${selectedZone.region}`}
                  </p>
                )}
                <p className="text-xs text-slate-600 leading-relaxed">{selectedZone.description}</p>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: NOAH_INTENSITY[selectedZone.riskLevel].color + '44' }}
                  >
                    {NOAH_INTENSITY[selectedZone.riskLevel].label}
                  </span>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {countEmployeesInZone(selectedZone, employees)} employees
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedProfile && !selectedZone && (
          <div className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:w-[360px] z-[1000]">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between bg-[#002060]/10">
                <div>
                  <h3 className="text-sm font-black text-slate-800">{selectedProfile.regionName}</h3>
                  <p className="text-[10px] font-bold text-[#002060]">Region {selectedProfile.regionCode}</p>
                </div>
                <button type="button" onClick={() => setSelectedProfile(null)} className="text-slate-400 text-lg px-1">×</button>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                {selectedProfile.hazards.map((h) => (
                  <button
                    key={h.type}
                    type="button"
                    onClick={() => onSelectHazardTab(h.type)}
                    className="text-left rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                        {HAZARD_ICONS[h.type]}
                        {HAZARD_TYPE_CONFIG[h.type].label}
                      </span>
                      <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: NOAH_INTENSITY[h.riskLevel].color + '55' }}
                      >
                        {NOAH_INTENSITY[h.riskLevel].label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{h.note}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!selectedZone && !selectedProfile && zonesForHazard.length > 0 && (
          <div className="absolute bottom-4 left-4 right-28 z-[999] hidden lg:block">
            <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg px-3 py-2 flex gap-2 overflow-x-auto">
              {zonesForHazard.slice(0, 8).map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setSelectedZone(zone)}
                  className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: NOAH_INTENSITY[zone.riskLevel].color }}
                  />
                  <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{zone.name}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
