CREATE TYPE "public"."attendance_reason" AS ENUM('illness', 'medical_appointment', 'family', 'other');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('draft', 'submitted', 'received', 'pending_review', 'approved', 'rejected', 'sis_sync_pending', 'sis_synced', 'sync_failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attendance_type" AS ENUM('absent', 'late', 'early_dismissal');--> statement-breakpoint
CREATE TYPE "public"."guardian_access" AS ENUM('active', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."inbox_event_kind" AS ENUM('created', 'status', 'assigned', 'priority', 'note', 'reply', 'escalated', 'automation');--> statement-breakpoint
CREATE TYPE "public"."inbox_kind" AS ENUM('attendance', 'question', 'request');--> statement-breakpoint
CREATE TYPE "public"."inbox_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('new', 'in_progress', 'waiting', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger" AS ENUM('attendance_notice', 'family_question', 'office_request');--> statement-breakpoint
CREATE TABLE "attendance_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" "attendance_type" NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"time" text,
	"reason" "attendance_reason" NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" "attendance_status" DEFAULT 'submitted' NOT NULL,
	"idempotency_key" text NOT NULL,
	"inbox_item_id" uuid,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"sis_recorded_manually_at" timestamp with time zone,
	"sis_recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "inbox_event_kind" NOT NULL,
	"actor_user_id" text,
	"actor_kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"from_value" text,
	"to_value" text,
	"visible_to_family" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" "inbox_kind" NOT NULL,
	"status" "inbox_status" DEFAULT 'new' NOT NULL,
	"priority" "inbox_priority" DEFAULT 'normal' NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"requester_user_id" text,
	"requester_membership_id" uuid,
	"student_id" uuid,
	"grade_id" uuid,
	"assignee_user_id" text,
	"workflow_id" uuid,
	"due_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"automated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_items_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "inbox_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"relationship" text DEFAULT 'Parent/guardian' NOT NULL,
	"access" "guardian_access" DEFAULT 'active' NOT NULL,
	"can_submit_attendance" boolean DEFAULT true NOT NULL,
	"can_view_student" boolean DEFAULT true NOT NULL,
	"restriction_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_student_id_membership_id_pk" PRIMARY KEY("student_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
	"grade_id" uuid,
	"external_id" text,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"name" text NOT NULL,
	"trigger" "workflow_trigger" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_sis_recorded_by_user_id_user_id_fk" FOREIGN KEY ("sis_recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_tenant_id_student_id_students_tenant_id_id_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD CONSTRAINT "attendance_notices_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_tenant_id_item_id_inbox_items_tenant_id_id_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."inbox_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_tenant_id_student_id_students_tenant_id_id_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_views" ADD CONSTRAINT "inbox_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_views" ADD CONSTRAINT "inbox_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_templates" ADD CONSTRAINT "reply_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_templates" ADD CONSTRAINT "reply_templates_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_tenant_id_student_id_students_tenant_id_id_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_grade_id_grades_tenant_id_id_fk" FOREIGN KEY ("tenant_id","grade_id") REFERENCES "public"."grades"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_notices_idem_uq" ON "attendance_notices" USING btree ("tenant_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "attendance_notices_student_idx" ON "attendance_notices" USING btree ("tenant_id","student_id","date_from");--> statement-breakpoint
CREATE INDEX "attendance_notices_status_idx" ON "attendance_notices" USING btree ("tenant_id","status","date_from");--> statement-breakpoint
CREATE INDEX "inbox_events_item_idx" ON "inbox_events" USING btree ("tenant_id","item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_number_uq" ON "inbox_items" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "inbox_items_status_idx" ON "inbox_items" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "inbox_items_requester_idx" ON "inbox_items" USING btree ("tenant_id","requester_user_id");--> statement-breakpoint
CREATE INDEX "inbox_views_user_idx" ON "inbox_views" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "student_guardians_member_idx" ON "student_guardians" USING btree ("tenant_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_external_uq" ON "students" USING btree ("tenant_id","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "students_grade_idx" ON "students" USING btree ("tenant_id","grade_id");--> statement-breakpoint
CREATE INDEX "workflows_trigger_idx" ON "workflows" USING btree ("tenant_id","trigger","sort_order");