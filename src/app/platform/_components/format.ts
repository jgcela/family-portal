export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const STATUS_LABEL: Record<string, string> = {
  onboarding: 'Setting up',
  active: 'Live',
  suspended: 'Suspended',
  archived: 'Archived',
};

export const SUB_LABEL: Record<string, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Canceled',
  comped: 'Free (comped)',
};

export const statusClass = (s: string) =>
  s === 'active' ? 'status status-published' : s === 'onboarding' ? 'status status-in_review' : s === 'suspended' ? 'status status-danger' : 'status status-archived';

export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
