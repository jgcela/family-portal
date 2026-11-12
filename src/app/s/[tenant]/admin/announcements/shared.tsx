import Link from 'next/link';
import { getModuleState } from '@/server/services/modules';

export async function ModuleGate({ tenantId, base, moduleId, name, children }: { tenantId: string; base: string; moduleId: string; name: string; children: React.ReactNode }) {
  const state = await getModuleState(tenantId);
  if (state.active.some((m) => m.id === moduleId)) return <>{children}</>;
  return (
    <div className="notice">
      {name} is turned off for your school. Turn it on in the <Link href={`${base}/admin/modules`}>Module Manager</Link>.
    </div>
  );
}

/** Instant → value for <input type="datetime-local"> in the school's zone. */
export function toLocalInput(d: Date | null, tz: string): string {
  if (!d) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatInstant(d: Date | null, tz: string) {
  return d ? new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(d) : '—';
}
