// Core data model. See docs/SPEC.md for the why behind each one.

export type Step = 0 | 1 | 2 | 3 | 4;
export const STEPS: Step[] = [0, 1, 2, 3, 4];
export const STEP_NAMES = ['Not started', 'Rough in', 'Set', 'Wired', 'Complete'] as const;

export type PartKind = 'point' | 'linear';
export type WorkType = 'install' | 'demo' | 're';
export type Ladder = 'install' | 'demo';

export type PartCategory =
  | 'fixture' | 'sign' | 'can' | 'conduit' | 'duct' | 'cable'
  | 'handhole' | 'manhole' | 'regulator' | 'equipment' | 'pole';

export type BillingType = 'unit' | 'lumpsum' | 'allowance';

export interface Job {
  id: string;
  name: string;
  customer: string;
  airport: string;
  contractNo: string;
  billingList: 'owner' | 'sub';
  placeholder?: boolean;
}

export interface Phase {
  id: string;
  jobId: string;
  name: string;
  order: number;
}

export interface Sheet {
  id: string;
  jobId: string;
  name: string;      // E-108
  title: string;     // Taxiway A West Lighting Plan
  src: string;       // url or data url of the rendered page
  width: number;
  height: number;
}

export interface Pt { x: number; y: number } // percent of the sheet, 0 to 100

export interface Zone {
  id: string;
  jobId: string;
  phaseId: string;
  name: string;
  overviewSheetId: string;
  shape: Pt[];             // polygon on the overview sheet
  detailSheetId: string;
}

export interface PayItem {
  id: string;
  jobId: string;
  itemNo: string;          // owner's item number
  subItemNo?: string;      // our subcontract number when the GC uses one
  specRef: string;         // FAA item, L-125, P-401, SP-105
  description: string;
  unit: string;            // EA, LF, LS, SY, AL, whatever the schedule says
  billingType: BillingType;
  unitPrice: number;
  bidQty: number;
  percentComplete?: number; // lump sum only
}

// A part can bill more than one pay item. The can bills when the part hits Set,
// the fixture bills when it hits Complete. Each link says which step triggers it.
export interface PayLink {
  payItemId: string;
  billAtStep: Step;
}

export interface Part {
  id: string;
  jobId: string;
  zoneId: string;
  label: string;           // fixture id off the plan
  category: PartCategory;
  kind: PartKind;
  work: WorkType;
  x?: number;              // percent on the detail sheet
  y?: number;
  totalQty?: number;       // linear parts, LF
  installPay: PayLink[];
  demoPay: PayLink[];
  installStep: Step;
  demoStep: Step;
  qtyDone?: number;        // linear, footage at the current step
  note?: string;
}

export interface StatusEvent {
  id: string;
  jobId: string;
  partId: string;
  ladder: Ladder;
  reportDate: string;      // YYYY-MM-DD
  foreman: string;
  fromStep: Step;
  toStep: Step;
  qtyDone?: number;
  note?: string;
  createdAt: number;
  billedIn?: string;       // rollup id once it's been pulled into a pay app
}

export const FLAG_REASONS = [
  'Conflict in the field', 'Damaged', 'Missing material',
  'Waiting on RFI', 'Waiting on inspection', 'Area not available', 'Other',
] as const;
export const FLAG_PARTIES = [
  'Internal', 'GC', 'Owner', 'Sub', 'Vendor', 'Equipment condition', 'Work area availability', 'Weather',
] as const;
export const FLAG_IMPACTS = [
  'No impact', 'Minor (under 1 day)', 'Moderate (1 to 3 days)', 'Major (3 plus days)',
] as const;

export interface Flag {
  id: string;
  jobId: string;
  partId?: string;
  zoneId?: string;
  reason: string;
  party: string;
  impact: string;
  openedBy: string;
  openedAt: number;
  closedAt?: number;
  note?: string;
}

export interface CrewMember {
  id: string;
  name: string;
  role: 'foreman' | 'internal' | 'sub' | 'temp';
}

export interface Equipment {
  id: string;
  jobId: string;
  name: string;
  unitNo?: string;
}

export interface Photo {
  id: string;
  jobId: string;
  reportDate: string;
  partId?: string;
  zoneId?: string;
  foreman: string;
  blob: Blob;
  caption?: string;
  createdAt: number;
}

export interface CrewBucket {
  names: string[];
  shiftStart: string;   // 06:00
  shiftEnd: string;     // 18:30
  lunchMinutes: number;
}

export interface DailyReport {
  id: string;            // jobId + date
  jobId: string;
  date: string;
  foremen: string[];
  crew: { internal: CrewBucket; sub: CrewBucket; temp: CrewBucket };
  equipmentIds: string[];
  weather: string[];
  tempF?: number;
  safety: string[];
  visitors: string[];
  plannedScope: string;
  plannedZoneIds: string[];
  actionPlan: string;
  nextZoneIds: string[];
  carryDone: string[];      // carryover item keys the foreman checked off in 1.5
  workNote: string;         // optional text under 1.2
  carryNote: string;        // optional text under 1.3
  delayNote: string;        // optional text under 1.4
  yardWork: { category: string; qty?: number; note?: string }[];
  executiveComment: string;
  submittedBy?: string;
  signature?: Blob;
  signedAt?: number;
  autodeskFormId?: string;
}

export interface Setting {
  key: string;
  value: string;
}
