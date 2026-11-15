// Metered usage per school and calendar month (UTC), for plan limits.
// Counters only ever go up inside a period; a new month starts a new row.
import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './platform';

export const usageCounters = pgTable(
  'usage_counters',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    /** YYYY-MM */
    period: text('period').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.metric, t.period] })],
);
