CREATE TABLE "usage_counters" (
	"tenant_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_tenant_id_metric_period_pk" PRIMARY KEY("tenant_id","metric","period")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "implementation_cents" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "limit_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;