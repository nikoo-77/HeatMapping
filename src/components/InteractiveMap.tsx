import React, { useRef, useState, useEffect } from 'react';
import { Employee, DisasterConfig } from '../types';
import { ALL_ISLAND_LOCATIONS } from '../data_islands';
import { Flame, MapPin, Search, Users, ShieldAlert, Crosshair, HelpCircle, Signal, Battery, Home, Info, Compass, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';

// Coordinated bounds mapping for Cebu (used for the legacy grid ↔ GPS helpers)
const LAT_MIN = 10.245;
const LAT_MAX = 10.355;
const LNG_MIN = 123.82;
const LNG_MAX = 123.99;

// ─── Island group geographic bounding boxes ────────────────────────────────
// Each entry is [swLat, swLng, neLat, neLng] (south-west → north-east)
const ISLAND_GROUP_BOUNDS: Record<'Luzon' | 'Visayas' | 'Mindanao' | 'Philippines', [number, number, number, number]> = {
  Philippines: [4.5, 116.0, 21.5, 127.0],
  Luzon:       [12.5, 119.5, 20.5, 124.0],
  Visayas:     [9.0,  121.5, 12.5, 126.0],
  Mindanao:    [5.0,  121.0,  9.5, 127.0],
};

// Linear conversion: Grid (0-100) -> GPS Lat/Lng (for legacy compat)
export function customToLatLng(customLng: number, customLat: number): { lat: number; lng: number } {
  const lat = LAT_MAX - (customLat / 100) * (LAT_MAX - LAT_MIN);
  const lng = LNG_MIN + (customLng / 100) * (LNG_MAX - LNG_MIN);
  return { lat, lng };
}

// Linear conversion: GPS Lat/Lng -> Grid (0-100)
export function latLngToCustom(lat: number, lng: number): { x: number; y: number } {
  const customLat = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100;
  const customLng = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100;
  return {
    x: Math.max(0, Math.min(100, parseFloat(customLng.toFixed(1)))),
    y: Math.max(0, Math.min(100, parseFloat(customLat.toFixed(1))))
  };
}

export function getDisasterCategory(name: string): string {
  if (name.includes('Fire')) return 'Fire';
  if (name.includes('Flood')) return 'Flood';
  if (name.includes('Gas')) return 'Gas Leak';
  if (name.includes('Blast')) return 'Blast';
  if (name.includes('Earthquake')) return 'Earthquake';
  return 'Hazard';
}

export function getDisasterEmoji(icon: string): string {
  if (icon === 'typhoon') return '🌊';
  if (icon === 'earthquake') return '🚨';
  return '🔥';
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getEmployeeCity(emp: Employee): string | null {
  const address = (emp.address ?? '').trim();
  const addressText = normalizeText(address);

  const knownCities = ALL_ISLAND_LOCATIONS.map((loc) => loc.city);
  const match = knownCities.find((city) => normalizeText(city).includes(addressText) || addressText.includes(normalizeText(city)));
  if (match) return match;

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2] || null;
  }

  return null;
}

export function hexToRgb(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface InteractiveMapProps {
  employees: Employee[];
  epicenter: { lat: number; lng: number; radiusKm: number };
  selectedEmployee: Employee | null;
  onSelectEmployee: (emp: Employee | null) => void;
  onEpicenterChange: (newEpicenter: { lat: number; lng: number; radiusKm: number }) => void;
  activeDisaster: DisasterConfig;
  onDispatchRescue?: (employeeId: string) => void;
  mapView?: 'island' | 'metro';
  simulationActive?: boolean;
  selectedCity?: string | null;
  selectedIslandGroup?: 'Luzon' | 'Visayas' | 'Mindanao' | null;
}

export default function InteractiveMap({
  employees,
  epicenter,
  selectedEmployee,
  onSelectEmployee,
  onEpicenterChange,
  activeDisaster,
  onDispatchRescue,
  mapView = 'island',
  simulationActive = false,
  selectedCity = null,
  selectedIslandGroup = null,
}: InteractiveMapProps) {
  const mockMapRef = useRef<SVGSVGElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const employeeLayerRef = useRef<L.LayerGroup | null>(null);
  const zoomLevelRef = useRef(6);

  const [isDraggingEpicenterOnMock, setIsDraggingEpicenterOnMock] = useState(false);
  const [hoveredEmployee, setHoveredEmployee] = useState<Employee | null>(null);
  const [currentZoom, setCurrentZoom] = useState(6);
  const [mapViewportVersion, setMapViewportVersion] = useState(0);

  // Map layers standard: 'streets' (roadmap), 'dark' (tactical), 'light' (clean) or 'mock' (SVG layout)
  const [mapType, setMapType] = useState<'streets' | 'dark' | 'light' | 'mock'>('light');

  // Layer switches
  const [activeLayers, setActiveLayers] = useState({
    showOnlyAffected: false,
    showLocalRoads: true,
    showSafetyLandmarks: true,
    showOfficeBubbles: false,
  });

  const getRadiusInMeters = (radiusKm: number) => {
    return radiusKm * 1000;
  };

  // --- LEAFLET IN-PAGE MOUNT LIFECYCLE ---
  useEffect(() => {
    if (mapType === 'mock' || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        layersGroupRef.current = null;
      }
      return;
    }

    // Initialize physical leaflet map - default to Philippines overview
    const initialCenter: L.LatLngExpression = mapView === 'island' ? [12.0, 122.5] : [10.3157, 123.8854];
    const initialZoom = mapView === 'island' ? 6 : 12;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    mapInstanceRef.current = map;
    layersGroupRef.current = L.layerGroup().addTo(map);
    employeeLayerRef.current = L.layerGroup().addTo(map);

    const refreshViewport = () => {
      const z = map.getZoom();
      zoomLevelRef.current = z;
      setCurrentZoom(z);
      setMapViewportVersion((prev) => prev + 1);
    };

    map.on('zoomend', refreshViewport);
    map.on('moveend', refreshViewport);

    map.on('click', (e: any) => {
      if (!simulationActive) return;
      onEpicenterChange({
        ...epicenter,
        lat: parseFloat(e.latlng.lat.toFixed(5)),
        lng: parseFloat(e.latlng.lng.toFixed(5)),
      });
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        layersGroupRef.current = null;
        if (employeeLayerRef.current) {
          employeeLayerRef.current.clearLayers();
          employeeLayerRef.current = null;
        }
      }
    };
  }, [mapType]);

  // Fly to island group bounds when the selected island group changes
  useEffect(() => {
    if (!mapInstanceRef.current || mapType === 'mock') return;
    const map = mapInstanceRef.current;

    if (mapView === 'metro') {
      // Metro view always stays on Cebu CBD
      map.setView([10.3157, 123.8854], 12, { animate: true, duration: 1.0 });
      return;
    }

    const key = selectedIslandGroup ?? 'Philippines';
    const bounds = ISLAND_GROUP_BOUNDS[key];
    // fitBounds: [swLat, swLng], [neLat, neLng]
    map.fitBounds(
      [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
      { animate: true, duration: 0.8, padding: [30, 30] }
    );

    setTimeout(() => { map.invalidateSize(); }, 150);
  }, [mapView, mapType, selectedIslandGroup]);

  // Automatically pan/center on selected employee
  useEffect(() => {
    if (!mapInstanceRef.current || mapType === 'mock' || !selectedEmployee) return;
    const map = mapInstanceRef.current;
    
    const empGps = selectedEmployee.gpsLat && selectedEmployee.gpsLng 
      ? { lat: selectedEmployee.gpsLat, lng: selectedEmployee.gpsLng } 
      : customToLatLng(selectedEmployee.lng, selectedEmployee.lat);
      
    map.setView([empGps.lat, empGps.lng], 14, {
      animate: true,
      duration: 1.0
    });
  }, [selectedEmployee, mapType]);

  // Automatically pan/center on a selected city from the side-panel
  useEffect(() => {
    if (!mapInstanceRef.current || mapType === 'mock' || !selectedCity) return;
    const map = mapInstanceRef.current;
    
    const matchedLoc = ALL_ISLAND_LOCATIONS.find(loc => loc.city === selectedCity);
    if (matchedLoc) {
      map.setView([matchedLoc.gpsLat, matchedLoc.gpsLng], 12, {
        animate: true,
        duration: 1.0
      });
    }
  }, [selectedCity, mapType]);

  // Map Tile layer manager
  useEffect(() => {
    if (!mapInstanceRef.current || mapType === 'mock') return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    if (mapType === 'dark') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions">CARTO</a>';
    } else if (mapType === 'light') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap &copy; <a href="https://carto.com/attributions">CARTO</a>';
    }

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [mapType]);

  // Static layers (FTE Bubbles, concentric rings, epicenters) — separate from employees
  useEffect(() => {
    if (!mapInstanceRef.current || !layersGroupRef.current || mapType === 'mock') return;
    const layers = layersGroupRef.current;
    layers.clearLayers();

    // 1. CONSTANT COMPONENT: Red/Maroon Headcount Footprint Bubbles
    if (activeLayers.showOfficeBubbles) {
      const visibleLocations = ALL_ISLAND_LOCATIONS.filter(loc => {
        if (selectedCity) return loc.city === selectedCity;
        if (selectedIslandGroup) return loc.islandGroup === selectedIslandGroup;
        return true;
      });

      visibleLocations.forEach(loc => {
        const strokeColor = loc.islandGroup === 'Luzon' ? '#065f46' : loc.islandGroup === 'Visayas' ? '#1e3a8a' : '#92400e';
        const fillColor   = loc.islandGroup === 'Luzon' ? '#10b981' : loc.islandGroup === 'Visayas' ? '#3b82f6' : '#f59e0b';
        const employeeCount = employees.filter(emp => {
          const cityMatch = getEmployeeCity(emp)?.toLowerCase() === loc.city.toLowerCase();
          const regionMatch = emp.region === loc.region;
          const islandMatch = emp.islandGroup === loc.islandGroup;
          return cityMatch || (regionMatch && islandMatch);
        }).length;
        const bubbleRadMeters = Math.sqrt(Math.max(employeeCount, 1)) * 6000;
        
        const circle = L.circle([loc.gpsLat, loc.gpsLng], {
          radius: bubbleRadMeters,
          color: strokeColor,
          weight: 1.5,
          fillColor,
          fillOpacity: 0.30,
          className: 'transition-all duration-300 cursor-pointer'
        }).addTo(layers);

        circle.bindTooltip(`
          <div class="font-sans p-1.5 text-xs text-slate-900 leading-snug">
            <strong class="text-indigo-950 uppercase text-[11px] block border-b border-slate-200 pb-0.5 mb-1">${loc.name}</strong>
            <span class="text-[10px] text-slate-500">${loc.islandGroup}</span>
            <span>FTE: <strong class="text-red-700 text-base font-black">${employeeCount}</strong></span>
            <span class="text-[9.5px] text-slate-500 font-mono block mt-0.5">[${loc.gpsLng.toFixed(4)}°E, ${loc.gpsLat.toFixed(4)}°N]</span>
          </div>
        `, { permanent: false, direction: 'top', opacity: 0.95 });
      });
    }

    // 2. METRO CEBU CONCENTRIC RINGS
    if (mapView === 'metro') {
      const hubCenter = [10.3157, 123.8854];
      L.circle(hubCenter as any, { radius: 5000, color: '#64748b', fillColor: 'transparent', weight: 1.75, dashArray: '5, 8', opacity: 0.75, interactive: false }).addTo(layers);
      L.marker([10.3157 + 0.046, 123.8854], { icon: L.divIcon({ className: '', html: `<div class="bg-indigo-950 text-white font-mono font-black text-[8px] tracking-widest px-1.5 py-0.5 rounded shadow-sm border border-indigo-850 uppercase select-none">5 KM RANGE</div>`, iconSize: [60, 16], iconAnchor: [30, 8] }) }).addTo(layers);
      L.circle(hubCenter as any, { radius: 10000, color: '#475569', fillColor: 'transparent', weight: 1.75, dashArray: '5, 8', opacity: 0.65, interactive: false }).addTo(layers);
      L.marker([10.3157 + 0.091, 123.8854], { icon: L.divIcon({ className: '', html: `<div class="bg-indigo-950 text-white font-mono font-black text-[8px] tracking-widest px-1.5 py-0.5 rounded shadow-sm border border-indigo-850 uppercase select-none">10 KM RANGE</div>`, iconSize: [60, 16], iconAnchor: [30, 8] }) }).addTo(layers);
    }

    // 3. EMERGENCY INCIDENTS
    if (simulationActive) {
      const centerGps = { lat: epicenter.lat, lng: epicenter.lng };
      const radialHeatRings = [
        { radiusMult: 0.15, fillColor: activeDisaster.id === 'typhoon' ? '#0891b2' : activeDisaster.id === 'earthquake' ? '#be123c' : '#db2777', opacity: 0.40 },
        { radiusMult: 0.35, fillColor: activeDisaster.id === 'typhoon' ? '#06b6d4' : activeDisaster.id === 'earthquake' ? '#e11d48' : '#ef4444', opacity: 0.30 },
        { radiusMult: 0.60, fillColor: activeDisaster.id === 'typhoon' ? '#22d3ee' : activeDisaster.id === 'earthquake' ? '#f43f5e' : '#f97316', opacity: 0.20 },
        { radiusMult: 0.85, fillColor: activeDisaster.id === 'typhoon' ? '#67e8f9' : activeDisaster.id === 'earthquake' ? '#fb7185' : '#eab308', opacity: 0.12 },
        { radiusMult: 1.00, fillColor: activeDisaster.id === 'typhoon' ? '#a5f3fc' : activeDisaster.id === 'earthquake' ? '#fca5a5' : '#fb923c', opacity: 0.05 },
      ];
      radialHeatRings.forEach(ring => {
        L.circle([centerGps.lat, centerGps.lng], {
          radius: getRadiusInMeters(epicenter.radiusKm) * ring.radiusMult,
          color: 'transparent', fillColor: ring.fillColor, fillOpacity: ring.opacity, weight: 0, interactive: false,
        }).addTo(layers);
      });

      const epicenterMarker = L.marker([centerGps.lat, centerGps.lng], {
        draggable: true,
        icon: L.divIcon({
          className: '',
          html: `
            <div class="relative flex items-center justify-center cursor-grab active:cursor-grabbing" style="width: 50px; height: 50px; margin-left: -25px; margin-top: -25px;">
              <div class="absolute w-[40px] h-[40px] rounded-full border-4 flex items-center justify-center animate-ping"
                style="border-color: ${activeDisaster.hexColor || '#f97316'}; background-color: rgba(${hexToRgb(activeDisaster.hexColor || '#f97316')},0.2)"
              ></div>
              <div class="absolute w-[36px] h-[36px] rounded-full border flex items-center justify-center shadow-lg"
                style="border-color: ${activeDisaster.hexColor || '#f97316'}; background-color: ${activeDisaster.hexColor || '#f97316'}"
              >
                <span class="text-sm">${getDisasterEmoji(activeDisaster.icon)}</span>
              </div>
              <div class="absolute -top-7 bg-indigo-950 border border-slate-700 text-white text-[8px] font-mono px-1.5 py-0.5 rounded shadow-md whitespace-nowrap uppercase font-black tracking-widest z-50 animate-bounce">
                ${getDisasterEmoji(activeDisaster.icon)} ${getDisasterCategory(activeDisaster.name).toUpperCase()} INCIDENT
              </div>
            </div>
          `,
          iconSize: [50, 50], iconAnchor: [25, 25],
        }),
      }).addTo(layers);

      epicenterMarker.on('dragend', (e: any) => {
        const position = e.target.getLatLng();
        onEpicenterChange({
          ...epicenter,
          lat: parseFloat(position.lat.toFixed(5)),
          lng: parseFloat(position.lng.toFixed(5)),
        });
      });

      if (activeLayers.showLocalRoads) {
        const SAFE_ARTERY_ROADS = [
          [[10.2750, 123.8550], [10.2850, 123.8800], [10.3010, 123.9050]],
          [[10.3110, 123.8960], [10.3220, 123.8910], [10.3340, 123.8990]],
          [[10.2930, 123.9020], [10.3020, 123.8950], [10.3150, 123.8900]]
        ];
        SAFE_ARTERY_ROADS.forEach((roadPoints) => {
          L.polyline(roadPoints as any, { color: '#10b981', weight: 2.5, opacity: 0.6, dashArray: '3, 4', interactive: false }).addTo(layers);
        });
      }

      if (activeLayers.showSafetyLandmarks) {
        const EVACUATION_CENTERS = [
          { name: 'Vicente Sotto Memorial Gym (Evac)', lat: 10.3088, lng: 123.8912, emoji: '🏥' },
          { name: 'Lahug Barangay Sports Complex', lat: 10.3345, lng: 123.8988, emoji: '🏥' },
        ];
        EVACUATION_CENTERS.forEach((center) => {
          L.marker([center.lat, center.lng], {
            icon: L.divIcon({
              className: '',
              html: `
                <div class="relative flex items-center justify-center p-1 bg-white border border-emerald-500 rounded-full shadow-lg" style="width: 20px; height: 20px; margin-left: -10px; margin-top: -10px;">
                  <span class="text-[10px] select-none">${center.emoji}</span>
                </div>
              `,
              iconSize: [20, 20], iconAnchor: [10, 10],
            })
          }).addTo(layers).bindPopup(`<b>${center.name}</b><br/>Civil Protection Shelter.`);
        });
      }
    }
  }, [mapType, activeLayers, mapView, simulationActive, epicenter, activeDisaster, selectedIslandGroup, selectedCity, employees]);

  // Employee markers — separate layer, gated by zoom level and current viewport
  useEffect(() => {
    if (!mapInstanceRef.current || !employeeLayerRef.current || mapType === 'mock') return;

    const map = mapInstanceRef.current;
    const empLayer = employeeLayerRef.current;
    const frame = window.requestAnimationFrame(() => {
      empLayer.clearLayers();

<<<<<<< Updated upstream
      if (currentZoom < 9) return;
=======
      const isFocusedSelection = Boolean(selectedCity || selectedRegion || selectedIslandGroup);

      // Keep the overview lightweight by only rendering employee pins once the user
      // has narrowed the view to a specific region, island group, city, or active simulation.
      if (!isFocusedSelection && !simulationActive) return;
      if (currentZoom < (isFocusedSelection ? 6 : 9)) return;
>>>>>>> Stashed changes

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const maxMarkers = currentZoom >= 13 ? 320 : currentZoom >= 11 ? 180 : 90;
      let rendered = 0;

      const visibleEmployees = employees.filter((emp) => {
        const normalizedSelectedCity = selectedCity?.trim().toLowerCase();
        const cityName = getEmployeeCity(emp)?.trim().toLowerCase();
        const addressText = emp.address?.trim().toLowerCase() ?? '';
        if (selectedCity && !(cityName?.includes(normalizedSelectedCity!) || addressText.includes(normalizedSelectedCity!))) return false;
        if (selectedRegion && emp.region !== selectedRegion) return false;
        if (selectedIslandGroup && emp.islandGroup !== selectedIslandGroup) return false;

        const empGps = emp.gpsLat && emp.gpsLng
          ? { lat: emp.gpsLat, lng: emp.gpsLng }
          : customToLatLng(emp.lng, emp.lat);

        if (empGps.lat < sw.lat || empGps.lat > ne.lat || empGps.lng < sw.lng || empGps.lng > ne.lng) {
          return false;
        }

        if (simulationActive) {
          const distKm = haversineKm(epicenter.lat, epicenter.lng, empGps.lat, empGps.lng);
          const isInsideDisaster = distKm <= epicenter.radiusKm;
          return !activeLayers.showOnlyAffected || isInsideDisaster;
        }

        return true;
      }).slice(0, maxMarkers);

      visibleEmployees.forEach((emp) => {
        const empGps = emp.gpsLat && emp.gpsLng
          ? { lat: emp.gpsLat, lng: emp.gpsLng }
          : customToLatLng(emp.lng, emp.lat);

        const distKm = haversineKm(epicenter.lat, epicenter.lng, empGps.lat, empGps.lng);
        const isInsideDisaster = simulationActive && distKm <= epicenter.radiusKm;

        let pinColor = '#3b82f6';
        if (simulationActive) {
          if (isInsideDisaster) {
            if (emp.status === 'Green') pinColor = '#10b981';
            else if (emp.status === 'Yellow') pinColor = '#f59e0b';
            else pinColor = '#ef4444';
          } else {
            pinColor = '#3b82f6';
          }
        } else if (emp.status === 'Green') {
          pinColor = '#10b981';
        } else if (emp.status === 'Yellow') {
          pinColor = '#f59e0b';
        } else {
          pinColor = '#ef4444';
        }

        const isSelected = selectedEmployee?.id === emp.id;
        const hqGps: [number, number] = [10.3311, 123.9053];

        if (simulationActive && emp.rescueDispatched) {
          const routeCoords = [
            [hqGps[0], hqGps[1]],
            [(hqGps[0] + empGps.lat) / 2 + 0.001, (hqGps[1] + empGps.lng) / 2 - 0.002],
            [empGps.lat, empGps.lng]
          ];
          L.polyline(routeCoords as any, { color: '#10b981', weight: 3, opacity: 0.9, dashArray: '6, 6' }).addTo(empLayer);
          L.marker([routeCoords[1][0], routeCoords[1][1]], {
            icon: L.divIcon({
              className: '',
              html: `<div class="bg-emerald-600 text-white p-1 rounded-full text-xs animate-bounce flex items-center justify-center font-bold" style="width: 20px; height: 20px; margin-left:-10px; margin-top:-10px; line-height: 1;">🎁</div>`,
              iconSize: [20, 20], iconAnchor: [10, 10],
            })
          }).addTo(empLayer);
        }

        L.circleMarker([empGps.lat, empGps.lng], {
          radius: isSelected ? 8 : 6,
          fillColor: pinColor,
          fillOpacity: isSelected ? 1 : 0.85,
          color: isSelected ? '#f97316' : '#ffffff',
          weight: isSelected ? 3 : 1.5,
          opacity: 1,
          renderer: L.canvas(),
        }).addTo(empLayer)
          .on('click', () => onSelectEmployee(isSelected ? null : emp))
          .on('mouseover', () => setHoveredEmployee(emp))
          .on('mouseout', () => setHoveredEmployee(null));

        rendered += 1;
        if (rendered >= maxMarkers) return;
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mapViewportVersion, currentZoom, employees, epicenter, selectedEmployee, simulationActive, activeLayers.showOnlyAffected, selectedIslandGroup, selectedCity, selectedRegion]);

  // --- MOCK SVG CHOP MAP HANDLERS (As secondary fallback diagram mode) ---
  const handleMapClickOnMock = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!mockMapRef.current || !simulationActive) return;
    const rect = mockMapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // For the mock SVG map, convert GPS epicenter to SVG grid coordinates
    const mockEpicCenter = latLngToCustom(epicenter.lat, epicenter.lng);
    // Convert radiusKm to approximate SVG units (Philippine bbox: ~1900km wide = 11 units)
    const mockRadius = Math.max(1, epicenter.radiusKm * 0.06);

    onEpicenterChange({
      ...epicenter,
      lat: parseFloat(epicenter.lat.toFixed(5)),
      lng: parseFloat(epicenter.lng.toFixed(5)),
    });
  };

  return (
    <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-full min-h-[440px]" id="fire-monitoring-dashboard">
      
      {/* Mini layers bar above map container */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3 text-xs font-mono text-slate-600 shrink-0">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer py-0.5 text-[10px] uppercase font-bold text-slate-700 select-none">
            <input
              type="checkbox"
              checked={activeLayers.showOfficeBubbles}
              onChange={(e) => setActiveLayers(prev => ({ ...prev, showOfficeBubbles: e.target.checked }))}
              className="accent-[#002060] cursor-pointer h-3 w-3"
            />
            <span>Location Bubbles</span>
          </label>

          {simulationActive && (
            <>
              <label className="flex items-center gap-1.5 cursor-pointer py-0.5 text-[10px] uppercase font-bold text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={activeLayers.showOnlyAffected}
                  onChange={(e) => setActiveLayers(prev => ({ ...prev, showOnlyAffected: e.target.checked }))}
                  className="accent-rose-650 cursor-pointer h-3 w-3"
                />
                <span>Isolated Inside Plume</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer py-0.5 text-[10px] uppercase font-bold text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={activeLayers.showLocalRoads}
                  onChange={(e) => setActiveLayers(prev => ({ ...prev, showLocalRoads: e.target.checked }))}
                  className="accent-rose-650 cursor-pointer h-3 w-3"
                />
                <span>Safe Escape Roads</span>
              </label>
            </>
          )}
        </div>

        {/* GIS Base map selection */}
        <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded border border-slate-300">
          <button
            onClick={() => setMapType('light')}
            className={`px-2.5 py-0.5 rounded text-[9px] font-black tracking-wider transition border uppercase ${
              mapType === 'light' ? 'bg-[#002060] text-white border-[#001848] shadow-sm' : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            LIGHT
          </button>
          <button
            onClick={() => setMapType('streets')}
            className={`px-2.5 py-0.5 rounded text-[9px] font-black tracking-wider transition border uppercase ${
              mapType === 'streets' ? 'bg-[#002060] text-white border-[#001848] shadow-sm' : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            STREETS
          </button>
          <button
            onClick={() => setMapType('dark')}
            className={`px-2.5 py-0.5 rounded text-[9px] font-black tracking-wider transition border uppercase ${
              mapType === 'dark' ? 'bg-[#002060] text-white border-[#001848] shadow-sm' : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            TACTICAL DARK
          </button>
          <button
            onClick={() => setMapType('mock')}
            className={`px-2.5 py-0.5 rounded text-[9px] font-black tracking-wider transition border uppercase ${
              mapType === 'mock' ? 'bg-rose-600 text-white border-rose-700 shadow-sm' : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            TACTICAL DIAGRAM
          </button>
        </div>
      </div>

      {/* Map Main display wrapper */}
      <div className="relative flex-1 select-none overflow-hidden h-full min-h-[400px]">
        
        {mapType !== 'mock' ? (
          <div ref={mapContainerRef} className="w-full h-full z-10 bg-slate-50" style={{ minHeight: '400px' }} />
        ) : (
          /* SVG DIAGRAM fallback map design */
          <svg
            ref={mockMapRef}
            className="w-full h-full min-h-[400px] bg-slate-900 bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] [background-size:20px_20px]"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onClick={handleMapClickOnMock}
          >
            {/* Outline of Cebu Province (procedural visual nodes) */}
            <g id="cebu-geography" opacity="0.45">
              <path
                d="M 33,0 C 42,5 45,15 48,22 C 52,28 50,33 46,39 C 40,45 42,52 36,60 C 30,68 28,75 22,85 C 15,92 10,98 2,100 L 0,100 L 0,0 Z"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="0.5"
              />
            </g>

            {/* Render bubbles in Mock SVG – filtered by island group */}
            {activeLayers.showOfficeBubbles && ALL_ISLAND_LOCATIONS
              .filter(loc => !selectedIslandGroup || loc.islandGroup === selectedIslandGroup)
              .map(loc => {
                const customCoords = latLngToCustom(loc.gpsLat, loc.gpsLng);
                const svgRad = Math.sqrt(loc.fte) * 0.35;
                const fillC = loc.islandGroup === 'Luzon' ? '#10b981' : loc.islandGroup === 'Visayas' ? '#3b82f6' : '#f59e0b';
                return (
                  <g key={`svg-loc-${loc.name}`}>
                    <circle
                      cx={customCoords.x}
                      cy={customCoords.y}
                      r={svgRad}
                      fill={fillC}
                      fillOpacity="0.45"
                      stroke="#475569"
                      strokeWidth="0.15"
                    />
                    <text
                      x={customCoords.x}
                      y={customCoords.y - svgRad - 0.5}
                      fill="#e2e8f0"
                      fontSize="1.5"
                      fontFamily="monospace"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {loc.city}
                    </text>
                  </g>
                );
            })}

            {/* Active Disaster site elements inside SVG mock */}
            {simulationActive && (() => {
              const mockEpicCenter = latLngToCustom(epicenter.lat, epicenter.lng);
              const mockRadius = Math.max(1, epicenter.radiusKm * 0.06);
              return (
                <g opacity="0.85">
                  <circle cx={mockEpicCenter.x} cy={mockEpicCenter.y} r={mockRadius} fill="#fb923c" fillOpacity="0.1" />
                  <circle cx={mockEpicCenter.x} cy={mockEpicCenter.y} r={mockRadius * 0.35} fill="#ef4444" fillOpacity="0.25" />
                  <circle cx={mockEpicCenter.x} cy={mockEpicCenter.y} r="1.5" fill="#f43f5e" className="animate-pulse" />
                  <text x={mockEpicCenter.x} y={mockEpicCenter.y - 2.5} fill="#fda4af" fontSize="2" fontFamily="monospace" textAnchor="middle" fontWeight="black">
                    {getDisasterEmoji(activeDisaster.icon)} ACTIVE CRISIS AREA
                  </text>
                </g>
              );
            })()}
          </svg>
        )}

        {/* Individual Hover Tooltip Card */}
        {hoveredEmployee && (
          <div className="absolute top-4 left-4 bg-slate-900/95 border border-slate-700 text-white rounded-lg shadow-2xl p-3 font-mono text-[10px] z-50 flex flex-col gap-1 pointer-events-none max-w-xs animate-fade-in shadow">
            <div className="flex items-center justify-between gap-4 font-bold text-amber-400 border-b border-slate-800 pb-1 mb-1 font-sans text-[11px] uppercase">
              <span>Resident staff details</span>
              <span className={`px-1 rounded uppercase ${
                hoveredEmployee.status === 'Green' ? 'bg-emerald-500 text-slate-900' : 'bg-red-500 text-white'
              }`}>{hoveredEmployee.status}</span>
            </div>
            <span>Name: <strong className="text-white">{hoveredEmployee.name}</strong></span>
            <span>Title: <span className="text-slate-350">{hoveredEmployee.role}</span></span>
            <span>Home Base Address: <span className="text-cyan-300">{hoveredEmployee.address}</span></span>
            <span>Mobile network: <strong className="text-slate-200">{hoveredEmployee.carrier}</strong></span>
          </div>
        )}

      </div>

      {/* Selected Employee details Drawer panel (At the footer of the map) */}
      <div className="bg-slate-50 border-t border-slate-200 p-4 min-h-[90px] flex items-center justify-between z-10">
        <AnimatePresence mode="wait">
          {selectedEmployee ? (
            <motion.div
              key={selectedEmployee.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full"
            >
              <div className="flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black font-sans text-xs shrink-0 border shadow-sm
                  ${selectedEmployee.status === 'Green' ? 'bg-emerald-100 text-emerald-850 border-emerald-300' : ''}
                  ${selectedEmployee.status === 'Yellow' ? 'bg-amber-100 text-amber-850 border-amber-300 animate-pulse' : ''}
                  ${selectedEmployee.status === 'Red' ? 'bg-rose-100 text-[#71091e] border-rose-300' : ''}
                `}>
                  {selectedEmployee.avatar}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h3 className="text-xs font-extrabold text-slate-900">{selectedEmployee.name}</h3>
                    <span className="text-[8.5px] bg-[#002060]/10 text-[#002060] px-1.5 py-0.25 rounded font-mono font-bold tracking-widest uppercase border border-[#002060]/20">
                      {selectedEmployee.department}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">{selectedEmployee.role}</p>

                  <div className="bg-indigo-950 border border-slate-800 px-2 py-1 rounded mt-1.5 max-w-sm shadow-md flex items-center gap-2">
                    <span className="bg-red-650 text-white font-mono font-black text-[7px] px-1 rounded uppercase select-none">RESIDENCE</span>
                    <strong className="text-[10px] font-black text-rose-300 font-sans tracking-tight truncate max-w-[210px]" title={selectedEmployee.address}>
                      {selectedEmployee.address || 'Cebu City, Cebu, Ph'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 self-end sm:self-auto text-[10px] font-mono shadow-sm">
                
                <div className="flex flex-col">
                  <span className="text-slate-400 text-[7px] uppercase font-bold">GPS Location Code</span>
                  <span className="text-slate-700 font-extrabold">
                    {selectedEmployee.gpsLat ? `[${selectedEmployee.gpsLat}°N, ${selectedEmployee.gpsLng}°E]` : `[Grid X: ${selectedEmployee.lng}%, Y: ${selectedEmployee.lat}%]`}
                  </span>
                </div>

                {simulationActive && selectedEmployee.status !== 'Green' && onDispatchRescue && (
                  <button
                    onClick={() => onDispatchRescue(selectedEmployee.id)}
                    className={`px-2.5 py-1 rounded transition text-[9px] font-mono font-black border uppercase shrink-0 cursor-pointer ${
                      selectedEmployee.rescueDispatched
                        ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-250'
                    }`}
                  >
                    {selectedEmployee.rescueDispatched ? '🎁 Corporate Aid Sent' : 'Allocate Company Relief'}
                  </button>
                )}

                <button
                  onClick={() => onSelectEmployee(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border border-slate-200 transition text-[9px] font-mono font-black cursor-pointer uppercase shrink-0"
                >
                  Close
                </button>
              </div>

            </motion.div>
          ) : (
            <div className="text-slate-400 flex items-center gap-2 w-full text-xs font-sans justify-center py-1 select-none font-medium">
              <Compass className="w-4 h-4 text-slate-400 animate-spin-slow shrink-0" />
              <span className="text-center text-slate-500">
                {simulationActive 
                  ? `Crisis Drill: Epicenter at [${epicenter.lat.toFixed(4)}°N, ${epicenter.lng.toFixed(4)}°E] — Radius: ${epicenter.radiusKm} km. Drag the marker or click the map to move the epicenter.`
                  : `Innodata Workforce Density Dashboard. Hover over municipality footprint bubbles or check the locations table on the left to review employee sizes.`
                }
              </span>
            </div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
