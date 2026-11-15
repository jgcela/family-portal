// SIS connectors: one small, read-only interface per student information system.
//
// The portal asks an SIS one thing today: "which children does this parent
// have?". Each connector says up front what it can do (CAPABILITIES below),
// and the admin screen shows exactly that list, so the portal never implies
// an integration it does not have. Connectors only use official APIs with
// credentials the school creates for the portal: no scraping, no family
// passwords, no unofficial sessions.

export type SisPerson = { personId: string; email: string | null };
export type SisChild = {
  studentId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  gradeLevel: string | null;
  /** False when the SIS says this parent must not act for the child (custody, no portal access). */
  canAct: boolean;
};

export interface SisConnector {
  /** One read that proves the credentials work. `note` is shown to staff (for example, "no parent records found"). */
  ping(): Promise<{ note?: string } | void>;
  /** The parent with exactly this email, or null when there is none or more than one. */
  findParentByEmail(email: string): Promise<SisPerson | null>;
  childrenOf(parentPersonId: string): Promise<SisChild[]>;
}

export class SisError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_configured' | 'unauthorized' | 'unavailable' | 'bad_response',
  ) {
    super(message);
    this.name = 'SisError';
  }
}

export type ProviderId = 'facts' | 'oneroster';
export type CapabilityId = 'family_children' | 'parent_sign_in' | 'attendance_write' | 'grades' | 'schedules';
export type CapabilityState = 'available' | 'not_available';

export const CAPABILITIES: { id: CapabilityId; label: string }[] = [
  { id: 'family_children', label: 'Show each family their own children (for absence notices, requests and the assistant)' },
  { id: 'parent_sign_in', label: 'Families sign in with their SIS account' },
  { id: 'attendance_write', label: 'Write absences into the SIS automatically' },
  { id: 'grades', label: 'Read grades' },
  { id: 'schedules', label: 'Read class schedules' },
];

export const PROVIDERS: Record<ProviderId, { name: string; systems: string; capabilities: Record<CapabilityId, CapabilityState>; verified: boolean }> = {
  facts: {
    name: 'FACTS SIS',
    systems: 'FACTS SIS (formerly RenWeb)',
    capabilities: { family_children: 'available', parent_sign_in: 'not_available', attendance_write: 'not_available', grades: 'not_available', schedules: 'not_available' },
    verified: false,
  },
  oneroster: {
    name: 'OneRoster',
    systems: 'PowerSchool, Infinite Campus, Skyward and other systems with a OneRoster 1.1 or 1.2 API',
    capabilities: { family_children: 'available', parent_sign_in: 'not_available', attendance_write: 'not_available', grades: 'not_available', schedules: 'not_available' },
    verified: false,
  },
};

type Json = Record<string, unknown>;

/** Field lookup that ignores case and underscores: personId, PersonID, person_id. */
export function field(o: Json, ...names: string[]): unknown {
  const want = names.map((n) => n.toLowerCase().replace(/_/g, ''));
  for (const [k, v] of Object.entries(o)) if (want.includes(k.toLowerCase().replace(/_/g, ''))) return v;
  return undefined;
}
export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/** Ids that can be put in a child key and a URL path. */
export const SIS_ID = /^[A-Za-z0-9_.-]{1,100}$/;
