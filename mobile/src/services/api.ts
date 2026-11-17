// The app's only door to data. In the prototype it answers from sample data
// with a short delay, like a network call. In Phase 4 each function calls the
// mobile API (/api/mobile/v1/...) instead; screens stay the same.

import * as sample from '@/data/sample';
import type {
  AbsenceNotice,
  AbsenceType,
  Announcement,
  AppNotification,
  Conversation,
  Family,
  OfficeRequest,
  QuickLink,
  SchoolDocument,
  SchoolEvent,
  VolunteerOpportunity,
  Wishlist,
} from '@/data/types';
import { isoDate } from '@/lib/dates';

import { answerQuestion, type AskContext } from './assistant';
import { getPrototypeOptions } from './prototype';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'offline' | 'not_found' | 'forbidden' | 'quota',
  ) {
    super(message);
  }
}

const DELAY_MS = 450;

// Mutable "server" state for the prototype.
const server = {
  absences: [...sample.initialAbsences],
  requests: sample.initialRequests.map((r) => ({ ...r, messages: [...r.messages] })),
  conversations: [] as Conversation[],
};

let counter = 100;
const newId = (prefix: string) => `${prefix}-${++counter}`;

async function respond<T>(value: () => T, opts: { list?: boolean } = {}): Promise<T> {
  const o = getPrototypeOptions();
  await new Promise((r) => setTimeout(r, DELAY_MS));
  if (o.offline) throw new ApiError("You're offline.", 'offline');
  if (o.failRequests) throw new ApiError("We couldn't load this.", 'network');
  const v = value();
  if (opts.list && o.emptyData) return [] as unknown as T;
  return v;
}

function found<T>(v: T | undefined): T {
  if (v === undefined) throw new ApiError('This item is no longer available.', 'not_found');
  return v;
}

export const api = {
  family: (): Promise<Family> => respond(() => sample.family),

  events: (): Promise<SchoolEvent[]> =>
    respond(() => [...sample.events].sort((a, b) => a.start.localeCompare(b.start)), { list: true }),
  event: (id: string) => respond(() => found(sample.events.find((e) => e.id === id))),

  announcements: (): Promise<Announcement[]> =>
    respond(() => [...sample.announcements].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), { list: true }),
  announcement: (id: string) => respond(() => found(sample.announcements.find((a) => a.id === id))),

  documents: (): Promise<SchoolDocument[]> => respond(() => sample.documents, { list: true }),
  document: (id: string) => respond(() => found(sample.documents.find((d) => d.id === id))),

  requests: (): Promise<OfficeRequest[]> =>
    respond(() => [...server.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), { list: true }),
  request: (id: string) => respond(() => found(server.requests.find((r) => r.id === id))),

  absences: (): Promise<AbsenceNotice[]> =>
    respond(() => [...server.absences].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), { list: true }),
  absence: (id: string) => respond(() => found(server.absences.find((a) => a.id === id))),

  volunteer: (): Promise<VolunteerOpportunity[]> => respond(() => sample.volunteer, { list: true }),
  wishlists: (): Promise<Wishlist[]> => respond(() => sample.wishlists, { list: true }),
  links: (): Promise<QuickLink[]> => respond(() => sample.quickLinks, { list: true }),
  notifications: (): Promise<AppNotification[]> => respond(() => sample.notifications, { list: true }),

  submitAbsence: (input: { childId: string; type: AbsenceType; dateFrom: string; dateTo: string; time?: string; reason: string }) =>
    respond(() => {
      const child = found(sample.children.find((c) => c.id === input.childId));
      if (!child.canReportAbsence) throw new ApiError("You can't report absences for this child.", 'forbidden');
      if (input.dateFrom < isoDate(new Date())) throw new ApiError('Choose today or a future date.', 'forbidden');
      const notice: AbsenceNotice = {
        id: newId('ab'),
        schoolId: child.schoolId,
        status: 'received',
        createdAt: new Date().toISOString(),
        ...input,
      };
      server.absences.unshift(notice);
      return notice;
    }),

  cancelAbsence: (id: string) =>
    respond(() => {
      const a = found(server.absences.find((x) => x.id === id));
      if (a.status === 'recorded' || a.status === 'cancelled') throw new ApiError('This report can no longer be cancelled.', 'forbidden');
      a.status = 'cancelled';
      return a;
    }),

  createRequest: (input: { schoolId: string; childId?: string; type: OfficeRequest['type']; subject: string; body: string }) =>
    respond(() => {
      const now = new Date().toISOString();
      const r: OfficeRequest = {
        id: newId('r'),
        schoolId: input.schoolId,
        childId: input.childId,
        type: input.type,
        subject: input.subject,
        status: 'received',
        createdAt: now,
        messages: [{ from: 'family', author: 'Ana Rivera', body: input.body, at: now }],
      };
      server.requests.unshift(r);
      return r;
    }),

  replyToRequest: (id: string, body: string) =>
    respond(() => {
      const r = found(server.requests.find((x) => x.id === id));
      if (r.status === 'closed') throw new ApiError('This request is closed.', 'forbidden');
      r.messages.push({ from: 'family', author: 'Ana Rivera', body, at: new Date().toISOString() });
      r.status = 'received';
      return r;
    }),

  conversations: (): Promise<Conversation[]> =>
    respond(() => [...server.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), { list: true }),
  conversation: (id: string) => respond(() => found(server.conversations.find((c) => c.id === id))),
  deleteConversation: (id: string) =>
    respond(() => {
      server.conversations = server.conversations.filter((c) => c.id !== id);
      return true;
    }),

  ask: (conversationId: string | null, text: string, context?: AskContext) =>
    respond(() => {
      if (getPrototypeOptions().askQuotaReached) throw new ApiError('Quota reached', 'quota');
      let convo = conversationId ? server.conversations.find((c) => c.id === conversationId) : undefined;
      if (!convo) {
        convo = { id: newId('c'), title: text.slice(0, 60), updatedAt: new Date().toISOString(), messages: [] };
        server.conversations.push(convo);
      }
      convo.messages.push({ id: newId('m'), role: 'user', text, contextTitle: context?.title });
      convo.messages.push({ id: newId('m'), ...answerQuestion(text, context) });
      convo.updatedAt = new Date().toISOString();
      return { ...convo, messages: [...convo.messages] };
    }),

  /** Sends or discards a draft the assistant proposed. Nothing is sent without this explicit step. */
  resolveDraft: (conversationId: string, messageId: string, action: 'send' | 'discard') =>
    respond(() => {
      const convo = found(server.conversations.find((c) => c.id === conversationId));
      const msg = convo.messages.find((m) => m.id === messageId);
      if (!msg || msg.role !== 'assistant' || !msg.draft || msg.draft.state !== 'pending') throw new ApiError('This draft is no longer available.', 'not_found');
      if (action === 'send') {
        const child = found(sample.children.find((c) => c.id === msg.draft!.childId));
        server.absences.unshift({
          id: newId('ab'),
          schoolId: child.schoolId,
          childId: child.id,
          type: msg.draft.type,
          dateFrom: msg.draft.dateFrom,
          dateTo: msg.draft.dateFrom,
          reason: msg.draft.reason,
          status: 'received',
          createdAt: new Date().toISOString(),
        });
      }
      msg.draft = { ...msg.draft, state: action === 'send' ? 'sent' : 'discarded' };
      return { ...convo, messages: [...convo.messages] };
    }),
};
