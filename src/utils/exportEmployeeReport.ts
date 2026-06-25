import { Employee, DisasterConfig, EmployeeTeam } from '../types';

export interface ExportReportOptions {
  employees: Employee[];
  epicenter: { lat: number; lng: number; radiusKm: number };
  activeDisaster: DisasterConfig;
  filterByTeam: boolean;
  viewerRole: EmployeeTeam;
  selectedIslandGroup?: string | null;
  selectedCity?: string | null;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isAffected(
  emp: Employee,
  epicenter: { lat: number; lng: number; radiusKm: number }
): boolean {
  const lat = emp.gpsLat ?? emp.lat;
  const lng = emp.gpsLng ?? emp.lng;
  return haversineKm(epicenter.lat, epicenter.lng, lat, lng) <= epicenter.radiusKm;
}

function escapeCsv(value: string | number | undefined | null): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getDisasterLabel(disaster: DisasterConfig): string {
  if (disaster.id === 'fire') return 'Fire';
  if (disaster.id === 'earthquake') return 'Earthquake';
  if (disaster.id === 'typhoon') return 'Typhoon';
  return disaster.name;
}

function getAlertSent(emp: Employee): string {
  if (emp.lastMessageSent && emp.lastEmailSent) return 'Yes (SMS & Email)';
  if (emp.lastMessageSent) return `Yes (SMS — ${emp.lastMessageSent})`;
  if (emp.lastEmailSent) return `Yes (Email — ${emp.lastEmailSent})`;
  if (emp.contacted) return 'Yes (Contact logged)';
  return 'No';
}

function getRespondedToAlert(emp: Employee): string {
  if (emp.lastResponseRecv) return `Yes (${emp.lastResponseRecv})`;
  if (emp.status === 'Green' && emp.contacted) return 'Yes';
  if (emp.unresponsive) return 'No (Unresponsive)';
  if (emp.lastMessageSent || emp.lastEmailSent || emp.contacted) return 'Pending';
  return 'No';
}

function getEmployeeSafe(emp: Employee): string {
  if (emp.status === 'Green') return 'Yes';
  if (emp.status === 'Yellow') return 'Pending';
  if (emp.status === 'Red') return emp.unresponsive ? 'No (Unresponsive)' : 'No (Needs Help)';
  return 'Unknown';
}

function getDamageExperienced(emp: Employee, disaster: DisasterConfig, affected: boolean): string {
  if (!affected) return 'N/A';
  const type = getDisasterLabel(disaster);
  if (emp.safetyMessage) return `${type} — ${emp.safetyMessage}`;
  if (emp.status === 'Green' && emp.contacted) return `${type} — Cleared / No major damage reported`;
  return type;
}

function getAidReceived(emp: Employee): string {
  if (emp.rescueDispatched) return 'Yes';
  if (emp.status === 'Red') return 'Pending / Requested';
  return 'No';
}

export function buildAffectedEmployeeRows(
  employees: Employee[],
  epicenter: ExportReportOptions['epicenter'],
  activeDisaster: DisasterConfig
): string[][] {
  const affectedEmployees = employees.filter((emp) => isAffected(emp, epicenter));

  const header = [
    'Employee Name',
    'Team',
    'Role',
    'Department',
    'Address',
    'Affected by Calamity',
    'Alert Sent',
    'Responded to Alert',
    'Employee Safe',
    'Type of Damage Experienced',
    'Help / Aid Received',
    'Distance to Epicenter (km)',
    'Carrier',
    'Status',
  ];

  const rows = affectedEmployees.map((emp) => {
    const affected = true;
    const distance = haversineKm(
      epicenter.lat,
      epicenter.lng,
      emp.gpsLat ?? emp.lat,
      emp.gpsLng ?? emp.lng
    );

    return [
      emp.name,
      emp.team ?? 'Unassigned',
      emp.role,
      emp.department,
      emp.address ?? '',
      'Yes',
      getAlertSent(emp),
      getRespondedToAlert(emp),
      getEmployeeSafe(emp),
      getDamageExperienced(emp, activeDisaster, affected),
      getAidReceived(emp),
      distance.toFixed(2),
      emp.carrier,
      emp.status,
    ];
  });

  return [header, ...rows];
}

export function exportEmployeeReportToExcel(options: ExportReportOptions): number {
  const {
    employees,
    epicenter,
    activeDisaster,
    filterByTeam,
    viewerRole,
    selectedIslandGroup,
    selectedCity,
  } = options;

  const dataRows = buildAffectedEmployeeRows(employees, epicenter, activeDisaster);
  const affectedCount = dataRows.length - 1;

  const teamLabel = filterByTeam ? `${viewerRole} Team` : 'All Teams';
  const geoLabel = selectedCity
    ? selectedCity
    : selectedIslandGroup
      ? `${selectedIslandGroup} Island Group`
      : 'Philippines (All)';

  const metaRows: string[][] = [
    ['Calamity Employee Report'],
    ['Generated', new Date().toLocaleString()],
    ['Disaster Type', getDisasterLabel(activeDisaster)],
    ['Incident', activeDisaster.name],
    ['Epicenter', `${epicenter.lat.toFixed(4)}°N, ${epicenter.lng.toFixed(4)}°E`],
    ['Hazard Radius (km)', String(epicenter.radiusKm)],
    ['Geographic Filter', geoLabel],
    ['Team Filter', teamLabel],
    ['Affected Employees Exported', String(affectedCount)],
    [],
  ];

  const allRows = [...metaRows, ...dataRows];
  const csvContent =
    '\uFEFF' +
    allRows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');

  const safeTeam = filterByTeam ? viewerRole.replace('/', '-') : 'All-Teams';
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `calamity-employee-report-${safeTeam}-${dateStamp}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return affectedCount;
}
