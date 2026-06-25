export type Carrier = 'Globe' | 'Smart' | 'DITO';
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
  address?: string; // Home address
  islandGroup?: 'Luzon' | 'Visayas' | 'Mindanao';
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

