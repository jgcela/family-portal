// Simulated assistant for the prototype. It answers a handful of questions
// from the sample data, always with sources, and says plainly when it has no
// verified answer. Phase 4 replaces it with the server's family assistant,
// which already enforces permissions, plan limits and sources.

import * as sample from '@/data/sample';
import type { AskMessage, Source } from '@/data/types';
import { dayLabel, isoDate, schoolDay, time } from '@/lib/dates';

export type AskContext = { type: 'announcement'; id: string; title: string };

type Answer = Omit<Extract<AskMessage, { role: 'assistant' }>, 'id'>;

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

function eventSource(id: string): Source {
  const e = sample.events.find((x) => x.id === id)!;
  return { type: 'event', id: e.id, title: e.title };
}

function docSource(id: string): Source {
  const d = sample.documents.find((x) => x.id === id)!;
  return { type: 'document', id: d.id, title: d.title };
}

export const suggestedQuestions = [
  "What time is Carmen's field trip?",
  'When is the next early dismissal?',
  'Where can I find the lunch menu?',
  'Who should I contact about attendance?',
];

export function answerQuestion(text: string, context?: AskContext): Answer {
  const q = text.toLowerCase();

  if (context?.type === 'announcement') {
    const a = sample.announcements.find((x) => x.id === context.id);
    if (a && has(q, 'bring', 'pack', 'need', 'what', 'summar')) {
      return {
        role: 'assistant',
        status: 'verified',
        text: `According to this announcement: ${a.body}`,
        sources: [{ type: 'announcement', id: a.id, title: a.title }],
        followUps: ['Add the field trip to my calendar', 'Report Carmen absent tomorrow'],
      };
    }
  }

  if (has(q, 'lucas', 'oak hill')) {
    return {
      role: 'assistant',
      status: 'not_found',
      text: "Oak Hill Academy doesn't use the assistant, so I can't answer questions about Lucas. You can contact Oak Hill directly from Family → Contact school.",
      sources: [],
      followUps: [],
    };
  }

  if (has(q, 'absent', 'sick', 'late', 'miss school', 'stay home')) {
    const child = sample.children.find((c) => q.includes(c.firstName.toLowerCase())) ?? sample.children[0]!;
    const tomorrow = q.includes('tomorrow');
    const day = schoolDay(tomorrow ? 1 : 0);
    const type = q.includes('late') ? 'late' : 'absent';
    return {
      role: 'assistant',
      status: 'verified',
      text: `I prepared an absence report for ${child.firstName} for ${dayLabel(day).toLowerCase()}. Review it and tap Send to the office. Nothing is sent until you confirm.`,
      sources: [docSource('d-handbook')],
      followUps: [],
      draft: { kind: 'absence', childId: child.id, type, dateFrom: isoDate(day), reason: q.includes('sick') ? 'Sick' : '', state: 'pending' },
    };
  }

  if (has(q, 'field trip', 'museum', 'trip')) {
    const e = sample.events.find((x) => x.id === 'e-trip')!;
    const start = new Date(e.start);
    return {
      role: 'assistant',
      status: 'verified',
      text: `Carmen's field trip to the Denver Museum of Nature & Science is ${dayLabel(start).toLowerCase()}. Students should arrive by ${time(start)} and pack a sack lunch and a water bottle. They return by 2:45 PM.`,
      sources: [eventSource('e-trip'), { type: 'announcement', id: 'a-trip', title: 'Field trip tomorrow: what to pack' }],
      followUps: ['Do I need a permission slip?', 'Who are the chaperones?'],
    };
  }

  if (has(q, 'early dismissal', 'early release', 'half day', 'dismissal')) {
    const e = sample.events.find((x) => x.id === 'e-early')!;
    const start = new Date(e.start);
    return {
      role: 'assistant',
      status: 'verified',
      text: `The next early dismissal at St. Mary is ${dayLabel(start)} at ${time(start)}. Extended care is open until 6 PM.`,
      sources: [eventSource('e-early')],
      followUps: ['When is the next day with no school?'],
    };
  }

  if (has(q, 'no school', 'break', 'thanksgiving', 'closed')) {
    const e = sample.events.find((x) => x.id === 'e-noschool')!;
    return {
      role: 'assistant',
      status: 'verified',
      text: `There is no school at St. Mary starting ${dayLabel(new Date(e.start))} for Thanksgiving break. Classes resume the following Monday.`,
      sources: [eventSource('e-noschool')],
      followUps: [],
    };
  }

  if (has(q, 'lunch', 'menu', 'food')) {
    return {
      role: 'assistant',
      status: 'verified',
      text: 'The lunch menu for this month is in Documents. Hot lunch is $4.50, and orders close on Thursdays in FACTS.',
      sources: [docSource('d-lunch')],
      followUps: [],
    };
  }

  if (has(q, 'contact', 'attendance', 'call', 'email', 'office')) {
    const s = sample.schools[0]!;
    return {
      role: 'assistant',
      status: 'verified',
      text: `For attendance at St. Mary, contact the front office at ${s.phone} or ${s.email}. Report an absence before 8:30 AM.`,
      sources: [{ type: 'contact', id: s.id, title: 'St. Mary contact information' }, docSource('d-handbook')],
      followUps: ['Report an absence'],
    };
  }

  if (has(q, 'uniform', 'dress')) {
    return {
      role: 'assistant',
      status: 'verified',
      text: 'Students wear their dress uniform on Mass days. The full rules are in the uniform guide.',
      sources: [docSource('d-uniform')],
      followUps: [],
    };
  }

  if (has(q, 'homework', 'grade', 'grades', 'report card')) {
    return {
      role: 'assistant',
      status: 'not_found',
      text: "I can't see homework or grades. Your school keeps them in FACTS. Open FACTS from Family → Quick links.",
      sources: [],
      followUps: [],
    };
  }

  return {
    role: 'assistant',
    status: 'not_found',
    text: "I couldn't find this in your school's information. You can ask the office directly.",
    sources: [],
    followUps: ['Send a question to the office'],
  };
}
