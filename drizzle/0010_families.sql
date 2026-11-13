CREATE TYPE "public"."family_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "family_grades" (
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	CONSTRAINT "family_grades_membership_id_grade_id_pk" PRIMARY KEY("membership_id","grade_id")
);
--> statement-breakpoint
CREATE TABLE "family_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"grade_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "family_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "family_join_code" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visibility" "module_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "visibility" "module_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "visibility" "module_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "visibility" "module_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "family_grades" ADD CONSTRAINT "family_grades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_grades" ADD CONSTRAINT "family_grades_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_grades" ADD CONSTRAINT "family_grades_tenant_id_grade_id_grades_tenant_id_id_fk" FOREIGN KEY ("tenant_id","grade_id") REFERENCES "public"."grades"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_requests" ADD CONSTRAINT "family_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_requests" ADD CONSTRAINT "family_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_requests" ADD CONSTRAINT "family_requests_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_requests_pending_uq" ON "family_requests" USING btree ("tenant_id","user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "family_requests_status_idx" ON "family_requests" USING btree ("tenant_id","status");