CREATE TYPE "public"."ai_channel" AS ENUM('sandbox', 'portal', 'family_assistant');--> statement-breakpoint
CREATE TYPE "public"."ai_outcome" AS ENUM('answered', 'no_answer', 'search_only', 'blocked', 'error');--> statement-breakpoint
CREATE TYPE "public"."knowledge_index_status" AS ENUM('waiting', 'indexed', 'failed', 'unsupported', 'live');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_kind" AS ENUM('document', 'page', 'announcement', 'calendar', 'volunteer', 'faq', 'text');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_status" AS ENUM('pending', 'approved', 'removed');--> statement-breakpoint
CREATE TABLE "ai_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel" "ai_channel" NOT NULL,
	"viewer_kind" text NOT NULL,
	"user_id" text,
	"ip_hash" text,
	"question" text,
	"answer" text,
	"outcome" "ai_outcome" NOT NULL,
	"topic" text DEFAULT 'unknown' NOT NULL,
	"source_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"cited_source_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"feedback" text,
	"escalated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"families_enabled" boolean DEFAULT false NOT NULL,
	"public_enabled" boolean DEFAULT false NOT NULL,
	"escalation_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retention_days" integer DEFAULT 180 NOT NULL,
	"store_question_text" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"visibility" "module_visibility" DEFAULT 'public' NOT NULL,
	"audience_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', content), 'B')) STORED NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "knowledge_source_kind" NOT NULL,
	"ref_id" uuid,
	"title" text NOT NULL,
	"topic" text DEFAULT 'general' NOT NULL,
	"url" text,
	"body" text,
	"status" "knowledge_source_status" DEFAULT 'pending' NOT NULL,
	"authoritative" boolean DEFAULT false NOT NULL,
	"effective_date" date,
	"review_by" date,
	"visibility" "module_visibility" DEFAULT 'public' NOT NULL,
	"audience_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"index_status" "knowledge_index_status" DEFAULT 'waiting' NOT NULL,
	"index_error" text,
	"content_hash" text,
	"content_updated_at" timestamp with time zone,
	"indexed_at" timestamp with time zone,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sources_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "ai_questions" ADD CONSTRAINT "ai_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_questions" ADD CONSTRAINT "ai_questions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_id_source_id_knowledge_sources_tenant_id_id_fk" FOREIGN KEY ("tenant_id","source_id") REFERENCES "public"."knowledge_sources"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_questions_created_idx" ON "ai_questions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_questions_user_idx" ON "ai_questions" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_source_idx" ON "knowledge_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_ref_uq" ON "knowledge_sources" USING btree ("tenant_id","kind","ref_id") WHERE ref_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_singleton_uq" ON "knowledge_sources" USING btree ("tenant_id","kind") WHERE kind IN ('calendar', 'volunteer');--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_idx" ON "knowledge_sources" USING btree ("tenant_id","status");