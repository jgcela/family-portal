CREATE TYPE "public"."directory_source" AS ENUM('none', 'manual', 'facts');--> statement-breakpoint
CREATE TYPE "public"."directory_status" AS ENUM('not_configured', 'connected', 'error');--> statement-breakpoint
CREATE TABLE "directory_blocks" (
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"student_key" text NOT NULL,
	"note" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_blocks_membership_id_student_key_pk" PRIMARY KEY("membership_id","student_key")
);
--> statement-breakpoint
CREATE TABLE "directory_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"source" "directory_source" DEFAULT 'none' NOT NULL,
	"facts_api_key_enc" text,
	"facts_api_key_hint" text,
	"facts_status" "directory_status" DEFAULT 'not_configured' NOT NULL,
	"facts_checked_at" timestamp with time zone,
	"facts_last_error" text,
	"grade_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sis_person_links" (
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"person_id" text NOT NULL,
	"matched_by" text NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sis_person_links_membership_id_provider_pk" PRIMARY KEY("membership_id","provider")
);
--> statement-breakpoint
DROP INDEX "attendance_notices_student_idx";--> statement-breakpoint
ALTER TABLE "attendance_notices" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD COLUMN "student_key" text;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD COLUMN "student_name" text;--> statement-breakpoint
ALTER TABLE "attendance_notices" ADD COLUMN "grade_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "student_key" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "student_name" text;--> statement-breakpoint
-- Existing notices and requests all refer to the manual list: copy the name and grade they had.
UPDATE "attendance_notices" n SET "student_key" = 'manual:' || s."id", "student_name" = coalesce(nullif(s."preferred_name", ''), s."first_name") || ' ' || s."last_name", "grade_id" = s."grade_id"
  FROM "students" s WHERE s."id" = n."student_id";--> statement-breakpoint
UPDATE "inbox_items" i SET "student_key" = 'manual:' || s."id", "student_name" = coalesce(nullif(s."preferred_name", ''), s."first_name") || ' ' || s."last_name"
  FROM "students" s WHERE s."id" = i."student_id";--> statement-breakpoint
ALTER TABLE "attendance_notices" ALTER COLUMN "student_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_notices" ALTER COLUMN "student_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "directory_blocks" ADD CONSTRAINT "directory_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_blocks" ADD CONSTRAINT "directory_blocks_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_blocks" ADD CONSTRAINT "directory_blocks_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_settings" ADD CONSTRAINT "directory_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_settings" ADD CONSTRAINT "directory_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sis_person_links" ADD CONSTRAINT "sis_person_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sis_person_links" ADD CONSTRAINT "sis_person_links_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sis_person_links_person_idx" ON "sis_person_links" USING btree ("tenant_id","provider","person_id");--> statement-breakpoint
CREATE INDEX "attendance_notices_student_idx" ON "attendance_notices" USING btree ("tenant_id","student_key","date_from");--> statement-breakpoint
-- Schools that already loaded students keep using their list; everyone else starts with no source.
INSERT INTO "directory_settings" ("tenant_id", "source")
  SELECT DISTINCT "tenant_id", 'manual'::"directory_source" FROM "students" ON CONFLICT DO NOTHING;