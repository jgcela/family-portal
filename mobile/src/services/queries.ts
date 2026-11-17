// TanStack Query hooks: one per screen need. Caching, retries and refresh
// live here so screens only render.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAppState } from '@/state/app-state';

import { api } from './api';
import type { AskContext } from './assistant';

export const keys = {
  family: ['family'] as const,
  events: ['events'] as const,
  event: (id: string) => ['events', id] as const,
  announcements: ['announcements'] as const,
  announcement: (id: string) => ['announcements', id] as const,
  documents: ['documents'] as const,
  document: (id: string) => ['documents', id] as const,
  requests: ['requests'] as const,
  request: (id: string) => ['requests', id] as const,
  absences: ['absences'] as const,
  absence: (id: string) => ['absences', id] as const,
  volunteer: ['volunteer'] as const,
  wishlists: ['wishlists'] as const,
  links: ['links'] as const,
  notifications: ['notifications'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
};

/** Keeps only items of the selected school ("All schools" keeps everything). */
function useBySchool<T extends { schoolId: string }>(items: T[] | undefined): T[] | undefined {
  const { schoolFilter } = useAppState();
  return useMemo(() => (items && schoolFilter !== 'all' ? items.filter((i) => i.schoolId === schoolFilter) : items), [items, schoolFilter]);
}

function withFilter<T extends { schoolId: string }, Q extends { data: T[] | undefined }>(q: Q, data: T[] | undefined): Q {
  return { ...q, data } as Q;
}

export function useFamily() {
  return useQuery({ queryKey: keys.family, queryFn: api.family, staleTime: 10 * 60_000 });
}

export function useEvents() {
  const q = useQuery({ queryKey: keys.events, queryFn: api.events });
  return withFilter(q, useBySchool(q.data));
}
export const useEvent = (id: string) => useQuery({ queryKey: keys.event(id), queryFn: () => api.event(id) });

export function useAnnouncements() {
  const q = useQuery({ queryKey: keys.announcements, queryFn: api.announcements });
  return withFilter(q, useBySchool(q.data));
}
export const useAnnouncement = (id: string) => useQuery({ queryKey: keys.announcement(id), queryFn: () => api.announcement(id) });

export function useDocuments() {
  const q = useQuery({ queryKey: keys.documents, queryFn: api.documents });
  return withFilter(q, useBySchool(q.data));
}
export const useDocument = (id: string) => useQuery({ queryKey: keys.document(id), queryFn: () => api.document(id) });

export function useRequests() {
  const q = useQuery({ queryKey: keys.requests, queryFn: api.requests });
  return withFilter(q, useBySchool(q.data));
}
export const useRequest = (id: string) => useQuery({ queryKey: keys.request(id), queryFn: () => api.request(id) });

export function useAbsences() {
  const q = useQuery({ queryKey: keys.absences, queryFn: api.absences });
  return withFilter(q, useBySchool(q.data));
}
export const useAbsence = (id: string) => useQuery({ queryKey: keys.absence(id), queryFn: () => api.absence(id) });

export function useVolunteer() {
  const q = useQuery({ queryKey: keys.volunteer, queryFn: api.volunteer });
  return withFilter(q, useBySchool(q.data));
}
export function useWishlists() {
  const q = useQuery({ queryKey: keys.wishlists, queryFn: api.wishlists });
  return withFilter(q, useBySchool(q.data));
}
export function useLinks() {
  const q = useQuery({ queryKey: keys.links, queryFn: api.links });
  return withFilter(q, useBySchool(q.data));
}
export function useNotifications() {
  const q = useQuery({ queryKey: keys.notifications, queryFn: api.notifications });
  return withFilter(q, useBySchool(q.data));
}

export const useConversations = () => useQuery({ queryKey: keys.conversations, queryFn: api.conversations });
export const useConversation = (id: string | null) =>
  useQuery({ queryKey: keys.conversation(id ?? 'none'), queryFn: () => api.conversation(id!), enabled: !!id });

// ---------- Writes ----------

export function useSubmitAbsence() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.submitAbsence, onSuccess: () => qc.invalidateQueries({ queryKey: keys.absences }) });
}

export function useCancelAbsence() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.cancelAbsence, onSuccess: () => qc.invalidateQueries({ queryKey: keys.absences }) });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createRequest, onSuccess: () => qc.invalidateQueries({ queryKey: keys.requests }) });
}

export function useReplyToRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: string) => api.replyToRequest(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: keys.requests }) });
}

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversationId: string | null; text: string; context?: AskContext }) => api.ask(v.conversationId, v.text, v.context),
    onSuccess: (convo) => {
      qc.setQueryData(keys.conversation(convo.id), convo);
      void qc.invalidateQueries({ queryKey: keys.conversations, exact: true });
    },
  });
}

export function useResolveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversationId: string; messageId: string; action: 'send' | 'discard' }) => api.resolveDraft(v.conversationId, v.messageId, v.action),
    onSuccess: (convo) => {
      qc.setQueryData(keys.conversation(convo.id), convo);
      void qc.invalidateQueries({ queryKey: keys.absences });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.deleteConversation, onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }) });
}
