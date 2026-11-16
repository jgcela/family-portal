import { children, schools } from '@/data/sample';
import type { AbsenceStatus, AbsenceType, Child, RequestStatus, School, SchoolEvent } from '@/data/types';

import { dayLabel, fromIsoDate, time } from './dates';

// Phase 4: these read from the family query instead of the sample module.
export const schoolById = (id: string): School | undefined => schools.find((s) => s.id === id);
export const childById = (id: string): Child | undefined => children.find((c) => c.id === id);

export const absenceTypeLabel: Record<AbsenceType, string> = {
  absent: 'Absent',
  late: 'Late arrival',
  early_pickup: 'Early pickup',
};

export const absenceStatusLabel: Record<AbsenceStatus, string> = {
  received: 'Received',
  in_review: 'In review',
  recorded: 'Recorded',
  cancelled: 'Cancelled',
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  received: 'Waiting for the school',
  in_review: 'In review',
  answered: 'Answered',
  closed: 'Closed',
};

export function eventWhen(e: SchoolEvent): string {
  const start = new Date(e.start);
  const end = new Date(e.end);
  if (e.allDay) {
    return e.start.slice(0, 10) === e.end.slice(0, 10) ? `${dayLabel(start)}, all day` : `${dayLabel(start)} to ${dayLabel(end)}`;
  }
  return e.start === e.end ? `${dayLabel(start)}, ${time(start)}` : `${dayLabel(start)}, ${time(start)} – ${time(end)}`;
}

export function absenceWhen(a: { dateFrom: string; dateTo: string; time?: string }): string {
  const from = dayLabel(fromIsoDate(a.dateFrom));
  const range = a.dateFrom === a.dateTo ? from : `${from} to ${dayLabel(fromIsoDate(a.dateTo))}`;
  return a.time ? `${range}, ${a.time}` : range;
}

/** Who an event is for, in words: "Carmen", "Carmen and Javier" or "St. Mary". */
export function eventAudience(e: SchoolEvent): string {
  if (e.childIds.length === 0) return schoolById(e.schoolId)?.shortName ?? '';
  const names = e.childIds.map((id) => childById(id)?.firstName).filter(Boolean);
  return names.join(' and ');
}
