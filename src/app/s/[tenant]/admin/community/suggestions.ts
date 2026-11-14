import type { CommunityRow } from '@/server/services/community';

/** Groups and detail labels already in use, offered as suggestions in the form. */
export function suggestions(rows: CommunityRow[]) {
  const groups = [...new Set(rows.map((r) => r.groupName).filter((g): g is string => !!g))];
  const labels = [...new Set(rows.flatMap((r) => r.details.map((d) => d.label)))];
  return { groups, labels };
}
