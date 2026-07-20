export type Carrier = 'Globe' | 'Smart' | 'DITO';

export type AidType = 'Cash' | 'Relief Goods' | 'Psychological Support';

export const AID_TYPE_OPTIONS: { value: AidType; label: string }[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Relief Goods', label: 'Relief Goods' },
  { value: 'Psychological Support', label: 'Emotional / Psychological Support' },
];

export function formatAidTypeLabel(aidType: AidType | string): string {
  // Legacy single-value "Both" and multi-select joined strings
  if (aidType === 'Both') return 'Cash and Relief Goods';
  return aidType
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part === 'Both') return 'Cash and Relief Goods';
      if (part === 'Psychological Support') return 'Emotional / Psychological Support';
      return part;
    })
    .join(' · ');
}

export function parseAidTypes(aidType: AidType | string): AidType[] {
  if (aidType === 'Both') return ['Cash', 'Relief Goods'];
  const allowed = new Set<string>(AID_TYPE_OPTIONS.map((o) => o.value));
  return aidType
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is AidType => allowed.has(part));
}

export interface AidApplication {
  id: string;
  requestCode: string;
  employeeId: string;
  employeeName: string;
  position?: string;
  incidentId: string;
  incidentName: string;
  /** Single type or comma-separated list when multiple were selected */
  aidType: string;
  description: string;
  status: 'Pending Manager Review' | 'Rejected by Manager' | 'Pending Admin Review' | 'Rejected by Admin/CSR' | 'Approved';
  damageType: 'Major' | 'Minor';
  filedDate: string;
  department: string;
  islandGroup: string;
  managerReview?: {
    decision: 'Approved' | 'Rejected' | 'Pending';
    remarks?: string;
    reviewedBy?: string;
    reviewedDate?: string;
  };
  adminReview?: {
    decision: 'Approved' | 'Rejected' | 'Pending';
    remarks?: string;
    reviewedBy?: string;
    reviewedDate?: string;
  };
  attachments: {
    id: string;
    fileName: string;
    filePath: string;
    publicUrl: string;
    uploadedAt: string;
  }[];
}
export type SafetyStatus = 'Green' | 'Yellow' | 'Red';
export type TowerStatus = 'ONLINE' | 'CONGESTED' | 'OFFLINE';
export type EmployeeTeam = 'HR/CSR' | 'Manager';

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  lat: number; // grid Y (0 - 100)
  lng: number; // grid X (0 - 100)
  gpsLat?: number;
  gpsLng?: number;
  carrier: Carrier;
  normalSignalStrength: number; // dBm
  battery: number; // percentage
  status: SafetyStatus;
  phone?: string;
  email?: string;
  lastMessageSent?: string;
  lastEmailSent?: string;
  lastResponseRecv?: string;
  safetyMessage?: string;
  avatar: string;
  userId?: string;
  contactNumber?: string;
  gcashNumber?: string;
  bankAccountDetails?: string;
  address?: string; // Primary address
  islandGroup?: 'Luzon' | 'Visayas' | 'Mindanao';
  region?: string;         // Philippine admin region code e.g. 'NCR', 'VII', 'XI'
  accessRole?: 'employee' | 'manager';
  managerId?: string;
  managerName?: string;
  team?: EmployeeTeam;
  distanceToEpicenter?: number;
  rescueDispatched?: boolean;
  contacted?: boolean;
  unresponsive?: boolean;
  emailed?: boolean;
}

export interface SignalTower {
  id: string;
  name: string;
  carrier: Carrier;
  lat: number;
  lng: number;
  status: TowerStatus;
  range: number; // active radius on grid
  capacity: number; // max connected clients
  currentLoad: number; // current simulated stress percentage
}

export interface BroadcastStep {
  id: 'idle' | 'scanning' | 'queueing' | 'dispatching' | 'complete';
  label: string;
  description: string;
}

export interface BroadcastLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'success' | 'error';
  message: string;
  employeeId?: string;
}

export type HazardType = 'flood' | 'landslide' | 'storm_surge' | 'earthquake' | 'volcanic' | 'tsunami' | 'fire';
export type HazardRiskLevel = 'high' | 'moderate' | 'low';

export interface HazardZone {
  id: string;
  name: string;
  type: HazardType;
  riskLevel: HazardRiskLevel;
  description: string;
  /** Polygon ring as [lat, lng][] */
  polygon: [number, number][];
  region?: string;
  province?: string;
}

/** Per-region hazard classification used by the Risk Classification Map choropleth */
export interface RegionHazardEntry {
  type: HazardType;
  riskLevel: HazardRiskLevel;
  note: string;
}

export interface RegionHazardProfile {
  regionCode: string;
  regionName: string;
  hazards: RegionHazardEntry[];
}

export interface HazardTypeConfig {
  type: HazardType;
  label: string;
  color: string;
  fillColor: string;
  icon: string;
  description: string;
}


export type DisasterId = 'earthquake' | 'typhoon' | 'fire';

export interface DisasterConfig {
  id: DisasterId;
  name: string;
  subName: string;
  icon: 'earthquake' | 'typhoon' | 'fire';
  color: string; // e.g. 'red' | 'cyan' | 'orange'
  colorClass: string; // e.g. 'text-red-600 bg-red-50 border-red-200'
  hexColor: string;
  defaultX: number;
  defaultY: number;
  defaultRadius: number;
  locationName: string;
  description: string;
  greenTemplates: string[];
  replyTemplates: string[];
}

