import type { Tx } from '../db/client';
import { auditLogs } from '../db/schema';

export type AuditEntry = {
  tenantId: string | null;
  actorUserId: string | null;
  actorKind?: 'user' | 'platform' | 'support' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Writes an audit entry inside the caller's transaction (so it commits or rolls back with the change). */
export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: e.tenantId,
    actorUserId: e.actorUserId,
    actorKind: e.actorKind ?? 'user',
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata ?? {},
    ip: e.ip ?? null,
  });
}
