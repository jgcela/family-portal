// Data contracts for the mobile app. In the prototype they are filled with
// sample data (src/data/sample.ts). In Phase 4 the same shapes come from the
// mobile API, so screens do not change.

export type Plan = 'essential' | 'smart' | 'autonomous';

export type School = {
  id: string;
  name: string;
  shortName: string;
  primary: string;
  accent: string;
  radius: 'sharp' | 'soft' | 'round';
  plan: Plan;
  /** The school turned on the family assistant (only counts on plans with AI). */
  assistantEnabled: boolean;
  phone: string;
  email: string;
  address: string;
  officeHours: string;
  attendanceContact: string;
};

export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  schoolId: string;
  canReportAbsence: boolean;
};

export type SchoolEvent = {
  id: string;
  schoolId: string;
  title: string;
  /** ISO date-time; for all-day events, the day at 00:00 local time. */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  /** Children this event is for; empty means the whole school. */
  childIds: string[];
  category: 'event' | 'no-school' | 'early-dismissal' | 'trip' | 'mass' | 'meeting';
  description: string;
  cancelled?: boolean;
  links?: { title: string; url: string }[];
};

export type Announcement = {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  publishedAt: string;
  important: boolean;
  attachmentIds: string[];
};

export type SchoolDocument = {
  id: string;
  schoolId: string;
  title: string;
  category: string;
  updatedAt: string;
  pages: number;
  excerpt: string;
};

export type RequestMessage = { from: 'family' | 'school'; author: string; body: string; at: string };

export type RequestStatus = 'received' | 'in_review' | 'answered' | 'closed';

export type OfficeRequest = {
  id: string;
  schoolId: string;
  childId?: string;
  type: 'General question' | 'Pickup change' | 'Records request' | 'Other';
  subject: string;
  status: RequestStatus;
  createdAt: string;
  messages: RequestMessage[];
};

export type AbsenceType = 'absent' | 'late' | 'early_pickup';
export type AbsenceStatus = 'received' | 'in_review' | 'recorded' | 'cancelled';

export type AbsenceNotice = {
  id: string;
  schoolId: string;
  childId: string;
  type: AbsenceType;
  dateFrom: string;
  dateTo: string;
  time?: string;
  reason: string;
  status: AbsenceStatus;
  createdAt: string;
};

export type VolunteerOpportunity = {
  id: string;
  schoolId: string;
  title: string;
  date: string;
  spotsLeft: number;
  description: string;
};

export type Wishlist = { id: string; schoolId: string; name: string; role: string; items: string[] };

export type QuickLink = { id: string; schoolId: string; title: string; description: string; url: string };

export type AppNotification = {
  id: string;
  schoolId: string;
  kind: 'announcement' | 'urgent' | 'absence' | 'request' | 'calendar';
  /** Lock-screen text: school and kind only, never a child's name. */
  title: string;
  at: string;
  target: { type: 'announcement' | 'absence' | 'request' | 'event'; id: string };
};

export type Source =
  | { type: 'event'; id: string; title: string }
  | { type: 'announcement'; id: string; title: string }
  | { type: 'document'; id: string; title: string }
  | { type: 'contact'; id: string; title: string };

export type AskDraft = {
  kind: 'absence';
  childId: string;
  type: AbsenceType;
  dateFrom: string;
  reason: string;
  state: 'pending' | 'sent' | 'discarded';
};

export type AskMessage =
  | { id: string; role: 'user'; text: string; contextTitle?: string }
  | {
      id: string;
      role: 'assistant';
      status: 'verified' | 'not_found' | 'error';
      text: string;
      sources: Source[];
      followUps: string[];
      draft?: AskDraft;
    };

export type Conversation = { id: string; title: string; updatedAt: string; messages: AskMessage[] };

export type Family = {
  greetingName: string;
  email: string;
  schools: School[];
  children: Child[];
};
