import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Crosshair, X, Search } from 'lucide-react';

type SetLocationModalProps = {
  open: boolean;
  username: string;
  employeeId?: string | null;
  /** When true (post-login), show Skip and explain why the pin is needed */
  promptMode?: boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  onClose: () => void;
  onSkip?: () => void;
  onSuccess?: (coords: { latitude: number; longitude: number }) => void;
};

const PH_CENTER: [number, number] = [12.0, 122.5];
const DEFAULT_ZOOM = 6;
const PINNED_ZOOM = 16;

function getLeaflet(): any {
  return (window as any).L || require('leaflet');
}

export default function SetLocationModal({
  open,
  username,
  employeeId,
  promptMode = false,
  initialLat = null,
  initialLng = null,
  onClose,
  onSkip,
  onSuccess,
}: SetLocationModalProps) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const placeMarker = (nextLat: number, nextLng: number, fly = true) => {
    const L = getLeaflet();
    const map = mapRef.current;
    if (!map) return;

    const pinIcon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;background:#002060;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([nextLat, nextLng]);
    } else {
      markerRef.current = L.marker([nextLat, nextLng], { icon: pinIcon }).addTo(map);
    }

    if (fly) {
      map.setView([nextLat, nextLng], Math.max(map.getZoom(), PINNED_ZOOM), { animate: true });
    }

    setLat(nextLat);
    setLng(nextLng);
    setGeocodeError('');
    setError('');
  };

  // Mount / tear down map while the modal is open
  useEffect(() => {
    if (!open) return;

    setLat(initialLat);
    setLng(initialLng);
    setSearchQuery('');
    setGeocodeError('');
    setError('');
    setSuccess(false);
    setSaving(false);

    const timer = window.setTimeout(() => {
      if (!mapHostRef.current || mapRef.current) return;
      const L = getLeaflet();
      const hasInitial =
        typeof initialLat === 'number' &&
        typeof initialLng === 'number' &&
        Number.isFinite(initialLat) &&
        Number.isFinite(initialLng);

      const map = L.map(mapHostRef.current, {
        center: hasInitial ? [initialLat, initialLng] : PH_CENTER,
        zoom: hasInitial ? PINNED_ZOOM : DEFAULT_ZOOM,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      if (hasInitial) {
        placeMarker(initialLat as number, initialLng as number, false);
      }

      map.on('click', (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        placeMarker(clickLat, clickLng, false);
      });

      // Leaflet needs a size refresh after modal animation
      window.setTimeout(() => map.invalidateSize(), 120);
    }, 80);

    return () => {
      window.clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const resetForm = () => {
    setSearchQuery('');
    setGeocodeError('');
    setError('');
    setSuccess(false);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSkip = () => {
    resetForm();
    (onSkip ?? onClose)();
  };

  const handleGeocode = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setGeocodeError('Type a barangay, street, or city first.');
      return;
    }
    setIsGeocoding(true);
    setGeocodeError('');
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?q=' +
        encodeURIComponent(query) +
        '&format=json&limit=1&countrycodes=ph';
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      let foundLat: number;
      let foundLng: number;
      if (!data?.length) {
        const res2 = await fetch(
          'https://nominatim.openstreetmap.org/search?q=' +
            encodeURIComponent(query + ' Philippines') +
            '&format=json&limit=1',
          { headers: { 'Accept-Language': 'en' } }
        );
        const data2 = await res2.json();
        if (!data2?.length) {
          setGeocodeError(`"${query}" not found. Try a more specific name or click the map.`);
          return;
        }
        foundLat = parseFloat(data2[0].lat);
        foundLng = parseFloat(data2[0].lon);
      } else {
        foundLat = parseFloat(data[0].lat);
        foundLng = parseFloat(data[0].lon);
      }
      placeMarker(foundLat, foundLng, true);
    } catch {
      setGeocodeError('Network error — check your connection and try again.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Click the map to pin your exact home location before saving.');
      return;
    }
    if (lat < 4.5 || lat > 21.5 || lng < 116 || lng > 127) {
      setError('Please pin a location inside the Philippines.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/account/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: username,
          employeeId: employeeId || undefined,
          latitude: lat,
          longitude: lng,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || 'Failed to save location.');
      }
      setSuccess(true);
      onSuccess?.({ latitude: lat, longitude: lng });
      window.setTimeout(() => {
        resetForm();
        onClose();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,10,40,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[94vh] overflow-hidden flex flex-col">
        <div className="bg-[#002060] px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="bg-white/15 p-2 rounded-lg border border-white/20 shrink-0">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-black text-base tracking-tight">
                {promptMode ? 'Confirm your home location' : 'Update map pin'}
              </h2>
              <p className="text-blue-200 text-xs font-medium mt-0.5">
                {promptMode
                  ? 'Pin your exact house so calamity alerts and the heat map are accurate.'
                  : 'Click the map to move your saved home pin.'}
              </p>
            </div>
          </div>
          {!promptMode && (
            <button
              type="button"
              onClick={handleClose}
              className="text-white/70 hover:text-white hover:bg-white/15 p-2 rounded-lg transition shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleGeocode();
                    }
                  }}
                  placeholder="Search barangay, street, or city…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleGeocode()}
                disabled={isGeocoding}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Crosshair className="w-3.5 h-3.5" />
                {isGeocoding ? 'Searching…' : 'Find'}
              </button>
            </div>

            {geocodeError && (
              <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {geocodeError}
              </p>
            )}

            <div
              ref={mapHostRef}
              className="w-full h-[320px] rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shrink-0"
            />

            <p className="text-[11px] text-slate-500">
              Click the map to drop your pin on your house. Zoom in for better accuracy.
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-400 font-sans font-bold uppercase tracking-wider text-[9px]">Latitude</span>
                <div className="text-slate-800 font-bold mt-0.5">{lat != null ? lat.toFixed(6) : '—'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-400 font-sans font-bold uppercase tracking-wider text-[9px]">Longitude</span>
                <div className="text-slate-800 font-bold mt-0.5">{lng != null ? lng.toFixed(6) : '—'}</div>
              </div>
            </div>

            {error && (
              <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Location saved. Your map pin is now exact.
              </p>
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex gap-2 shrink-0 bg-white">
            {promptMode ? (
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs transition disabled:opacity-50"
              >
                Skip for now
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs transition disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || lat == null || lng == null}
              className="flex-1 bg-[#002060] hover:bg-[#003399] text-white font-bold py-2.5 rounded-lg text-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
