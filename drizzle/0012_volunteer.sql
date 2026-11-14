CREATE TABLE "volunteer_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"organizer" text,
	"location" text,
	"schedule" text,
	"commitment" text,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"visibility" "module_visibility" DEFAULT 'families' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "volunteer_list_idx" ON "volunteer_opportunities" USING btree ("tenant_id","status","sort_order");--> statement-breakpoint
CREATE INDEX "volunteer_audiences_idx" ON "volunteer_opportunities" USING gin ("audience_ids");